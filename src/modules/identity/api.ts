export {
  ROLES_USUARIO,
  type RolUsuario,
  type UsuarioCredenciales,
  type UsuarioAutenticado,
  type PerfilGoogle,
  type CuentaGoogleVinculada,
  type AuthConfig,
  type AuthEnvironment,
  buscarRolAnterior,
  mapearRolAnterior,
  puedeAdministrar,
  esRolUsuario,
  credencialesLoginSchema,
  normalizarIdentificadorAcceso,
  esCorreoAcceso,
  evaluarAccesoLocal,
  evaluarAccesoGoogle,
  esPerfilGoogleVerificado,
  esPerfilGoogleInstitucional,
  resolverVinculacionSubjectGoogle,
  parseAuthConfig,
  resolverRedireccionAutorizada
} from "./domain";

export type {
  IdentityRepository,
  CalendarioAsistenteDispatcher
} from "./ports";

export {
  crearAutenticarCredencialesUseCase,
  type PasswordVerifier,
  crearResolverUsuarioGoogleUseCase
} from "./application";

export {
  crearPrismaIdentityAdapter,
  crearAsistenciaCalendarioDispatcher,
  type AsistenciaCalendarioDependencies,
  type SincronizarCalendariosAsistenteUsuarioFn
} from "./infrastructure";
