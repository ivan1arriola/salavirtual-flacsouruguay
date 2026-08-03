import { db } from "../src/lib/db";
import { recalcularSolicitud } from "../src/modules/reuniones/encuentros-persistence.adapter";

const applyChanges = process.argv.includes("--apply");

async function main(): Promise<void> {
  const requests = await db.solicitudSala.findMany({
    where: { instancias: { some: { estado: "CANCELADA" } } },
    select: {
      id: true,
      titulo: true,
      instancias: {
        select: { id: true, estado: true }
      }
    },
    orderBy: { fechaInicioSolicitada: "asc" }
  });

  const plan = requests.map((request) => {
    const cancelledIds = request.instancias
      .filter(({ estado }) => estado === "CANCELADA")
      .map(({ id }) => id);
    const activeCount = request.instancias.length - cancelledIds.length;
    return {
      solicitudId: request.id,
      titulo: request.titulo,
      cancelledCount: cancelledIds.length,
      activeCount,
      deleteRequest: activeCount === 0,
      cancelledIds
    };
  });

  console.log(JSON.stringify({
    mode: applyChanges ? "apply" : "dry-run",
    requests: plan.length,
    cancelledInstances: plan.reduce((total, item) => total + item.cancelledCount, 0),
    requestsWithoutActiveInstances: plan.filter(({ deleteRequest }) => deleteRequest).length
  }, null, 2));

  if (!applyChanges) {
    console.log(JSON.stringify(plan.map(({ cancelledIds: _cancelledIds, ...item }) => item), null, 2));
    return;
  }

  const failures: Array<Readonly<{ solicitudId: string; titulo: string; error: string }>> = [];
  for (const item of plan) {
    try {
      await db.$transaction(async (tx) => {
        if (item.deleteRequest) {
          await tx.solicitudSala.delete({ where: { id: item.solicitudId } });
          return;
        }
        await tx.instanciaSala.deleteMany({ where: { id: { in: item.cancelledIds } } });
        await recalcularSolicitud(tx, item.solicitudId);
      });
    } catch (error) {
      failures.push({
        solicitudId: item.solicitudId,
        titulo: item.titulo,
        error: error instanceof Error ? error.message : "Error desconocido"
      });
    }
  }

  console.log(JSON.stringify({
    deletedRequests: plan.filter(({ deleteRequest }) => deleteRequest).length - failures.length,
    cleanedRequests: plan.filter(({ deleteRequest }) => !deleteRequest).length,
    failures
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
