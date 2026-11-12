import {
  eventoCalendarCoincideConSolicitud,
  registrarVerificacionCohosts,
  esErrorDeScopesInsuficientes,
  type ConferenceProvisionRequest,
  type ConferenceProvisionResult,
  type ProvisionConferenciaResult
} from "../domain";
import type {
  ClaimInfo,
  ConferenceProvider,
  ConferenceProviderFactory,
  ConferenciasRepositoryPort,
  WorkspaceCredentialsResult,
  ZoomCredentialsResult
} from "../ports";
import {
  obtenerZoomAccessToken,
  crearReunionZoomHttp,
  actualizarReunionZoomHttp,
  eliminarReunionZoomHttp,
  obtenerReunionZoomHttp,
  crearReunionZoomRecurrenteHttp,
  buscarReunionZoomPorMarcaHttp,
  eliminarOcurrenciaZoomHttp,
  actualizarOcurrenciaZoomHttp,
  type ZoomMeetingResult
} from "@/src/integrations/zoom/zoom-client";
import { debeEliminarseReunionCompartida } from "@/src/modules/reuniones/reunion-compartida.domain";
import {
  calcularRecurrenciaZoom,
  detectarOcurrenciasSobrantes,
  detectarOcurrenciasAjustar
} from "../domain/zoom-recurrence.domain";

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
  if (uniqueIds.length === 0) {
    return [];
  }

  const snapshots = await repository.obtenerSnapshotsEventos(uniqueIds);
  const byId = new Map(snapshots.map((item) => [item.id, item]));
  const pendingIds = uniqueIds.filter((id) => byId.get(id)?.operacionPendiente);
  const settled = await Promise.all(
    uniqueIds.filter((id) => !pendingIds.includes(id)).map((id) => repository.obtenerEstadoActual(id))
  );

  if (pendingIds.length === 0) {
    return settled;
  }

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
        await repository.registrarErrorReclamado(claim, "La cuenta host no tiene email organizador.")
      );
      continue;
    }

    const proveedorTipo = claim.event.proveedorTipo ?? "GOOGLE_MEET";

    if (proveedorTipo === "ZOOM") {
      if (!zoomCreds) {
        zoomCreds = await repository.obtenerCredencialesZoom();
      }

      if (!zoomCreds.disponible || !zoomCreds.accountId || !zoomCreds.clientId || !zoomCreds.clientSecret) {
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
          clientSecret: zoomCreds.clientSecret
        });

        const request = claim.event.request;
        const durationMinutes = Math.max(
          1,
          Math.round((request.fin.getTime() - request.inicio.getTime()) / 60_000)
        );
        let result: ConferenceProvisionResult | null = null;

        switch (claim.operacion) {
          case "PROVISIONAR": {
            if (claim.event.reunionProveedorId) {
              const compartida = await provisionarReunionCompartida(repository, claim, token, hostEmail);
              if (compartida.espera) {
                // Otro encuentro de la serie está creando la reunión: se reintenta sin esperar al reclamo del evento.
                await repository.liberarReclamoEvento?.(claim);
                results.push({ eventoProveedorId: id, estado: "EN_PROCESO" });
                continue;
              }
              result = {
                externalEventId: compartida.meetingInfo.meetingId,
                codigoReunion: compartida.meetingInfo.meetingId,
                joinUrl: compartida.meetingInfo.joinUrl,
                payload: {
                  meetingId: compartida.meetingInfo.meetingId,
                  joinUrl: compartida.meetingInfo.joinUrl
                }
              };
              await repository.persistirMeetDetectado(claim, result);
              break;
            }

            let externalEventId = claim.event.externalEventId;
            let meetingInfo: ZoomMeetingResult;

            if (!externalEventId) {
              meetingInfo = await crearReunionZoomHttp(token, hostEmail, {
                topic: request.titulo,
                startTime: request.inicio,
                durationMinutes,
                timezone: request.timezone || "America/Montevideo",
                agenda: request.descripcion,
                requiereGrabacion: request.requiereGrabacion ?? false
              });
              externalEventId = meetingInfo.meetingId;
              await repository.guardarExternalEventIdTemprano(claim, externalEventId, {
                meetingId: meetingInfo.meetingId,
                joinUrl: meetingInfo.joinUrl
              });
            } else {
              meetingInfo = await obtenerReunionZoomHttp(token, externalEventId);
            }

            result = {
              externalEventId,
              codigoReunion: externalEventId,
              joinUrl: meetingInfo.joinUrl,
              payload: { meetingId: meetingInfo.meetingId, joinUrl: meetingInfo.joinUrl }
            };
            await repository.persistirMeetDetectado(claim, result);
            break;
          }

          case "REPROGRAMAR": {
            if (!claim.event.externalEventId) {
              throw new Error("No existe una reunión de Zoom para reprogramar.");
            }
            // En una reunión compartida el horario vive en Sala Virtual y en Calendar: no se toca Zoom.
            if (!claim.event.reunionProveedorId) {
              await actualizarReunionZoomHttp(token, claim.event.externalEventId, {
                topic: request.titulo,
                startTime: request.inicio,
                durationMinutes,
                timezone: request.timezone || "America/Montevideo",
                agenda: request.descripcion
              });
            }
            const meetingInfo = await obtenerReunionZoomHttp(token, claim.event.externalEventId);
            result = {
              externalEventId: claim.event.externalEventId,
              codigoReunion: claim.event.externalEventId,
              joinUrl: meetingInfo.joinUrl,
              payload: {
                meetingId: meetingInfo.meetingId,
                joinUrl: meetingInfo.joinUrl,
                reprogramadoAt: new Date().toISOString()
              }
            };
            await repository.persistirMeetDetectado(claim, result);
            break;
          }

          case "CONFIGURAR_MEET": {
            if (!claim.event.externalEventId) {
              throw new Error("No existe una reunión Zoom para configurar.");
            }
            const meetingInfo = await obtenerReunionZoomHttp(token, claim.event.externalEventId);
            result = {
              externalEventId: claim.event.externalEventId,
              codigoReunion: claim.event.externalEventId,
              joinUrl: meetingInfo.joinUrl,
              payload: {
                meetingId: meetingInfo.meetingId,
                joinUrl: meetingInfo.joinUrl,
                configuradoAt: new Date().toISOString()
              }
            };
            break;
          }

          case "CANCELAR": {
            if (claim.event.reunionProveedorId) {
              await cancelarUsoReunionCompartida(repository, claim, token);
            } else if (claim.event.externalEventId) {
              try {
                await eliminarReunionZoomHttp(token, claim.event.externalEventId);
              } catch (error) {
                if (!esEventoInexistente(error)) {
                  throw error;
                }
              }
            }
            const completed = await repository.finalizarOperacion(claim, null, true);
            results.push({
              eventoProveedorId: id,
              estado: completed ? "SINCRONIZADA" : "EN_PROCESO"
            });
            continue;
          }
        }

        const completed = await repository.finalizarOperacion(claim, result, false);
        results.push({
          eventoProveedorId: id,
          estado: completed ? "SINCRONIZADA" : "EN_PROCESO",
          ...(completed && result?.codigoReunion ? { codigoReunion: result.codigoReunion } : {})
        });
      } catch (error) {
        const detail = error instanceof Error ? error.message : "Error desconocido de Zoom.";
        results.push(await repository.registrarErrorReclamado(claim, detail));
      }
      continue;
    }

    // Google Meet workflow
    if (!workspaceCreds) {
      workspaceCreds = await repository.obtenerCredencialesWorkspace();
    }
    if (!workspaceCreds.disponible || !workspaceCreds.serviceAccountEmail || !workspaceCreds.privateKey) {
      results.push(
        await repository.registrarErrorReclamado(
          claim,
          workspaceCreds.error || "Credenciales de Google Workspace no configuradas."
        )
      );
      continue;
    }

    const provider = providerFactory({
      serviceAccountEmail: workspaceCreds.serviceAccountEmail,
      privateKey: workspaceCreds.privateKey,
      subject: hostEmail
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
              conferenceData: sharedConference
            });
            externalEventId = created.externalEventId;
            await repository.guardarExternalEventIdTemprano(claim, externalEventId, created.payload);
          }

          const obtained = await obtenerConReintentos(provider, request.calendarId, externalEventId);
          if (!obtained) {
            throw new Error("Google Calendar todavía no terminó de generar el enlace Meet.");
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
            )
          };
          break;
        }

        case "REPROGRAMAR": {
          if (!claim.event.externalEventId) {
            throw new Error("No existe un evento Calendar para reprogramar.");
          }
          await provider.actualizarEvento(request.calendarId, claim.event.externalEventId, request);
          const obtained = await obtenerConReintentos(
            provider,
            request.calendarId,
            claim.event.externalEventId
          );
          if (!obtained) {
            throw new Error("Google Calendar no confirmó el evento reprogramado.");
          }
          if (!eventoCalendarCoincideConSolicitud(obtained.payload, request)) {
            throw new Error("Google Calendar todavía no refleja la reprogramación solicitada.");
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
            )
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
            )
          };
          break;
        }

        case "CANCELAR": {
          if (claim.event.externalEventId) {
            try {
              await provider.cancelarEvento(hostEmail, claim.event.externalEventId);
            } catch (error) {
              if (!esEventoInexistente(error)) {
                throw error;
              }
            }
          }
          const completed = await repository.finalizarOperacion(claim, null, true);
          results.push({
            eventoProveedorId: id,
            estado: completed ? "SINCRONIZADA" : "EN_PROCESO"
          });
          continue;
        }
      }

      const completed = await repository.finalizarOperacion(claim, result, false);
      results.push({
        eventoProveedorId: id,
        estado: completed ? "SINCRONIZADA" : "EN_PROCESO",
        ...(completed && result?.codigoReunion ? { codigoReunion: result.codigoReunion } : {})
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Error desconocido de Google.";
      const isScope = error instanceof MeetSettingsScopeError || esErrorDeScopesInsuficientes(detail);
      results.push(await repository.registrarErrorReclamado(claim, detail, isScope));
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
    if (delay) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    const result = await provider.obtenerEvento(calendarId, externalEventId);
    if (result) {
      return result;
    }
  }
  return null;
}

