import { Prisma, type ModalidadReunion, type PrismaClient } from "@prisma/client";
import { crearPrismaTarifasRepositoryAdapter } from "@/src/modules/liquidaciones/api";

type TarifaDb = PrismaClient | Prisma.TransactionClient;

/** Fachada de retrocompatibilidad para la tarifa vigente de asistencia. */
export async function obtenerTarifaVigente(
  db: TarifaDb,
  modalidad: ModalidadReunion
): Promise<Readonly<{ id: string; valorHora: Prisma.Decimal; moneda: string }>> {
  const tarifa = await crearPrismaTarifasRepositoryAdapter(db).obtenerTarifaVigente(modalidad);
  return {
    id: tarifa.id,
    valorHora: new Prisma.Decimal(tarifa.valorHora),
    moneda: tarifa.moneda
  };
}
