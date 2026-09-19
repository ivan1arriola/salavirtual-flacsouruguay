import type { ConferenceProviderFactory, ConferenciasRepositoryPort } from "../ports";

export async function sincronizarCohostsExistenteUseCase(
  repository: ConferenciasRepositoryPort,
  providerFactory: ConferenceProviderFactory,
  input: Readonly<{
    organizerEmail: string;
    calendarId: string;
    externalEventId: string;
    codigoReunion?: string | null;
    cohostsAnteriores: readonly string[];
    cohostsDeseados: readonly string[];
  }>
): Promise<Readonly<Record<string, unknown>>> {
  const creds = await repository.obtenerCredencialesWorkspace();
  if (!creds.disponible || !creds.serviceAccountEmail || !creds.privateKey) {
    throw new Error(creds.error ?? "No hay credenciales activas de Google Workspace.");
  }

  const provider = providerFactory({
    serviceAccountEmail: creds.serviceAccountEmail,
    privateKey: creds.privateKey,
    subject: input.organizerEmail,
  });

  if (!provider.sincronizarCohostsExistente) {
    throw new Error("El proveedor no soporta sincronización de cohosts.");
  }

  return provider.sincronizarCohostsExistente(input);
}

export async function configurarMeetExistenteUseCase(
  repository: ConferenciasRepositoryPort,
  providerFactory: ConferenceProviderFactory,
  organizerEmail: string,
  codigoReunion: string,
  settings: Readonly<{
    requiereAsistenciaTecnica?: boolean;
    cohostEmails?: readonly string[];
  }>
): Promise<void> {
  const creds = await repository.obtenerCredencialesWorkspace();
  if (!creds.disponible || !creds.serviceAccountEmail || !creds.privateKey) {
    throw new Error(creds.error ?? "No hay credenciales activas de Google Workspace.");
  }

  const provider = providerFactory({
    serviceAccountEmail: creds.serviceAccountEmail,
    privateKey: creds.privateKey,
    subject: organizerEmail,
  });

  if (!provider.configurarMeetExistente) {
    throw new Error("El proveedor no soporta configuración de Meet existente.");
  }

  await provider.configurarMeetExistente(codigoReunion, settings);
}

