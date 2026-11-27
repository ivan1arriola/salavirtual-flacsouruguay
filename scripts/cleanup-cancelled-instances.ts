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
        select: {
          id: true,
          estado: true,
          eventosProveedor: {
            where: { proveedor: { tipo: "GOOGLE_MEET" } },
            select: {
              operacionPendiente: true,
              estadoIntegracion: true,
              externalEventId: true,
            },
          },
        },
      },
    },
    orderBy: { fechaInicioSolicitada: "asc" },
  });

  const plan = requests.map((request) => {
    const cancelled = request.instancias.filter(({ estado }) => estado === "CANCELADA");
    const safeToDelete = cancelled.filter(({ eventosProveedor }) =>
      eventosProveedor.every(
        (event) =>
          event.operacionPendiente !== "CANCELAR" &&
          (event.externalEventId === null || event.estadoIntegracion === "SINCRONIZADA"),
      ),
    );
    const pendingGoogleCancellation = cancelled.filter(
      ({ id }) => !safeToDelete.some((safe) => safe.id === id),
    );
    const activeCount = request.instancias.length - cancelled.length;
    const deleteRequest = activeCount === 0 && pendingGoogleCancellation.length === 0;

    return {
      solicitudId: request.id,
      titulo: request.titulo,
      cancelledCount: cancelled.length,
      safeToDeleteCount: safeToDelete.length,
      pendingGoogleCancellationCount: pendingGoogleCancellation.length,
      activeCount,
      deleteRequest,
      cancelledIds: safeToDelete.map(({ id }) => id),
    };
  });

  console.log(
    JSON.stringify(
      {
        mode: applyChanges ? "apply" : "dry-run",
        requests: plan.length,
        cancelledInstances: plan.reduce((total, item) => total + item.cancelledCount, 0),
        safeToDeleteInstances: plan.reduce((total, item) => total + item.safeToDeleteCount, 0),
        pendingGoogleCancellations: plan.reduce(
          (total, item) => total + item.pendingGoogleCancellationCount,
          0,
        ),
        requestsWithoutActiveInstancesReadyToDelete: plan.filter(
          ({ deleteRequest }) => deleteRequest,
        ).length,
      },
      null,
      2,
    ),
  );

  if (!applyChanges) {
    console.log(
      JSON.stringify(
        plan.map(({ cancelledIds: _cancelledIds, ...item }) => item),
        null,
        2,
      ),
    );
    return;
  }

  const failures: Array<Readonly<{ solicitudId: string; titulo: string; error: string }>> = [];
  let deletedRequests = 0;
  let cleanedRequests = 0;

  for (const item of plan) {
    if (!item.deleteRequest && item.cancelledIds.length === 0) {
      continue;
    }

    try {
      await db.$transaction(async (tx) => {
        if (item.deleteRequest) {
          await tx.solicitudSala.delete({ where: { id: item.solicitudId } });
          return;
        }
        await tx.instanciaSala.deleteMany({ where: { id: { in: item.cancelledIds } } });
        await recalcularSolicitud(tx, item.solicitudId);
      });
      if (item.deleteRequest) {
        deletedRequests += 1;
      } else {
        cleanedRequests += 1;
      }
    } catch (error) {
      failures.push({
        solicitudId: item.solicitudId,
        titulo: item.titulo,
        error: error instanceof Error ? error.message : "Error desconocido",
      });
    }
  }

  console.log(
    JSON.stringify(
      {
        deletedRequests,
        cleanedRequests,
        skippedPendingGoogleCancellations: plan.reduce(
          (total, item) => total + item.pendingGoogleCancellationCount,
          0,
        ),
        failures,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
