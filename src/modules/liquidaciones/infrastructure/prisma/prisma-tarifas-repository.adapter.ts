import type { Prisma, PrismaClient } from "@prisma/client";
import type { ModalidadAsistencia, TarifaVigente } from "../../domain";
import type { TarifasRepositoryPort } from "../../ports";

export type TarifaDbClient = PrismaClient | Prisma.TransactionClient;

export function crearPrismaTarifasRepositoryAdapter(db: TarifaDbClient): TarifasRepositoryPort {
  return {
    async obtenerTarifaVigente(modalidad: ModalidadAsistencia): Promise<TarifaVigente> {
      const tarifa = await db.tarifaAsistenciaTecnica.findFirst({
        where: { modalidad },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { id: true, valorHora: true, moneda: true }
      });

      if (!tarifa) {
        const nombreModalidad = modalidad === "HIBRIDA" ? "híbrida" : "virtual";
        throw new Error(`No hay una tarifa configurada para asistencia técnica ${nombreModalidad}.`);
      }

      const valorHora =
        typeof (tarifa.valorHora as any) === "number"
          ? (tarifa.valorHora as any)
          : typeof (tarifa.valorHora as any)?.toNumber === "function"
            ? (tarifa.valorHora as any).toNumber()
            : Number(tarifa.valorHora);

      return {
        id: tarifa.id,
        valorHora,
        moneda: tarifa.moneda
      };
    }
  };
}
