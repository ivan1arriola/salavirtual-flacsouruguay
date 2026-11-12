import { cargarMapeos, prepararCatalogos } from "./legacy-meetings/catalogs";
import { disconnectClients } from "./legacy-meetings/clients";
import { importarSolicitud } from "./legacy-meetings/import-request";
import { cargarOrigen } from "./legacy-meetings/source";

const applyChanges = process.argv.includes("--apply");

async function main(): Promise<void> {
  try {
    const [programas, cuentas, solicitudes] = await cargarOrigen();
    const meetings = solicitudes.reduce((total, solicitud) => total + solicitud.eventos.length, 0);
    const sourceAssignments = solicitudes.reduce(
      (total, solicitud) =>
        total + solicitud.eventos.reduce((eventTotal, evento) => eventTotal + evento.asignaciones.length, 0),
      0
    );
    console.log(
      JSON.stringify(
        {
          mode: applyChanges ? "apply" : "dry-run",
          programs: programas.length,
          hostAccounts: cuentas.length,
          requests: solicitudes.length,
          meetings,
          sourceAssignments
        },
        null,
        2
      )
    );
    if (!applyChanges) {
      return;
    }

    const { zoomProviderId } = await prepararCatalogos(programas, cuentas);
    const mapeos = await cargarMapeos();
    for (const solicitud of solicitudes) {
      await importarSolicitud(solicitud, zoomProviderId, mapeos);
    }
    console.log(
      JSON.stringify(
        {
          importedPrograms: programas.length,
          importedRequests: solicitudes.length,
          importedMeetings: meetings
        },
        null,
        2
      )
    );
  } finally {
    await disconnectClients();
  }
}

void main();
