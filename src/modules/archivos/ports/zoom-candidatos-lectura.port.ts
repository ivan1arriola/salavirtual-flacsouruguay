export type CandidatoZoom = Readonly<{ id: string; titulo: string; programa: string; docente: string; fecha: Date }>;
export interface ZoomCandidatosLecturaPort {
  listarEncuentrosCandidatosZoom(ocurrenciaId: string): Promise<readonly CandidatoZoom[] | null>;
}
