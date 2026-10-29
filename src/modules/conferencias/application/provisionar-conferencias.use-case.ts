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
  WorkspaceCredentialsResult,
  ZoomCredentialsResult,
} from "../ports";
import {
  obtenerZoomAccessToken,
  crearReunionZoomHttp,
  actualizarReunionZoomHttp,
  eliminarReunionZoomHttp,
  type ZoomMeetingResult,
} from "@/src/integrations/zoom/zoom-client";

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

  let workspaceCreds: WorkspaceCredentialsResult | null = null;
  let zoomCreds: ZoomCredentialsResult | null = null;

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

    const proveedorTipo = claim.event.proveedorTipo ?? "GOOGLE_MEET";

    if (proveedorTipo === "ZOOM") {
      if (!zoomCreds) {
        zoomCreds = await repository.obtenerCredencialesZoom();
      }

      if (
        !zoomCreds.disponible ||
        !zoomCreds.accountId ||
        !zoomCreds.clientId ||
        !zoomCreds.clientSecret
      ) {
        results.push(
          await repository.registrarErrorReclamado(
            claim,
            zoomCreds.error ||
              "Credenciales de Zoom Server-to-Server OAuth no configuradas en el sistema (Administración > Zoom)."
          )
        );
        continue;
      }

      try {
        const token = await obtenerZoomAccessToken({
          accountId: zoomCreds.accountId,
          clientId: zoomCreds.clientId,
          clientSecret: zoomCreds.clientSecret,
        });

        const request = claim.event.request;
        const durationMinutes = Math.max(
          1,
          Math.round((request.fin.getTime() - request.inicio.getTime()) / 60_000)
        );
        let result: ConferenceProvisionResult | null = null;

        switch (claim.operacion) {
          case "PROVISIONAR": {
            let externalEventId = claim.event.externalEventId;
            let meetingInfo: ZoomMeetingResult;

            if (!externalEventId) {
              meetingInfo = await crearReunionZoomHttp(token, hostEmail, {
                topic: request.titulo,
                startTime: request.inicio,
                durationMinutes,
                timezone: request.timezone || "America/Montevideo",
                agenda: request.descripcion,
                requiereGrabacion: false,
              });
              externalEventId = meetingInfo.meetingId;
              await repository.guardarExternalEventIdTemprano(
                claim,
                externalEventId,
                meetingInfo
              );
            } else {
              meetingInfo = {
                meetingId: externalEventId,
                joinUrl: `https://zoom.us/j/${externalEventId}`,
              };
            }

            result = {
              externalEventId,
              codigoReunion: externalEventId,
              joinUrl: meetingInfo.joinUrl,
              payload: meetingInfo,
            };
            await repository.persistirMeetDetectado(claim, result);
            break;
          }

          case "REPROGRAMAR": {
            if (!claim.event.externalEventId) {
              throw new Error("No existe una reunión de Zoom para reprogramar.");
            }
            await actualizarReunionZoomHttp(token, claim.event.externalEventId, {
              topic: request.titulo,
              startTime: request.inicio,
              durationMinutes,
              timezone: request.timezone || "America/Montevideo",
              agenda: request.descripcion,
            });
            result = {
              externalEventId: claim.event.externalEventId,
              codigoReunion: claim.event.externalEventId,
              joinUrl: `https://zoom.us/j/${claim.event.externalEventId}`,
              payload: { reprogramadoAt: new Date().toISOString() },
            };
            await repository.persistirMeetDetectado(claim, result);
            break;
          }

          case "CONFIGURAR_MEET": {
            result = {
              externalEventId: claim.event.externalEventId || "",
              codigoReunion: claim.event.externalEventId || "",
              joinUrl: `https://zoom.us/j/${claim.event.externalEventId}`,
              payload: { configuradoAt: new Date().toISOString() },
            };
            break;
          }

          case "CANCELAR": {
            if (claim.event.externalEventId) {
              try {
                await eliminarReunionZoomHttp(token, claim.event.externalEventId);
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
        const detail =
          error instanceof Error ? error.message : "Error desconocido de Zoom.";
        results.push(
          await repository.registrarErrorReclamado(claim, detail)
        );
      }
      continue;
    }

    // Google Meet workflow
    if (!workspaceCreds) {
      workspaceCreds = await repository.obtenerCredencialesWorkspace();
    }
    if (
      !workspaceCreds.disponible ||
      !workspaceCreds.serviceAccountEmail ||
      !workspaceCreds.privateKey
    ) {
      results.push(
        await repository.registrarErrorReclamado(
          claim,
          workspaceCreds.error ||
            "Credenciales de Google Workspace no configuradas."
        )
      );
      continue;
    }

    const provider = providerFactory({
      serviceAccountEmail: workspaceCreds.serviceAccountEmail,
      privateKey: workspaceCreds.privateKey,
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
              claim,
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

          await repository.persistirMeetDetectado(claim, obtained);
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

          await repository.persistirMeetDetectado(claim, obtained);
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

          await repository.persistirMeetDetectado(claim, obtained);
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
