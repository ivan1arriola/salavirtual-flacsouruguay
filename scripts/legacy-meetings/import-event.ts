import {
  mapearEstadoAsignacionLegacy,
  mapearEstadoInstanciaLegacy
} from "../../src/modules/migracion/reuniones-legacy.domain";
import type { MapeosLegacy } from "./catalogs";
import { jsonValue, target } from "./clients";
import type { SolicitudLegacy } from "./source";
import type { ModalidadReunion } from "@prisma/client";

type EventoLegacy = SolicitudLegacy["eventos"][number];

export async function importarEvento(
  evento: EventoLegacy,
  index: number,
  solicitudSalaId: string,
  modalidad: ModalidadReunion,
  requiereGrabacion: boolean,
  zoomProviderId: string,
  mapeos: MapeosLegacy
): Promise<void> {
  const instancia = await target.instanciaSala.upsert({
    where: { legacyZoomEventoId: evento.id },
    create: {
      legacyZoomEventoId: evento.id,
      solicitudSalaId,
      ordinal: index + 1,
      inicioProgramadoAt: evento.inicioProgramadoAt,
      finProgramadoAt: evento.finProgramadoAt,
      timezone: evento.timezone,
      estado: mapearEstadoInstanciaLegacy(evento.estadoEvento),
      requiereAsistenciaTecnica: evento.requiereAsistencia,
      requiereGrabacion,
      inicioRealAt: evento.inicioRealAt,
      finRealAt: evento.finRealAt,
      minutosReportados: evento.minutosReportados,
      comentariosReporte: evento.comentariosReporte,
      costoEstimado: evento.costoEstimado?.toString(),
      costoReal: evento.costoReal?.toString()
    },
    update: {
      ordinal: index + 1,
      inicioProgramadoAt: evento.inicioProgramadoAt,
      finProgramadoAt: evento.finProgramadoAt,
      timezone: evento.timezone,
      estado: mapearEstadoInstanciaLegacy(evento.estadoEvento),
      inicioRealAt: evento.inicioRealAt,
      finRealAt: evento.finRealAt,
      minutosReportados: evento.minutosReportados,
      costoEstimado: evento.costoEstimado?.toString(),
      costoReal: evento.costoReal?.toString()
    }
  });
  const cuentaProveedorId = mapeos.cuentasPorLegacy.get(evento.cuentaZoomId);
  if (!cuentaProveedorId) {
    throw new Error(`No se pudo resolver la cuenta host de ${evento.id}.`);
  }
  await target.eventoProveedor.upsert({
    where: {
      instanciaSalaId_proveedorId: {
        instanciaSalaId: instancia.id,
        proveedorId: zoomProviderId
      }
    },
    create: {
      instanciaSalaId: instancia.id,
      proveedorId: zoomProviderId,
      cuentaProveedorId,
      externalEventId: evento.zoomMeetingId,
      codigoReunion: evento.zoomMeetingId,
      joinUrl: evento.zoomJoinUrl,
      payloadUltimo: jsonValue(evento.zoomPayloadUltimo),
      sincronizadoAt: evento.sincronizadoConZoomAt,
      estadoIntegracion: "HISTORICA",
      errorIntegracion: evento.errorIntegracion,
      createdAt: evento.createdAt,
      updatedAt: evento.updatedAt
    },
    update: {
      cuentaProveedorId,
      externalEventId: evento.zoomMeetingId,
      codigoReunion: evento.zoomMeetingId,
      joinUrl: evento.zoomJoinUrl,
      payloadUltimo: jsonValue(evento.zoomPayloadUltimo),
      sincronizadoAt: evento.sincronizadoConZoomAt,
      estadoIntegracion: "HISTORICA",
      errorIntegracion: evento.errorIntegracion
    }
  });
  await importarAsignaciones(evento, instancia.id, modalidad, mapeos);
}

async function importarAsignaciones(
  evento: EventoLegacy,
  instanciaSalaId: string,
  modalidad: ModalidadReunion,
  mapeos: MapeosLegacy
): Promise<void> {
  const asignaciones = [...evento.asignaciones]
    .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())
    .filter(
      (asignacion, position, all) =>
        all.findIndex((candidate) => candidate.asistenteZoomId === asignacion.asistenteZoomId) === position
    );
  for (const asignacion of asignaciones) {
    const usuario = mapeos.usuariosPorLegacy.get(asignacion.asistente.usuarioId);
    if (!usuario?.asistenteTecnico) {
      throw new Error(`No se pudo resolver asistente de ${asignacion.id}.`);
    }
    const tarifa =
      (await target.tarifaAsistenciaTecnica.findFirst({
        where: {
          modalidad,
          valorHora: asignacion.tarifaAplicadaHora.toString(),
          moneda: asignacion.moneda
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { id: true }
      })) ??
      (await target.tarifaAsistenciaTecnica.create({
        data: {
          modalidad,
          valorHora: asignacion.tarifaAplicadaHora.toString(),
          moneda: asignacion.moneda,
          createdAt: asignacion.createdAt
        },
        select: { id: true }
      }));
    await target.asignacionAsistenciaTecnica.upsert({
      where: { legacyZoomAsignacionId: asignacion.id },
      create: {
        legacyZoomAsignacionId: asignacion.id,
        instanciaSalaId,
        asistenteTecnicoId: usuario.asistenteTecnico.id,
        tarifaAsistenciaTecnicaId: tarifa.id,
        estado: mapearEstadoAsignacionLegacy(asignacion.estadoAsignacion),
        tarifaHoraAplicada: asignacion.tarifaAplicadaHora.toString(),
        moneda: asignacion.moneda,
        montoConfirmado: asignacion.montoConfirmado?.toString(),
        createdAt: asignacion.createdAt,
        updatedAt: asignacion.updatedAt
      },
      update: {
        estado: mapearEstadoAsignacionLegacy(asignacion.estadoAsignacion),
        tarifaAsistenciaTecnicaId: tarifa.id,
        tarifaHoraAplicada: asignacion.tarifaAplicadaHora.toString(),
        moneda: asignacion.moneda,
        montoConfirmado: asignacion.montoConfirmado?.toString()
      }
    });
  }
}
