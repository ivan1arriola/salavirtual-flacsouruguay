import type { FilaResumenAsistente, PeriodoMes } from "../domain";
import type { LiquidacionesRepositoryPort } from "../ports";

export type ConsultarResumenAsistentesDeps = Readonly<{
  liquidacionesRepo: LiquidacionesRepositoryPort;
}>;

export async function consultarResumenAsistentesUseCase(
  deps: ConsultarResumenAsistentesDeps,
  periodo: PeriodoMes,
): Promise<readonly FilaResumenAsistente[]> {
  return deps.liquidacionesRepo.obtenerResumenAsistentes(periodo);
}
