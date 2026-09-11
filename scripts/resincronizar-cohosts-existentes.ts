import { descifrarConfiguracion } from "../src/lib/config/encryption";
import { db } from "../src/lib/db";
import { resincronizarCohostsReunionesExistentes } from "../src/modules/configuracion/resincronizar-cohosts.service";
import { crearGoogleCalendarProvider } from "../src/modules/meet/google-calendar.adapter";

const jsonOutput = process.argv.includes("--json");

async function main(): Promise<void> {
  const result = await resincronizarCohostsReunionesExistentes({
    db,
    descifrar: descifrarConfiguracion,
    crearProvider: crearGoogleCalendarProvider,
  });

  if (jsonOutput) {
    console.log(JSON.stringify(result, null, 2));
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
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
