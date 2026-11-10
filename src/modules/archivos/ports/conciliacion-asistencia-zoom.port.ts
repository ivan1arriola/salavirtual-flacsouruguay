import type { EstadoConciliacionZoom } from "../domain";

export type ContextoConciliacionZoom = Readonly<{
  registroId: string;
  version: number;
  claveParticipante: string;
  instanciaId: string | null;
  /** Usuario del docente titular de la serie (no cualquier docente del programa). */
  titularUsuarioId: string | null;
  estadoConciliacion: EstadoConciliacionZoom;
  invitadoReunionId: string | null;
  esExterno: boolean | null;
}>;

export type CambioConciliacionZoom = Readonly<{
  estadoConciliacion: EstadoConciliacionZoom;
  invitadoReunionId: string | null;
  esExterno: boolean | null;
}>;

export type ResultadoAplicarConciliacionZoom =
  | Readonly<{ tipo: "APLICADO"; version: number }>
  /** Otra persona editó el registro desde que se leyó. */
  | Readonly<{ tipo: "CONFLICTO" }>
  | Readonly<{ tipo: "INVITADO_AJENO" }>
  | Readonly<{ tipo: "NO_ENCONTRADO" }>;

export interface ConciliacionAsistenciaZoomRepositoryPort {
  obtenerContexto(registroId: string): Promise<ContextoConciliacionZoom | null>;
  /**
   * Atómico: valida versión, que el invitado pertenezca a la instancia del registro, aplica el cambio,
   * incrementa la versión y audita (actor, anterior y nuevo; sin URLs ni tokens).
   */
  aplicar(
    registroId: string,
    versionEsperada: number,
    cambio: CambioConciliacionZoom,
    actorUsuarioId: string
  ): Promise<ResultadoAplicarConciliacionZoom>;
}
