import { appendFileSync, existsSync, mkdirSync, readdirSync, readlinkSync, symlinkSync, unlinkSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { inspect } from "node:util";
import { JWT } from "google-auth-library";
import { descifrarConfiguracion } from "../src/lib/config/encryption";
import { db } from "../src/lib/db";
import { cargarCredencialesLegacyGoogleWorkspace } from "../src/modules/configuracion/google-workspace.service";
import { resincronizarCohostsReunionesExistentes } from "../src/modules/configuracion/resincronizar-cohosts.service";
import { crearGoogleCalendarProvider } from "../src/modules/meet/google-calendar.adapter";

const jsonOutput = process.argv.includes("--json");
const explicitLogDir = process.argv.find((arg) => arg.startsWith("--log-dir="))?.split("=", 2)[1];
const startedAt = new Date();
const stamp = startedAt.toISOString().replace(/[:.]/g, "-");
const logDir = chooseLogDir(explicitLogDir);
const logFile = join(logDir, `resync-cohosts-${stamp}.log`);
const latestLog = join(logDir, "resync-cohosts-latest.log");

const MEET_SCOPES = [
  "https://www.googleapis.com/auth/meetings.space.settings",
  "https://www.googleapis.com/auth/meetings.space.readonly",
  "https://www.googleapis.com/auth/meetings.space.created",
] as const;
const MEET_API = "https://meet.googleapis.com/v2";
const GOOGLE_HTTP_TIMEOUT_MS = 60_000;

type ServiceCredential = Readonly<{
  label: "PRINCIPAL" | "LEGACY";
  serviceAccountEmail: string;
  privateKey: string;
  serviceAccountSubject: string | null;
}>;

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
      select: { id: true, serviceAccountEmail: true, privateKeyCifrada: true, serviceAccountSubject: true },
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
        `  - ${legacy.serviceAccountEmail ?? legacy.id}${legacy.privateKeyCifrada ? " [clave configurada]" : " [sin clave]"} | subject=${legacy.serviceAccountSubject ?? "fallback host"}`,
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

  if (result.errores.length > 0) {
    await diagnosticarCredencialesEnReunionesFallidas(result.errores.map((item) => item.instanciaSalaId));
  }

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

async function diagnosticarCredencialesEnReunionesFallidas(instanciaIds: readonly string[]): Promise<void> {
  const principal = await db.configuracionGoogleWorkspace.findUnique({
    where: { id: "principal", activa: true },
  });
  const legacyRows = await cargarCredencialesLegacyGoogleWorkspace(db, descifrarConfiguracion);
  const credentials: ServiceCredential[] = [];

  if (principal?.serviceAccountEmail && principal.privateKeyCifrada) {
    try {
      credentials.push({
        label: "PRINCIPAL",
        serviceAccountEmail: principal.serviceAccountEmail,
        privateKey: descifrarConfiguracion(principal.privateKeyCifrada),
        serviceAccountSubject: null,
      });
    } catch (error) {
      console.error(`DIAGNOSTICO CREDENCIAL PRINCIPAL | no se pudo descifrar la clave | ${summarizeError(error)}`);
    }
  }
  for (const legacy of legacyRows) {
    credentials.push({
      label: "LEGACY",
      serviceAccountEmail: legacy.serviceAccountEmail,
      privateKey: legacy.privateKey,
      serviceAccountSubject: legacy.serviceAccountSubject,
    });
  }

  if (credentials.length === 0) {
    console.error("DIAGNOSTICO CREDENCIALES | no hay credenciales utilizables.");
    return;
  }

  const meetings = await db.instanciaSala.findMany({
    where: { id: { in: [...new Set(instanciaIds)] } },
    select: {
      id: true,
      solicitud: { select: { titulo: true } },
      eventosProveedor: {
        where: { proveedor: { tipo: "GOOGLE_MEET" } },
        take: 1,
        select: {
          codigoReunion: true,
          cuentaProveedor: { select: { emailOrganizador: true } },
        },
      },
    },
  });

  const uniqueMeetings = new Map<string, { titulo: string; codigoReunion: string; host: string }>();
  for (const meeting of meetings) {
    const event = meeting.eventosProveedor[0];
    const codigoReunion = event?.codigoReunion?.trim();
    const host = event?.cuentaProveedor?.emailOrganizador?.trim().toLowerCase();
    if (!codigoReunion || !host) continue;
    uniqueMeetings.set(`${codigoReunion}|${host}`, {
      titulo: meeting.solicitud.titulo,
      codigoReunion,
      host,
    });
  }

  console.error(`DIAGNOSTICO CREDENCIALES | ${uniqueMeetings.size} espacios Meet únicos con error; prueba de lectura solamente.`);
  for (const meeting of uniqueMeetings.values()) {
    console.error(`DIAGNOSTICO MEET | ${meeting.titulo} | meet=${meeting.codigoReunion} | host=${meeting.host}`);
    for (const credential of credentials) {
      const subject = meeting.host;
      const outcome = await probarAccesoMembers(credential, subject, meeting.codigoReunion);
      console.error(
        `DIAGNOSTICO ${credential.label} | cuenta=${credential.serviceAccountEmail} | subject=${subject} | meet=${meeting.codigoReunion} | ${outcome}`,
      );
    }
  }
}

async function probarAccesoMembers(
  credential: ServiceCredential,
  subject: string,
  codigoReunion: string,
): Promise<string> {
  const auth = new JWT({
    email: credential.serviceAccountEmail,
    key: credential.privateKey,
    scopes: [...MEET_SCOPES],
    subject,
  });

  try {
    const space = await auth.request<{ name?: string }>({
      url: `${MEET_API}/spaces/${encodeURIComponent(codigoReunion)}`,
      method: "GET",
      timeout: GOOGLE_HTTP_TIMEOUT_MS,
    });
    if (!space.data.name) return "SPACE=ERROR Google no devolvió el nombre del espacio";

    await auth.request({
      url: `${MEET_API}/${space.data.name}/members?pageSize=1`,
      method: "GET",
      timeout: GOOGLE_HTTP_TIMEOUT_MS,
    });
    return "SPACE=OK MEMBERS=OK";
  } catch (error) {
    const status = statusFromError(error);
    return `ERROR status=${status ?? "?"} ${summarizeError(error)}`;
  }
}

function statusFromError(error: unknown): unknown {
  if (!error || typeof error !== "object") return undefined;
  const candidate = error as { code?: unknown; response?: { status?: unknown } };
  return candidate.response?.status ?? candidate.code;
}

function summarizeError(error: unknown): string {
  if (error instanceof Error) return error.message.replace(/\s+/g, " ").trim();
  return String(error).replace(/\s+/g, " ").trim();
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
