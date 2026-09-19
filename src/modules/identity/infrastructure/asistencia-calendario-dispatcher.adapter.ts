import type { PrismaClient } from "@prisma/client";
import type { CalendarioAsistenteDispatcher } from "../ports";

export type SincronizarCalendariosAsistenteUsuarioFn = (
  dependencies: any,
  usuarioId: string
) => Promise<unknown>;

export type AsistenciaCalendarioDependencies = Readonly<{
  db: PrismaClient;
  descifrar: (value: string) => string;
  publicarEvento: any;
  eliminarEvento: any;
  sincronizarUsuario: SincronizarCalendariosAsistenteUsuarioFn;
}>;

export function crearAsistenciaCalendarioDispatcher(
  deps: AsistenciaCalendarioDependencies
): CalendarioAsistenteDispatcher {
  return {
    async reconciliarCalendarioAsistente(usuarioId: string): Promise<void> {
      try {
        await deps.sincronizarUsuario(
          {
            db: deps.db,
            descifrar: deps.descifrar,
            publicarEvento: deps.publicarEvento,
            eliminarEvento: deps.eliminarEvento
          },
          usuarioId
        );
      } catch (error) {
        console.warn("No se pudo completar el backfill de Google Calendar del asistente", error);
      }
    }
  };
}

