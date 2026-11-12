import type { ArchivosRepositoryPort, ArtifactProviderFactory, PlanillaAsistenciaCandidata } from "../ports";
import { sincronizarArtefactosUseCase } from "./sincronizar-artefactos.use-case";

type Inspeccion = Readonly<{
  candidata: PlanillaAsistenciaCandidata;
  vacia: boolean;
  error?: string;
}>;

export type ResultadoReparacionPlanillasVacias = Readonly<{
  revisadas: number;
  vacias: number;
  reparadas: number;
  omitidas: number;
  fallidas: number;
  errores: readonly Readonly<{ eventoProveedorId: string; detalle: string }>[];
}>;

export async function repararPlanillasAsistenciaVaciasUseCase(
  repositorio: ArchivosRepositoryPort,
  providerFactory: ArtifactProviderFactory,
  descifrar: (cifrado: string) => string,
  eventoProveedorIds?: readonly string[]
): Promise<ResultadoReparacionPlanillasVacias> {
  if (!repositorio.listarPlanillasAsistenciaCandidatas) {
    throw new Error("El repositorio no permite buscar planillas de asistencia registradas.");
  }
  const configuracion = await repositorio.obtenerConfiguracionWorkspacePrincipal();
  if (
    !configuracion?.activa ||
    !configuracion.serviceAccountEmail ||
    !configuracion.privateKeyCifrada ||
    !configuracion.driveDestinationId
  ) {
    throw new Error("Faltan credenciales o carpeta destino de Google Workspace.");
  }
  const registradas = await repositorio.listarPlanillasAsistenciaCandidatas();
  // Reintentar solamente archivos previamente registrados; no se aceptan
  // identificadores arbitrarios suministrados por el cliente.
  const idsSolicitados = eventoProveedorIds ? new Set(eventoProveedorIds) : null;
  const candidates = idsSolicitados
    ? registradas.filter((item) => idsSolicitados.has(item.eventoProveedorId))
    : registradas;
  const privateKey = descifrar(configuracion.privateKeyCifrada);
  const inspections = await mapConLimit(candidates, 5, async (candidata): Promise<Inspeccion> => {
    try {
      const provider = providerFactory({
        serviceAccountEmail: configuracion.serviceAccountEmail!,
        privateKey,
        subject: candidata.emailOrganizador,
        adminEmail: configuracion.serviceAccountSubject ?? null
      });
      if (!provider.planillaAsistenciaGoogleVacia) {
        throw new Error("El proveedor de Google no permite comprobar el contenido de la planilla.");
      }
      return { candidata, vacia: await provider.planillaAsistenciaGoogleVacia(candidata.spreadsheetId) };
    } catch (error) {
      return {
        candidata,
        vacia: false,
        error: error instanceof Error ? error.message : "No se pudo revisar la planilla en Google Sheets."
      };
    }
  });

  const vacias = inspections.filter((item) => item.vacia);
  const errores: Array<{ eventoProveedorId: string; detalle: string }> = inspections
    .filter((item) => item.error)
    .map((item) => ({ eventoProveedorId: item.candidata.eventoProveedorId, detalle: item.error! }));
  let reparadas = 0;
  for (const item of vacias) {
    try {
      const [resultado] = await sincronizarArtefactosUseCase(repositorio, providerFactory, descifrar, {
        eventoProveedorIds: [item.candidata.eventoProveedorId],
        regenerarAsistencia: true,
        asistenciaDriveFileIds: { [item.candidata.eventoProveedorId]: item.candidata.spreadsheetId }
      });
      if (resultado && resultado.estado !== "ERROR" && resultado.archivos > 0) {
        reparadas += 1;
      } else {
        errores.push({
          eventoProveedorId: item.candidata.eventoProveedorId,
          detalle: resultado?.error ?? "La sincronización no llegó a escribir la planilla."
        });
      }
    } catch (error) {
      errores.push({
        eventoProveedorId: item.candidata.eventoProveedorId,
        detalle: error instanceof Error ? error.message : "No se pudo reconstruir la planilla."
      });
    }
  }

  return {
    revisadas: inspections.length,
    vacias: vacias.length,
    reparadas,
    omitidas: inspections.filter((item) => !item.vacia && !item.error).length,
    fallidas: errores.length,
    errores
  };
}

async function mapConLimit<T, R>(
  items: readonly T[],
  limit: number,
  operation: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await operation(items[index]!);
      }
    })
  );
  return results;
}
