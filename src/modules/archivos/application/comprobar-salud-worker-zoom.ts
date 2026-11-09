export type SaludWorkerZoom = Readonly<{ ok: boolean; motivos: readonly string[]; avisos?: readonly string[] }>;

/**
 * Condiciones para arrancar el worker: identidad general de Workspace con `serviceAccountSubject`
 * (opcional en el esquema), credenciales Zoom y permiso real de escritura en las carpetas destino.
 * Si algo falla el worker no arranca y lo informa.
 */
export async function comprobarSaludWorkerZoom(entrada: Readonly<{
  workspace: Readonly<{ driveDestinationId?: string | null; serviceAccountSubject?: string | null }> | null;
  zoomDisponible: boolean;
  driveHistoricoId: string | null;
  verificarEscritura: (carpetaId: string) => Promise<boolean>;
}>): Promise<SaludWorkerZoom> {
  const motivos: string[] = [];
  const avisos: string[] = [];
  if (!entrada.zoomDisponible) motivos.push("Zoom no tiene credenciales activas.");
  if (!entrada.workspace) {
    motivos.push("No hay configuración de Workspace activa.");
  } else {
    if (!entrada.workspace.serviceAccountSubject) motivos.push("Falta serviceAccountSubject en la configuración de Workspace.");
    if (!entrada.workspace.driveDestinationId) {
      motivos.push("Falta la carpeta de destino de Drive (driveDestinationId).");
    } else if (!(await comprobar(entrada.verificarEscritura, entrada.workspace.driveDestinationId))) {
      motivos.push("Sin permiso de escritura en la carpeta de destino de Drive.");
    }
  }
  if (entrada.driveHistoricoId) {
    if (!(await comprobar(entrada.verificarEscritura, entrada.driveHistoricoId))) {
      motivos.push("Sin permiso de escritura en la carpeta histórica de administración.");
    }
  } else {
    avisos.push("ZOOM_ARCHIVOS_DRIVE_HISTORICO_ID no está definido: los históricos sin vincular quedarán en espera.");
  }
  return { ok: motivos.length === 0, motivos, avisos };
}

async function comprobar(verificar: (id: string) => Promise<boolean>, id: string): Promise<boolean> {
  try {
    return await verificar(id);
  } catch {
    return false;
  }
}
