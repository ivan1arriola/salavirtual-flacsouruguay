import type { ModalidadAsistencia, TarifaVigente } from "../domain";

export type TarifasRepositoryPort = Readonly<{
  obtenerTarifaVigente(modalidad: ModalidadAsistencia): Promise<TarifaVigente>;
}>;
