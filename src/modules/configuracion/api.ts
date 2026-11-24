export {
  obtenerCredencialWorkspacePorId,
  obtenerCredencialPrincipalGoogleWorkspace,
  obtenerCredencialGoogleParaSala,
  obtenerCredencialAdminReportsGoogle,
  obtenerCredencialesWorkspaceActivas,
  obtenerCandidatosCredencialesParaOrganizador
} from "./google-workspace.service";

export { verificarCohostsGlobalPagina } from "./verificar-cohosts-global.service";

export { resincronizarCohostsReunionesExistentes } from "./resincronizar-cohosts.service";

export { prepararAccesoSalasDrive } from "./google-workspace-test.adapter";

export { obtenerDatosPaginaConfiguracion } from "./configuracion-page.service";

export {
  listarGruposZoom,
  elegirGrupoZoom,
  sincronizarCuentasZoomConGrupo,
  previsualizarSincronizacionConGrupo
} from "./zoom-grupo-sincronizacion.service";

export * from "./google-workspace.domain";
export * from "./asistencia-tecnica.domain";
export * from "./settings-navigation.domain";