function esEventoInexistente(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
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

type ProvisionCompartida =
  Readonly<{ espera: true }> | Readonly<{ espera: false; meetingInfo: ZoomMeetingResult }>;

/**
 * Primer `PROVISIONAR` de una serie: reclama la creación (estado persistido, no un bloqueo que
 * se libera antes del POST a Zoom), recupera una reunión huérfana si la hay, crea la reunión
 * recurrente una sola vez y guarda su ID apenas lo recibe. Los demás encuentros la reutilizan.
 */
async function provisionarReunionCompartida(
  repository: ConferenciasRepositoryPort,
  claim: ClaimInfo,
  token: string,
  hostEmail: string
): Promise<ProvisionCompartida> {
  const {
    reclamarCreacionReunionCompartida,
    registrarExternalIdTemprano,
    guardarReunionCompartida,
    vincularEventoReunionCompartida
  } = repository;
  if (
    !reclamarCreacionReunionCompartida ||
    !registrarExternalIdTemprano ||
    !guardarReunionCompartida ||
    !vincularEventoReunionCompartida
  ) {
    throw new Error("El repositorio no soporta reuniones de Zoom compartidas.");
  }
  const serieClave = claim.event.serieClave;
  if (!serieClave) {
    throw new Error("La reunión compartida no tiene clave de serie.");
  }

  const reclamo = await reclamarCreacionReunionCompartida(claim.event.id, claim.token, new Date());
  if (!reclamo) {
    throw new Error("No se pudo reclamar la reunión compartida de la serie.");
  }
  if (reclamo.resultado === "EN_CURSO_POR_OTRO") {
    return { espera: true };
  }

  if (reclamo.resultado === "YA_CREADA") {
    if (!reclamo.externalId) {
      throw new Error("La reunión compartida figura creada pero no tiene ID de Zoom.");
    }
    const info = reclamo.joinUrl
      ? { meetingId: reclamo.externalId, joinUrl: reclamo.joinUrl }
      : await obtenerReunionZoomHttp(token, reclamo.externalId);
    // Un encuentro agregado después de crear la reunión no recibió la copia del ID: se vincula ahora.
    await vincularEventoReunionCompartida(claim, { externalId: info.meetingId, joinUrl: info.joinUrl });
    return { espera: false, meetingInfo: info };
  }

  const marca = `[serie:${serieClave}]`;
  const request = claim.event.request;
  const existente = reclamo.externalId
    ? await obtenerReunionZoomHttp(token, reclamo.externalId)
    : await buscarReunionZoomPorMarcaHttp(token, hostEmail, marca);

  let info: ZoomMeetingResult;
  if (existente) {
    info = existente;
    await registrarExternalIdTemprano(reclamo.reunionId, claim.token, info.meetingId);
  } else {
    const instancias =
      reclamo.instanciasHorarios && reclamo.instanciasHorarios.length > 0
        ? reclamo.instanciasHorarios
        : [{ inicio: request.inicio, fin: request.fin }];
    const tz = request.timezone || "America/Montevideo";
    const recurrencia = calcularRecurrenciaZoom(instancias, tz);

    const zoomRecurrente = await crearReunionZoomRecurrenteHttp(token, hostEmail, {
      topic: request.titulo,
      startTime: recurrencia.startTime,
      durationMinutes: recurrencia.durationMinutes,
      timezone: tz,
      agenda: [request.descripcion, marca].filter(Boolean).join("\n"),
      requiereGrabacion: request.requiereGrabacion ?? false,
      recurrence: recurrencia.recurrence
    });

    // Se registra externalId inmediatamente para que cualquier reintento o falla reconozca la reunión
    await registrarExternalIdTemprano(reclamo.reunionId, claim.token, zoomRecurrente.meetingId);

    if (zoomRecurrente.occurrences && zoomRecurrente.occurrences.length > 0) {
      // 1. Eliminar ocurrencias en días sobrantes (feriados / recesos)
      const sobrantes = detectarOcurrenciasSobrantes(zoomRecurrente.occurrences, instancias, tz);
      for (const occId of sobrantes) {
        try {
          await eliminarOcurrenciaZoomHttp(token, zoomRecurrente.meetingId, occId);
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 500));
          await eliminarOcurrenciaZoomHttp(token, zoomRecurrente.meetingId, occId).catch(() => undefined);
        }
      }

      // 2. Ajustar ocurrencias con horario o duración diferente a la base
      const aAjustar = detectarOcurrenciasAjustar(
        zoomRecurrente.occurrences,
        instancias.map((i) => ({
          inicio: i.inicio,
          fin: i.fin ?? new Date(i.inicio.getTime() + recurrencia.durationMinutes * 60_000)
        })),
        tz
      );
      for (const ajuste of aAjustar) {
        try {
          await actualizarOcurrenciaZoomHttp(token, zoomRecurrente.meetingId, ajuste.occurrenceId, {
            startTime: ajuste.startTime,
            durationMinutes: ajuste.durationMinutes
          });
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 500));
          await actualizarOcurrenciaZoomHttp(token, zoomRecurrente.meetingId, ajuste.occurrenceId, {
            startTime: ajuste.startTime,
            durationMinutes: ajuste.durationMinutes
          }).catch(() => undefined);
        }
      }
    }

    info = zoomRecurrente;
  }

  await guardarReunionCompartida(reclamo.reunionId, claim.token, {
    externalId: info.meetingId,
    joinUrl: info.joinUrl
  });
  await vincularEventoReunionCompartida(claim, { externalId: info.meetingId, joinUrl: info.joinUrl });
  return { espera: false, meetingInfo: info };
}

