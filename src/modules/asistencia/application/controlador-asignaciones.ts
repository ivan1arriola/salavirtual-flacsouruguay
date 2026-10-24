import type { AsistenciaRepositoryPort } from "../ports";
import { asignarAsistenteUseCase } from "./asignar-asistente.use-case";
import { desvincularAsistenteUseCase } from "./desvincular-asistente.use-case";
import type { SessionActor } from "./actualizar-postulacion.use-case";

export type SincronizacionAsignacion = Readonly<{
  calendarioAsistente: readonly unknown[];
  warning: string | null;
}>;

export type ControladorAsignacionesDeps = Readonly<{
  repo: AsistenciaRepositoryPort;
  /** Se ejecuta después del commit: cohosts de Meet y calendario del asistente. */
  sincronizar: (instanciaSalaId: string, avisoCalendario: string) => Promise<SincronizacionAsignacion>;
}>;

/**
 * Punto de entrada único para asignar, reasignar y desvincular asistentes de monitoreo.
 * La regla transaccional (bloqueo de agenda, separación mínima, tarifa vigente y
 * reutilización de la fila única instancia/asistente) vive en el repositorio.
 */
export function crearControladorAsignaciones(deps: ControladorAsignacionesDeps) {
  return {
    asignar(actor: SessionActor, rawInput: unknown) {
      return asignarAsistenteUseCase({ repo: deps.repo }, actor, rawInput);
    },
    desvincular(actor: SessionActor, rawInput: unknown) {
      return desvincularAsistenteUseCase({ repo: deps.repo }, actor, rawInput);
    },
    sincronizar(instanciaSalaId: string, avisoCalendario: string) {
      return deps.sincronizar(instanciaSalaId, avisoCalendario);
    }
  } as const;
}

export type ControladorAsignaciones = ReturnType<typeof crearControladorAsignaciones>;
