export {
  obtenerCredencialWorkspacePorId,
  obtenerCredencialPrincipalGoogleWorkspace,
  obtenerCredencialGoogleParaSala,
  obtenerCredencialAdminReportsGoogle,
  obtenerCredencialesWorkspaceActivas,
  obtenerCandidatosCredencialesParaOrganizador,
  cargarCredencialesLegacyGoogleWorkspace,
  desactivarCredencialLegacyWorkspace,
  actualizarSeccionGoogleWorkspace,
  type WorkspaceConfigDb,
  type CredencialWorkspacePrincipal,
  type CredencialGoogleSala,
  type CredencialAdminReportsGoogle,
  type CredencialesWorkspaceActivas,
  type CredencialLegacyGoogleWorkspace,
  type CandidatoCredencialMeet,
  type DependenciasConfiguracionGoogle,
} from "./google-workspace.service";

export {
  verificarCohostsGlobalPagina,
  type VerificarCohostsGlobalDependencies,
  type ResultadoCohostReunion,
  type VerificacionGlobalPagina,
  type VerificacionGlobalEstado,
  type CredencialCohost,
  type CredencialLegacyCohost,
  COHOST_VERIFICATION_PAGE_SIZE,
} from "./verificar-cohosts-global.service";

export {
  resincronizarCohostsReunionesExistentes,
  type ResyncCohostDependencies,
  type ResyncCohostResult,
  type ResyncCohostFailure,
  type ResyncCohostLogEvent,
} from "./resincronizar-cohosts.service";

export { enviarCorreoConfigurado } from "./correo.service";

export {
  obtenerConfiguracionCorreoSes,
  actualizarConfiguracionCorreoSes,
} from "./correo-ses.service";

export {
  probarCredencialGoogle,
  prepararAccesoSalasDrive,
  type GoogleWorkspaceScopeValidation,
} from "./google-workspace-test.adapter";

export { obtenerDatosPaginaConfiguracion } from "./configuracion-page.service";

export {
  listarGruposZoom,
  elegirGrupoZoom,
  sincronizarCuentasZoomConGrupo,
  previsualizarSincronizacionConGrupo,
  GrupoZoomVacioError,
  SincronizacionZoomError,
  type ResultadoSincronizacionZoom,
  type OpcionesSincronizacionZoom,
  type VistaPreviaSincronizacionZoom,
} from "./zoom-grupo-sincronizacion.service";

export * from "./google-workspace.domain";
export * from "./asistencia-tecnica.domain";
export * from "./settings-navigation.domain";
