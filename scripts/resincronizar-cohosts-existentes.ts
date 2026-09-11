import { appendFileSync, existsSync, mkdirSync, readdirSync, readlinkSync, symlinkSync, unlinkSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { inspect } from "node:util";
import { descifrarConfiguracion } from "../src/lib/config/encryption";
import { db } from "../src/lib/db";
import { resincronizarCohostsReunionesExistentes } from "../src/modules/configuracion/resincronizar-cohosts.service";
import { crearGoogleCalendarProvider } from "../src/modules/meet/google-calendar.adapter";

const jsonOutput = process.argv.includes("--json");
const explicitLogDir = process.argv.find((arg) => arg.startsWith("--log-dir="))?.split("=", 2)[1];
const startedAt = new Date();
const stamp = startedAt.toISOString().replace(/[:.]/g, "-");
const logDir = chooseLogDir(explicitLogDir);
const logFile = join(logDir, `resync-cohosts-${stamp}.log`);
const latestLog = join(logDir, "resync-cohosts-latest.log");

rotateOldLogs(logDir, 30);
try {
  if (existsSync(latestLog) || safeReadlink(latestLog)) unlinkSync(latestLog);
} catch {
  // Si el enlace anterior está roto o no se puede leer, se reemplaza abajo cuando sea posible.
}
try {
  symlinkSync(basename(logFile), latestLog);
} catch {
  // El log individual sigue siendo válido aunque no pueda crearse el enlace latest.
}

const original = {
  log: console.log.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

function formatValue(value: unknown): string {
  if (typeof value === "string") return value;
  return inspect(value, { depth: 6, colors: false, breakLength: 160 });
}

function persist(level: "INFO" | "WARN" | "ERROR", values: readonly unknown[]): void {
  appendFileSync(
    logFile,
    `[${new Date().toISOString()}] ${level} ${values.map(formatValue).join(" ")}\n`,
    { encoding: "utf8" },
  );
}

console.log = (...values: unknown[]) => {
  persist("INFO", values);
  original.log(...values);
};
console.info = (...values: unknown[]) => {
  persist("INFO", values);
  original.info(...values);
};
console.warn = (...values: unknown[]) => {
  persist("WARN", values);
  original.warn(...values);
};
console.error = (...values: unknown[]) => {
  persist("ERROR", values);
  original.error(...values);
};

async function main(): Promise<void> {
  console.error(`Log: ${logFile}`);
  console.error(`Inicio: ${startedAt.toISOString()}`);

  const [principal, legacies] = await Promise.all([
    db.configuracionGoogleWorkspace.findUnique({
      where: { id: "principal" },
      select: { serviceAccountEmail: true, activa: true, privateKeyCifrada: true },
    }),
    db.configuracionGoogleWorkspace.findMany({
      where: { id: { startsWith: "legacy:" }, activa: true },
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      select: { id: true, serviceAccountEmail: true, privateKeyCifrada: true },
    }),
  ]);

  console.error(
    "Credencial PRINCIPAL:",
    principal?.serviceAccountEmail ?? "NO CONFIGURADA",
    principal?.activa && principal.privateKeyCifrada ? "[activa, clave configurada]" : "[incompleta/inactiva]",
  );
  if (legacies.length === 0) {
    console.error("Credenciales LEGACY activas: ninguna");
  } else {
    console.error(`Credenciales LEGACY activas: ${legacies.length}`);
    for (const legacy of legacies) {
      console.error(
        `  - ${legacy.serviceAccountEmail ?? legacy.id}${legacy.privateKeyCifrada ? " [clave configurada]" : " [sin clave]"}`,
      );
    }
  }

  const result = await resincronizarCohostsReunionesExistentes({
    db,
    descifrar: descifrarConfiguracion,
    crearProvider: crearGoogleCalendarProvider,
    onLog(event) {
      if (event.level === "ERROR") console.error(event.message);
      else if (event.level === "WARN") console.warn(event.message);
      else console.info(event.message);
    },
  });

  if (jsonOutput) {
    original.log(JSON.stringify(result, null, 2));
    persist("INFO", ["Resultado JSON:", result]);
    console.error(`Fin: ${new Date().toISOString()}`);
    console.error(`Log guardado en: ${logFile}`);
    return;
  }

  console.log("=== Resincronización de cohosts Google Meet ===");
  console.log(`Reuniones activas:       ${result.reunionesActivas}`);
  console.log(`Candidatas:              ${result.candidatas}`);
  console.log(`Cohosts agregados:       ${result.cohostsAgregados}`);
  console.log(`Sincronizadas:           ${result.sincronizadas}`);
  console.log(`Omitidas:                ${result.omitidas}`);
  console.log(`Con error:               ${result.fallidas}`);
  console.log();
  console.log(result.message);

  if (result.errores.length > 0) {
    console.log();
    console.log("=== Errores ===");
    for (const item of result.errores) {
      console.log(`- ${item.titulo}`);
      console.log(`  ${new Date(item.inicio).toLocaleString("es-UY", { timeZone: "America/Montevideo" })}`);
      console.log(`  ${item.error}`);
      console.log(`  instanciaSalaId=${item.instanciaSalaId}`);
    }
  }

  console.error(`Fin: ${new Date().toISOString()}`);
  console.error(`Log guardado en: ${logFile}`);
}

function chooseLogDir(explicit?: string): string {
  const candidates = explicit
    ? [resolve(explicit)]
    : [
        "/srv/apps/salavirtual-flacso/shared/logs",
        resolve(process.cwd(), "logs"),
      ];

  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      mkdirSync(candidate, { recursive: true });
      const probe = join(candidate, `.resync-write-test-${process.pid}`);
      appendFileSync(probe, "ok", { encoding: "utf8" });
      unlinkSync(probe);
      return candidate;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("No hay un directorio escribible para los logs.");
}

function safeReadlink(path: string): string | null {
  try {
    return readlinkSync(path);
  } catch {
    return null;
  }
}

function rotateOldLogs(directory: string, retentionDays: number): void {
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  for (const name of readdirSync(directory)) {
    if (!/^resync-cohosts-\d{4}-\d{2}-\d{2}T.*\.log$/.test(name)) continue;
    const match = name.match(/^resync-cohosts-(.+)\.log$/);
    if (!match) continue;
    const parsed = new Date(match[1].replace(/-(\d{2})-(\d{2})-(\d{3})Z$/, ":$1:$2.$3Z"));
    if (!Number.isNaN(parsed.getTime()) && parsed.getTime() < cutoff) {
      try {
        unlinkSync(join(directory, name));
      } catch {
        // La limpieza nunca debe impedir la resincronización.
      }
    }
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
