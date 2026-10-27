import type { LiveParticipantsResult } from "../domain";
import type { ArchivosRepositoryPort, ArtifactProviderFactory } from "../ports";

export async function obtenerParticipantesActivosUseCase(
  repositorio: ArchivosRepositoryPort,
  providerFactory: ArtifactProviderFactory,
  descifrar: (cifrado: string) => string,
  instanciaId: string
): Promise<LiveParticipantsResult> {
  const evento = await repositorio.obtenerDatosInstanciaParaParticipantes(instanciaId);

  if (!evento?.codigoReunion) {
    return { estado: "NO_DISPONIBLE", motivo: "SIN_MEET", participantes: [] };
  }

  const subject = evento.emailOrganizador?.trim();
  if (!subject) {
    return { estado: "NO_DISPONIBLE", motivo: "SIN_ORGANIZADOR", participantes: [] };
  }

  const configuracion = await repositorio.obtenerConfiguracionWorkspacePrincipal();

  if (
    !configuracion?.activa ||
    !configuracion.serviceAccountEmail ||
    !configuracion.privateKeyCifrada
  ) {
    return { estado: "NO_DISPONIBLE", motivo: "SIN_CREDENCIALES", participantes: [] };
  }

  const provider = providerFactory({
    serviceAccountEmail: configuracion.serviceAccountEmail,
    privateKey: descifrar(configuracion.privateKeyCifrada),
    subject
  }, evento.tipoProveedor ?? "GOOGLE_MEET");

  const scan = await provider.obtenerParticipantesActivos(
    evento.codigoReunion,
    evento.inicioProgramadoAt,
    evento.finProgramadoAt
  );

  return {
    estado: "OK",
    conferenciaExiste: scan.conferenciaExiste,
    ...(scan.conferenceName ? { conferenceName: scan.conferenceName } : {}),
    participantes: scan.participantesActivos
  };
}

