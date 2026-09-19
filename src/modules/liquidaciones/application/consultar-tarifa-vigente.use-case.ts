import type { ModalidadAsistencia, TarifaVigente } from "../domain";
import type { TarifasRepositoryPort } from "../ports";

export type ConsultarTarifaVigenteDeps = Readonly<{
  tarifasRepo: TarifasRepositoryPort;
}>;

export async function consultarTarifaVigenteUseCase(
  deps: ConsultarTarifaVigenteDeps,
  modalidad: ModalidadAsistencia
): Promise<TarifaVigente> {
  return deps.tarifasRepo.obtenerTarifaVigente(modalidad);
}
