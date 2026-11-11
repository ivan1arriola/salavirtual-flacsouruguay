import {
  calcularCambioConciliacionZoom,
  puedeConciliarAsistenciaZoom,
  type ActorConciliacionZoom
} from "../domain";
import type { ConciliacionAsistenciaZoomRepositoryPort } from "../ports";

export type ResultadoConciliacionZoom =
  | Readonly<{ tipo: "OK"; version: number }>
  | Readonly<{ tipo: "PROHIBIDO" }>
  | Readonly<{ tipo: "CONFLICTO" }>
  | Readonly<{ tipo: "ERROR"; codigo: "NO_ENCONTRADO" | "PETICION_INVALIDA" | "INVITADO_AJENO" }>;

export type EntradaConciliacionZoom = Readonly<{
  registroId: string;
  /** Si se informa (la ruta lo toma de la URL), el registro debe pertenecer a ese encuentro. */
  instanciaId?: string;
  invitadoReunionId: string | null;
  externo: boolean;
  /** Versión del registro que la persona vio al abrir la pantalla. */
  version: number;
}>;

/** Concilia un registro de asistencia: solo personas autorizadas, con control de versión y auditoría. */
export async function conciliarAsistenciaZoomUseCase(
  deps: Readonly<{ repo: ConciliacionAsistenciaZoomRepositoryPort }>,
  actor: ActorConciliacionZoom,
  entrada: EntradaConciliacionZoom
): Promise<ResultadoConciliacionZoom> {
  const contexto = await deps.repo.obtenerContexto(entrada.registroId);
  if (!contexto) return { tipo: "ERROR", codigo: "NO_ENCONTRADO" };
  // Autorizar antes que nada más: quien no puede conciliar tampoco aprende el estado del registro.
  if (!puedeConciliarAsistenciaZoom(actor, contexto)) return { tipo: "PROHIBIDO" };
  if (entrada.instanciaId !== undefined && contexto.instanciaId !== entrada.instanciaId) {
    return { tipo: "ERROR", codigo: "NO_ENCONTRADO" };
  }
  const cambio = calcularCambioConciliacionZoom(entrada);
  if (!cambio) return { tipo: "ERROR", codigo: "PETICION_INVALIDA" };
  if (contexto.version !== entrada.version) return { tipo: "CONFLICTO" };

  const resultado = await deps.repo.aplicar(entrada.registroId, entrada.version, cambio, actor.id);
  switch (resultado.tipo) {
    case "APLICADO": return { tipo: "OK", version: resultado.version };
    case "CONFLICTO": return { tipo: "CONFLICTO" };
    case "INVITADO_AJENO": return { tipo: "ERROR", codigo: "INVITADO_AJENO" };
    case "NO_ENCONTRADO": return { tipo: "ERROR", codigo: "NO_ENCONTRADO" };
  }
}
