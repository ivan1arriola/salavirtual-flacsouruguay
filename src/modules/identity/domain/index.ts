export {
  ROLES_USUARIO,
  type RolUsuario,
  type UsuarioCredenciales,
  type UsuarioAutenticado,
  type PerfilGoogle,
  type CuentaGoogleVinculada
} from "./identity.types";

export { buscarRolAnterior, mapearRolAnterior, puedeAdministrar, esRolUsuario } from "./roles.domain";

export {
  credencialesLoginSchema,
  normalizarIdentificadorAcceso,
  esCorreoAcceso,
  evaluarAccesoLocal
} from "./credentials.domain";

export {
  evaluarAccesoGoogle,
  esPerfilGoogleVerificado,
  esPerfilGoogleInstitucional,
  resolverVinculacionSubjectGoogle
} from "./google-login.domain";

export { parseAuthConfig, resolverRedireccionAutorizada } from "./auth-config.domain";
