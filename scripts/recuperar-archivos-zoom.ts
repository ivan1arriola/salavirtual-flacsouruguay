/**
 * Recuperación histórica de archivos de Zoom.
 *   npm run zoom:archivos:historico:dry -- --desde 2026-01-01 --hasta 2026-10-31 [--anfitrion <id>]...
 *   npm run zoom:archivos:historico     -- --desde ... --hasta ... --apply      # encola (el worker transfiere)
 * Sin --apply solo lee de Zoom: no escribe en la base ni transfiere nada. Revisar el resumen antes de aplicar.
 */
import { db } from "../src/lib/db";
import { solicitarRecuperacionZoom } from "../src/bootstrap/zoom-historico.server";

function leerArgumentos(argv: readonly string[]) {
  const anfitrionIds: string[] = [];
  let desde: string | null = null;
  let hasta: string | null = null;
  let apply = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") {
      apply = true;
    } else if (a === "--desde") {
      desde = argv[++i] ?? null;
    } else if (a === "--hasta") {
      hasta = argv[++i] ?? null;
    } else if (a === "--anfitrion") {
      const v = argv[++i];
      if (v) {
        anfitrionIds.push(v);
      }
    } else {
      throw new Error(`Argumento desconocido: ${a}`);
    }
  }
  if (!desde || !hasta) {
    throw new Error("Indicar --desde YYYY-MM-DD y --hasta YYYY-MM-DD (el periodo es explícito).");
  }
  return { anfitrionIds, desde, hasta, apply };
}

async function main(): Promise<number> {
  const { anfitrionIds, desde, hasta, apply } = leerArgumentos(process.argv.slice(2));
  // El script lo ejecuta quien administra el servidor: actúa como administración.
  const resumen = await solicitarRecuperacionZoom(
    { id: null, rol: "ADMINISTRACION" },
    { anfitrionIds, desde, hasta, dryRun: !apply }
  );
  console.log(JSON.stringify(resumen, null, 2));
  if (resumen.tipo === "DRY_RUN") {
    console.log("Dry-run: no se escribió nada. Revisar cantidad y fechas y volver a ejecutar con --apply.");
  }
  return resumen.tipo === "DRY_RUN" || resumen.tipo === "ENCOLADA" ? 0 : 1;
}

main()
  .then(async (codigo) => {
    await db.$disconnect();
    process.exit(codigo);
  })
  .catch(async (error: unknown) => {
    console.error(error instanceof Error ? error.message : "fallo desconocido");
    await db.$disconnect().catch(() => undefined);
    process.exit(1);
  });
