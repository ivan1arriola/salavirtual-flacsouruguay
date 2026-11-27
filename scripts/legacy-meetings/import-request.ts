import {
  mapearEstadoSolicitudLegacy,
  mapearTipoInstanciasLegacy,
  normalizarNombrePrograma,
} from "../../src/modules/migracion/reuniones-legacy.domain";
import type { MapeosLegacy } from "./catalogs";
import { jsonValue, target } from "./clients";
import { importarEvento } from "./import-event";
import type { SolicitudLegacy } from "./source";

export async function importarSolicitud(
  solicitud: SolicitudLegacy,
  zoomProviderId: string,
  mapeos: MapeosLegacy,
): Promise<void> {
  const eventosVigentes = solicitud.eventos.filter(
    ({ estadoEvento }) => estadoEvento !== "CANCELADO",
  );
  if (eventosVigentes.length === 0) return;
  const estadoSolicitud = solicitud.estadoSolicitud.startsWith("CANCELADA")
    ? "PROVISIONADA"
    : mapearEstadoSolicitudLegacy(solicitud.estadoSolicitud);
  const docenteUsuario = mapeos.usuariosPorLegacy.get(solicitud.docente.usuarioId);
  const creador = mapeos.usuariosPorLegacy.get(solicitud.createdBy.id);
  const programaId = mapeos.programasPorNombre.get(
    normalizarNombrePrograma(solicitud.programaNombre ?? "").toLowerCase(),
  );
  if (!docenteUsuario?.docente || !creador || !programaId) {
    throw new Error(`No se pudo resolver docente, creador o programa de ${solicitud.id}.`);
  }

  const docentePrograma = await target.docentePrograma.upsert({
    where: {
      docenteId_programaId: {
        docenteId: docenteUsuario.docente.id,
        programaId,
      },
    },
    create: { docenteId: docenteUsuario.docente.id, programaId },
    update: { activo: true },
  });
  const solicitudNueva = await target.solicitudSala.upsert({
    where: { legacyZoomSolicitudId: solicitud.id },
    create: {
      legacyZoomSolicitudId: solicitud.id,
      docenteProgramaId: docentePrograma.id,
      creadaPorUsuarioId: creador.id,
      titulo: solicitud.titulo,
      descripcion: solicitud.descripcion,
      responsableNombre: solicitud.responsableNombre,
      finalidadAcademica: solicitud.finalidadAcademica,
      modalidad: solicitud.modalidadReunion,
      tipoInstancias: mapearTipoInstanciasLegacy(solicitud.tipoInstancias),
      timezone: solicitud.timezone,
      fechaInicioSolicitada: eventosVigentes.reduce(
        (earliest, evento) =>
          evento.inicioProgramadoAt < earliest ? evento.inicioProgramadoAt : earliest,
        eventosVigentes[0].inicioProgramadoAt,
      ),
      fechaFinSolicitada: eventosVigentes.reduce(
        (latest, evento) => (evento.finProgramadoAt > latest ? evento.finProgramadoAt : latest),
        eventosVigentes[0].finProgramadoAt,
      ),
      cantidadInstancias: eventosVigentes.length,
      capacidadEstimada: solicitud.capacidadEstimada,
      requiereAsistenciaTecnica: solicitud.requiereAsistencia,
      motivoAsistenciaTecnica: solicitud.motivoAsistencia,
      requiereGrabacion: solicitud.requiereGrabacion,
      regimenEncuentros: solicitud.regimenEncuentros,
      fechaFinRecurrencia: solicitud.fechaFinRecurrencia,
      patronRecurrencia: jsonValue(solicitud.patronRecurrencia),
      estado: estadoSolicitud,
      observacionesAdmin: solicitud.observacionesAdmin,
      canceladaAt: solicitud.canceladaPorDocenteAt,
      canceladaMotivo: solicitud.canceladaMotivo,
      createdAt: solicitud.createdAt,
      updatedAt: solicitud.updatedAt,
    },
    update: {
      docenteProgramaId: docentePrograma.id,
      creadaPorUsuarioId: creador.id,
      titulo: solicitud.titulo,
      descripcion: solicitud.descripcion,
      responsableNombre: solicitud.responsableNombre,
      finalidadAcademica: solicitud.finalidadAcademica,
      cantidadInstancias: eventosVigentes.length,
      estado: estadoSolicitud,
    },
  });

  await target.instanciaSala.deleteMany({
    where: {
      solicitudSalaId: solicitudNueva.id,
      estado: "CANCELADA",
    },
  });

  for (const [index, evento] of eventosVigentes.entries()) {
    await importarEvento(
      evento,
      index,
      solicitudNueva.id,
      solicitud.modalidadReunion,
      solicitud.requiereGrabacion,
      zoomProviderId,
      mapeos,
    );
  }
}
