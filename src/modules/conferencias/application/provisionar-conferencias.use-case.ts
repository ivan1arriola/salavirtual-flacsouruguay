import {
  eventoCalendarCoincideConSolicitud,
  registrarVerificacionCohosts,
  esErrorDeScopesInsuficientes,
  type ConferenceProvisionRequest,
  type ConferenceProvisionResult,
  type ProvisionConferenciaResult,
} from "../domain";
import type {
  ConferenceProvider,
  ConferenceProviderFactory,
  ConferenciasRepositoryPort,
} from "../ports";

export class MeetSettingsScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MeetSettingsScopeError";
  }
}

export async function sincronizarEventosPendientesUseCase(
  repository: ConferenciasRepositoryPort,
  providerFactory: ConferenceProviderFactory,
  ids: readonly string[]
): Promise<readonly ProvisionConferenciaResult[]> {
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0) return [];

  const snapshots = await repository.obtenerSnapshotsEventos(uniqueIds);
  const byId = new Map(snapshots.map((item) => [item.id, item]));
  const pendingIds = uniqueIds.filter((id) => byId.get(id)?.operacionPendiente);
  const settled = await Promise.all(
    uniqueIds
      .filter((id) => !pendingIds.includes(id))
      .map((id) => repository.obtenerEstadoActual(id))
  );

  if (pendingIds.length === 0) return settled;

  const creds = await repository.obtenerCredencialesWorkspace();
  if (!creds.disponible || !creds.serviceAccountEmail || !creds.privateKey) {
    if (creds.error) {
      const failed = await Promise.all(
        pendingIds.map((id) => repository.registrarErrorSinClaim(id, creds.error!))
      );
      return [...settled, ...failed];
    }
    return [
      ...settled,
      ...pendingIds.map((eventoProveedorId) => ({
        eventoProveedorId,
        estado: "PENDIENTE_CONFIGURACION" as const,
      })),
    ];
  }

  const results: ProvisionConferenciaResult[] = [...settled];

  for (const id of pendingIds) {
    const claim = await repository.reclamarEvento(id);
    if (!claim) {
      results.push(await repository.obtenerEstadoActual(id));
      continue;
    }

    const hostEmail = claim.event.organizerEmail;
    if (!hostEmail) {
      results.push(
        await repository.registrarErrorReclamado(
          claim,
          "La cuenta host no tiene email organizador."
        )
      );
      continue;
    }

    const provider = providerFactory({
      serviceAccountEmail: creds.serviceAccountEmail,
      privateKey: creds.privateKey,
      subject: hostEmail,
    });

    try {
      const request = claim.event.request;
      let result: ConferenceProvisionResult | null = null;

      switch (claim.operacion) {
        case "PROVISIONAR": {
          let externalEventId = claim.event.externalEventId;
          if (!externalEventId) {
            const sharedConference = await repository.buscarConferenceDataCompartida(
              claim.event.solicitudSalaId,
              claim.event.id
            );
            const created = await provider.crearEventoCalendar({
              ...request,
              conferenceData: sharedConference,
            });
            externalEventId = created.externalEventId;
            await repository.guardarExternalEventIdTemprano(
              claim.event.id,
              externalEventId,
              created.payload
            );
          }

          const obtained = await obtenerConReintentos(
            provider,
            request.calendarId,
            externalEventId
          );
          if (!obtained) {
            throw new Error(
              "Google Calendar todavía no terminó de generar el enlace Meet."
            );
          }

          await repository.persistirMeetDetectado(claim.event.id, obtained);
          await configurarAjustesMeet(provider, request, obtained);

          result = {
            ...obtained,
            payload: registrarVerificacionCohosts(
              obtained.payload,
              obtained.codigoReunion,
              request.calendarId,
              request.cohostEmails ?? [],
              new Date().toISOString()
            ),
          };
          break;
        }

        case "REPROGRAMAR": {
          if (!claim.event.externalEventId) {
            throw new Error("No existe un evento Calendar para reprogramar.");
          }
          await provider.actualizarEvento(
            request.calendarId,
            claim.event.externalEventId,
            request
          );
          const obtained = await obtenerConReintentos(
            provider,
            request.calendarId,
            claim.event.externalEventId
          );
          if (!obtained) {
            throw new Error("Google Calendar no confirmó el evento reprogramado.");
          }
          if (!eventoCalendarCoincideConSolicitud(obtained.payload, request)) {
            throw new Error(
              "Google Calendar todavía no refleja la reprogramación solicitada."
            );
          }

          await repository.persistirMeetDetectado(claim.event.id, obtained);
          await configurarAjustesMeet(provider, request, obtained);

          result = {
            ...obtained,
            payload: registrarVerificacionCohosts(
              obtained.payload,
              obtained.codigoReunion,
              request.calendarId,
              request.cohostEmails ?? [],
              new Date().toISOString()
            ),
          };
          break;
        }

        case "CONFIGURAR_MEET": {
          if (!claim.event.externalEventId) {
            throw new Error("No existe un evento Calendar para configurar Meet.");
          }
          const obtained = await obtenerConReintentos(
            provider,
            request.calendarId,
            claim.event.externalEventId
          );
          if (!obtained) {
            throw new Error("Google Calendar todavía no confirmó el enlace Meet.");
          }

          await repository.persistirMeetDetectado(claim.event.id, obtained);
          await configurarAjustesMeet(provider, request, obtained);

          result = {
            ...obtained,
            payload: registrarVerificacionCohosts(
              obtained.payload,
              obtained.codigoReunion,
              request.calendarId,
              request.cohostEmails ?? [],
              new Date().toISOString()
            ),
          };
          break;
        }

        case "CANCELAR": {
          if (claim.event.externalEventId) {
            try {
              await provider.cancelarEvento(
                hostEmail,
                claim.event.externalEventId
              );
            } catch (error) {
              if (!esEventoInexistente(error)) throw error;
            }
          }
          const completed = await repository.finalizarOperacion(
            claim,
            null,
            true
          );
          results.push({
            eventoProveedorId: id,
            estado: completed ? "SINCRONIZADA" : "EN_PROCESO",
          });
          continue;
        }
      }

      const completed = await repository.finalizarOperacion(
        claim,
        result,
        false
      );
      results.push({
        eventoProveedorId: id,
        estado: completed ? "SINCRONIZADA" : "EN_PROCESO",
        ...(completed && result?.codigoReunion
          ? { codigoReunion: result.codigoReunion }
          : {}),
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Error desconocido de Google.";
      const isScope =
        error instanceof MeetSettingsScopeError ||
        esErrorDeScopesInsuficientes(detail);
      results.push(
        await repository.registrarErrorReclamado(claim, detail, isScope)
      );
    }
  }

  return results;
}

async function configurarAjustesMeet(
  provider: ConferenceProvider,
  request: ConferenceProvisionRequest,
  result: ConferenceProvisionResult
): Promise<void> {
  try {
    await provider.configurarEventoMeet(request, result);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "No se pudo configurar el espacio de Meet.";
    if (esErrorDeScopesInsuficientes(detail)) {
      throw new MeetSettingsScopeError(detail);
    }
    throw error;
  }
}

async function obtenerConReintentos(
  provider: ConferenceProvider,
  calendarId: string,
  externalEventId: string
): Promise<ConferenceProvisionResult | null> {
  for (const delay of [0, 250, 500, 1000, 2000]) {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    const result = await provider.obtenerEvento(calendarId, externalEventId);
    if (result) return result;
  }
  return null;
}

function esEventoInexistente(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { code?: unknown; status?: unknown; response?: { status?: unknown } };
  return (
    value.code === 404 ||
    value.code === 410 ||
    value.status === 404 ||
    value.status === 410 ||
    value.response?.status === 404 ||
    value.response?.status === 410
  );
}

