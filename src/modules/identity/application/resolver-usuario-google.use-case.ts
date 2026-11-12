import {
  esPerfilGoogleVerificado,
  evaluarAccesoGoogle,
  type PerfilGoogle,
  type UsuarioAutenticado
} from "../domain";
import type { CalendarioAsistenteDispatcher, IdentityRepository } from "../ports";

export function crearResolverUsuarioGoogleUseCase(
  repository: IdentityRepository,
  calendarioDispatcher?: CalendarioAsistenteDispatcher
) {
  return async function resolverUsuarioGoogle(perfil: PerfilGoogle): Promise<UsuarioAutenticado | null> {
    if (!esPerfilGoogleVerificado(perfil)) {
      return null;
    }

    const now = new Date();
    const cuenta = await repository.resolverOCrearCuentaGoogle(perfil, now);
    if (!cuenta) {
      return null;
    }

    const autenticado = evaluarAccesoGoogle(perfil, cuenta);
    if (!autenticado) {
      return null;
    }

    if (cuenta.id) {
      await repository.actualizarUltimoAccesoGoogle(cuenta.id, perfil.subject, now);
    }
    await repository.registrarAcceso(autenticado.id, "google", now);

    if (autenticado.rol === "ASISTENTE_TECNICO" && calendarioDispatcher) {
      try {
        await calendarioDispatcher.reconciliarCalendarioAsistente(autenticado.id);
      } catch (error) {
        console.warn(
          "No se pudo completar la reconciliacion de Google Calendar del asistente tecnico",
          error
        );
      }
    }

    return autenticado;
  };
}
