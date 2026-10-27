import { registrarVerificacionCohosts, type ConferenceProvisionResult, type ProvisionConferenciaResult } from "../domain";
import type {
  ConferenciasRepositoryPort,
  ZoomConferenceProvider,
  ZoomConferenceProviderFactory,
} from "../ports";

/**
 * Aprovisionamiento Zoom con las mismas garantías que Meet:
 * - el meeting ID se persiste apenas Zoom responde al POST;
 * - los reintentos ejecutan solo la operación persistida y nunca repiten el
 *   POST si ya existe externalEventId;
 * - CONFIGURAR_MEET reaplica los cohosts (alternative hosts) sin tocar horario.
 */
export async function sincronizarEventosZoomUseCase(
  repository: ConferenciasRepositoryPort,
  providerFactory: ZoomConferenceProviderFactory | undefined,
  ids: readonly string[]
): Promise<readonly ProvisionConferenciaResult[]> {
  if (ids.length === 0) return [];

  const creds = repository.obtenerCredencialesZoom
    ? await repository.obtenerCredencialesZoom()
    : { disponible: false as const };
  if (!providerFactory || !creds.disponible || !creds.credentials) {
    if (creds.error) {
      return Promise.all(ids.map((id) => repository.registrarErrorSinClaim(id, creds.error!)));
    }
    return ids.map((eventoProveedorId) => ({ eventoProveedorId, estado: "PENDIENTE_CONFIGURACION" as const }));
  }

  const provider = providerFactory(creds.credentials);
  const results: ProvisionConferenciaResult[] = [];

  for (const id of ids) {
    const claim = await repository.reclamarEvento(id);
    if (!claim) {
      results.push(await repository.obtenerEstadoActual(id));
      continue;
    }

    const hostEmail = claim.event.organizerEmail;
    if (!hostEmail) {
      results.push(await repository.registrarErrorReclamado(claim, "La sala Zoom no tiene un usuario host configurado."));
      continue;
    }

    try {
      const request = claim.event.request;
      let result: ConferenceProvisionResult | null = null;

      switch (claim.operacion) {
        case "PROVISIONAR": {
          let externalEventId = claim.event.externalEventId;
          if (!externalEventId) {
            const created = await provider.crearReunion(hostEmail, request);
            externalEventId = created.externalEventId;
            await repository.guardarExternalEventIdTemprano(claim, externalEventId, created.payload);
          }
          result = await obtenerYConfigurar(provider, repository, claim, externalEventId, hostEmail);
          break;
        }

        case "REPROGRAMAR": {
          if (!claim.event.externalEventId) {
            throw new Error("No existe una reunión Zoom para reprogramar.");
          }
          await provider.actualizarReunion(claim.event.externalEventId, request);
          result = await obtenerYConfigurar(provider, repository, claim, claim.event.externalEventId, hostEmail);
          break;
        }

        case "CONFIGURAR_MEET": {
          if (!claim.event.externalEventId) {
            throw new Error("No existe una reunión Zoom para configurar.");
          }
          result = await obtenerYConfigurar(provider, repository, claim, claim.event.externalEventId, hostEmail);
          break;
        }

        case "CANCELAR": {
          if (claim.event.externalEventId) {
            await provider.cancelarReunion(claim.event.externalEventId);
          }
          const completed = await repository.finalizarOperacion(claim, null, true);
          results.push({ eventoProveedorId: id, estado: completed ? "SINCRONIZADA" : "EN_PROCESO" });
          continue;
        }
      }

      const completed = await repository.finalizarOperacion(claim, result, false);
      results.push({
        eventoProveedorId: id,
        estado: completed ? "SINCRONIZADA" : "EN_PROCESO",
        ...(completed && result?.codigoReunion ? { codigoReunion: result.codigoReunion } : {}),
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Error desconocido de Zoom.";
      results.push(await repository.registrarErrorReclamado(claim, detail));
    }
  }

  return results;
}

async function obtenerYConfigurar(
  provider: ZoomConferenceProvider,
  repository: ConferenciasRepositoryPort,
  claim: Parameters<ConferenciasRepositoryPort["persistirMeetDetectado"]>[0],
  externalEventId: string,
  hostEmail: string
): Promise<ConferenceProvisionResult> {
  const obtained = await provider.obtenerReunion(externalEventId);
  if (!obtained) {
    throw new Error("Zoom no encontró la reunión creada; puede haber sido eliminada desde Zoom.");
  }
  await repository.persistirMeetDetectado(claim, obtained);

  const cohosts = await provider.configurarCohosts(
    externalEventId,
    hostEmail,
    claim.event.request.cohostEmails ?? []
  );
  const payload = registrarVerificacionCohosts(
    obtained.payload,
    obtained.codigoReunion,
    hostEmail,
    cohosts.aplicados,
    new Date().toISOString()
  );
  const salaVirtual = (payload.salaVirtual ?? {}) as Record<string, unknown>;
  return {
    ...obtained,
    payload: {
      ...payload,
      salaVirtual: {
        ...salaVirtual,
        // Zoom no guarda invitados en la reunión; se conservan para recordatorios.
        invitadosEmails: [...(claim.event.request.guestEmails ?? [])],
        zoomCohostsFueraDeCuenta: cohosts.rechazados,
      },
    },
    ...(cohosts.rechazados.length > 0
      ? {
          warning: `Zoom solo acepta como anfitrión alternativo a usuarios de la cuenta. Promover en la reunión a: ${cohosts.rechazados.join(", ")}.`,
        }
      : {}),
  };
}