/**
 * Cancelar un encuentro desvincula su uso. La reunión Zoom se elimina solo cuando no queda
 * ningún encuentro activo y todavía no fue eliminada; primero en Zoom (404 se tolera) y
 * después se marca, para que un fallo intermedio no deje una reunión huérfana.
 */
async function cancelarUsoReunionCompartida(
  repository: ConferenciasRepositoryPort,
  claim: ClaimInfo,
  token: string
): Promise<void> {
  const { usosDeReunionCompartida, marcarReunionCompartidaEliminada } = repository;
  const reunionId = claim.event.reunionProveedorId;
  if (!reunionId || !usosDeReunionCompartida || !marcarReunionCompartidaEliminada) {
    throw new Error("El repositorio no soporta reuniones de Zoom compartidas.");
  }
  const estado = await usosDeReunionCompartida(reunionId);
  if (estado.eliminada || !debeEliminarseReunionCompartida(estado.usos, claim.event.id, new Date())) {
    return;
  }

  const externalId = estado.externalId ?? claim.event.externalEventId;
  if (externalId) {
    try {
      await eliminarReunionZoomHttp(token, externalId);
    } catch (error) {
      if (!esEventoInexistente(error)) {
        throw error;
      }
    }
  }
  await marcarReunionCompartidaEliminada(reunionId);
}
