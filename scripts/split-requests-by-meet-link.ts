import { db } from "../src/lib/db";
import { recalcularSolicitud } from "../src/modules/reuniones/encuentros-persistence.adapter";

const applyChanges = process.argv.includes("--apply");

type RequestPlan = Readonly<{
  solicitudId: string;
  titulo: string;
  groups: readonly Readonly<{
    key: string;
    label: string;
    instanciaIds: readonly string[];
    keepOriginal: boolean;
  }>[];
}>;

async function main(): Promise<void> {
  const requests = await db.solicitudSala.findMany({
    where: {
      instancias: {
        some: {
          estado: { not: "CANCELADA" },
          eventosProveedor: {
            some: {
              proveedor: { tipo: "GOOGLE_MEET" },
              OR: [
                { joinUrl: { not: null } },
                { codigoReunion: { not: null } }
              ]
            }
          }
        }
      }
    },
    include: {
      instancias: {
        where: { estado: { not: "CANCELADA" } },
        orderBy: { inicioProgramadoAt: "asc" },
        include: {
          eventosProveedor: {
            where: { proveedor: { tipo: "GOOGLE_MEET" } },
            select: { joinUrl: true, codigoReunion: true }
          }
        }
      }
    }
  });

  const plans = requests.flatMap<RequestPlan>((request) => {
    const groups = new Map<string, { label: string; instanciaIds: string[] }>();
    for (const instancia of request.instancias) {
      const meet = instancia.eventosProveedor[0];
      const key = normalizarMeetKey(meet?.joinUrl ?? meet?.codigoReunion);
      if (!key) continue;
      const current = groups.get(key) ?? {
        label: meet?.joinUrl ?? meet?.codigoReunion ?? key,
        instanciaIds: []
      };
      current.instanciaIds.push(instancia.id);
      groups.set(key, current);
    }
    if (groups.size <= 1) return [];
    const orderedGroups = [...groups.entries()]
      .map(([key, group]) => ({ key, ...group }))
      .sort((left, right) => right.instanciaIds.length - left.instanciaIds.length);
    return [{
      solicitudId: request.id,
      titulo: request.titulo,
      groups: orderedGroups.map((group, index) => ({
        ...group,
        keepOriginal: index === 0
      }))
    }];
  });

  console.log(JSON.stringify({
    mode: applyChanges ? "apply" : "dry-run",
    requestsToSplit: plans.length,
    newRequests: plans.reduce((total, plan) => total + plan.groups.length - 1, 0)
  }, null, 2));
  console.log(JSON.stringify(plans.map((plan) => ({
    solicitudId: plan.solicitudId,
    titulo: plan.titulo,
    groups: plan.groups.map(({ key: _key, ...group }) => ({
      ...group,
      instanciaIds: group.instanciaIds.length
    }))
  })), null, 2));

  if (!applyChanges) return;

  const failures: Array<Readonly<{ solicitudId: string; titulo: string; error: string }>> = [];
  for (const plan of plans) {
    try {
      await db.$transaction(async (tx) => {
        const source = await tx.solicitudSala.findUnique({
          where: { id: plan.solicitudId }
        });
        if (!source) throw new Error("La solicitud ya no existe.");
        for (const group of plan.groups.filter(({ keepOriginal }) => !keepOriginal)) {
          const clone = await tx.solicitudSala.create({
            data: {
              docenteProgramaId: source.docenteProgramaId,
              creadaPorUsuarioId: source.creadaPorUsuarioId,
              titulo: source.titulo,
              descripcion: source.descripcion,
              responsableNombre: source.responsableNombre,
              finalidadAcademica: source.finalidadAcademica,
              modalidad: source.modalidad,
              tipoInstancias: source.tipoInstancias,
              timezone: source.timezone,
              fechaInicioSolicitada: source.fechaInicioSolicitada,
              fechaFinSolicitada: source.fechaFinSolicitada,
              cantidadInstancias: group.instanciaIds.length,
              capacidadEstimada: source.capacidadEstimada,
              requiereAsistencia: source.requiereAsistencia,
              motivoAsistencia: source.motivoAsistencia,
              requiereGrabacion: source.requiereGrabacion,
              regimenEncuentros: source.regimenEncuentros,
              fechaFinRecurrencia: source.fechaFinRecurrencia,
              patronRecurrencia: source.patronRecurrencia ?? undefined,
              estado: source.estado,
              observacionesAdmin: source.observacionesAdmin,
              createdAt: source.createdAt,
              updatedAt: source.updatedAt
            }
          });
          await tx.instanciaSala.updateMany({
            where: { id: { in: [...group.instanciaIds] } },
            data: { solicitudSalaId: clone.id }
          });
          await recalcularSolicitud(tx, clone.id);
        }
        await recalcularSolicitud(tx, source.id);
      }, { timeout: 30000 });
    } catch (error) {
      failures.push({
        solicitudId: plan.solicitudId,
        titulo: plan.titulo,
        error: error instanceof Error ? error.message : "Error desconocido"
      });
    }
  }

  console.log(JSON.stringify({ failures }, null, 2));
}

function normalizarMeetKey(value?: string | null): string | null {
  if (!value) return null;
  const match = value.match(/meet\.google\.com\/([a-z]{3}-[a-z]{4}-[a-z]{3})/i);
  return (match?.[1] ?? value).trim().toLowerCase();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
