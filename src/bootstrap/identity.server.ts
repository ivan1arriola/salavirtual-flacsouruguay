import "server-only";
import { compare } from "bcryptjs";
import { db } from "@/src/lib/db";
import { descifrarConfiguracion } from "@/src/lib/config/encryption";
import {
  eliminarEventoCalendarioAsistente,
  publicarEventoCalendarioAsistente
} from "@/src/modules/asistencia/calendario-asistente-google.adapter";
import { sincronizarCalendariosAsistenteUsuario } from "@/src/modules/asistencia/calendario-asistente.service";
import {
  crearAsistenciaCalendarioDispatcher,
  crearAutenticarCredencialesUseCase,
  crearPrismaIdentityAdapter,
  crearResolverUsuarioGoogleUseCase,
  type PerfilGoogle,
  type UsuarioAutenticado
} from "@/src/modules/identity/api";

export type ServicioIdentity = Readonly<{
  autenticarCredenciales: (input: unknown) => Promise<UsuarioAutenticado | null>;
  resolverUsuarioGoogle: (perfil: PerfilGoogle) => Promise<UsuarioAutenticado | null>;
}>;

const defaultRepository = crearPrismaIdentityAdapter(db);
const defaultDispatcher = crearAsistenciaCalendarioDispatcher({
  db,
  descifrar: descifrarConfiguracion,
  publicarEvento: publicarEventoCalendarioAsistente,
  eliminarEvento: eliminarEventoCalendarioAsistente,
  sincronizarUsuario: sincronizarCalendariosAsistenteUsuario
});

const autenticarCredenciales = crearAutenticarCredencialesUseCase(defaultRepository, compare);
const resolverUsuarioGoogle = crearResolverUsuarioGoogleUseCase(defaultRepository, defaultDispatcher);

export function obtenerServicioIdentity(): ServicioIdentity {
  return {
    autenticarCredenciales,
    resolverUsuarioGoogle
  };
}
