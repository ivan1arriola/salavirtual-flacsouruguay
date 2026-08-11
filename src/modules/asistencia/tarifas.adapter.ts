import type { ModalidadReunion, Prisma, PrismaClient } from "@prisma/client";

type TarifaDb = PrismaClient | Prisma.TransactionClient;

export async function obtenerTarifaVigente(
  db: TarifaDb,
  modalidad: ModalidadReunion
): Promise<Readonly<{ id: string; valorHora: Prisma.Decimal; moneda: string }>> {
  const tarifa = await db.tarifaAsistenciaTecnica.findFirst({
    where: { modalidad },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, valorHora: true, moneda: true }
  });
  if (!tarifa) {
    const nombreModalidad = modalidad === "HIBRIDA" ? "híbrida" : "virtual";
    throw new Error(`No hay una tarifa configurada para asistencia técnica ${nombreModalidad}.`);
  }
  return tarifa;
}
