import { db } from "../src/lib/db";
import { resolverEstadoSolicitudPorIntegraciones } from "../src/modules/reuniones/encuentros.domain";
import { recalcularSolicitud } from "../src/modules/reuniones/encuentros-persistence.adapter";

async function main() {
  const apply = process.argv.includes("--apply");
  const requests = await db.solicitudSala.findMany({
    where: { estado: { not: "CANCELADA" } },
    select: {
      id: true,
      titulo: true,
      estado: true,
      instancias: {
        where: { estado: { not: "CANCELADA" } },
        select: { eventosProveedor: { select: { estadoIntegracion: true } } }
      }
    }
  });
  const changes = requests.flatMap((request) => {
    const expected = resolverEstadoSolicitudPorIntegraciones(
      request.instancias.flatMap(({ eventosProveedor }) =>
        eventosProveedor.map(({ estadoIntegracion }) => estadoIntegracion)
      )
    );
    return expected === request.estado ? [] : [{
      id: request.id,
      titulo: request.titulo,
      anterior: request.estado,
      esperado: expected
    }];
  });

  console.table(changes);
  console.log(`${changes.length} reuniones requieren actualización.${apply ? " Aplicando cambios…" : " Ejecución de prueba."}`);
  if (!apply) return;

  for (const change of changes) {
    await db.$transaction((tx) => recalcularSolicitud(tx, change.id));
  }
  console.log(`${changes.length} reuniones actualizadas.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
