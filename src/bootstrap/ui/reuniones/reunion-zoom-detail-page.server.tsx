import { ArrowLeft, CalendarDays, Clock3, History, Repeat2, UserRound, Video } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { OtroProveedorAviso } from "@/src/components/proveedor-tabs";
import { CorregirSerieZoomBoton } from "@/src/components/corregir-serie-zoom-boton";
import { puedeVerEnlaceAnfitrion } from "@/src/modules/reuniones/enlace-anfitrion.domain";
import { resumenCuentasAnfitrionas } from "@/src/modules/reuniones/lista-zoom-agrupacion.domain";
import {
  proveedorActivoDeInstancia,
  type ProveedorReunion
} from "@/src/modules/reuniones/proveedor-reunion.domain";
import { puedeGestionarEncuentros } from "@/src/modules/reuniones/encuentros.domain";
import { resumenEnlaceZoom } from "@/src/modules/reuniones/estado-enlace-zoom.domain";
import { seleccionarEventoProveedorActivo } from "@/src/modules/reuniones/evento-proveedor-activo.domain";
import { puedeGestionarPrograma } from "@/src/modules/reuniones/permisos-programa.service";
import {
  claveSerieReunion,
  construirFiltroSerieSolicitud
} from "@/src/modules/reuniones/serie-reunion.domain";
import { ReunionZoomEncuentros } from "@/src/modules/reuniones/presentation/components/reunion-zoom-encuentros";
import {
  agruparActividadPorEncuentro,
  agruparAvisosPorReunionYHorario
} from "@/src/modules/reuniones/uuids-ocurrencias-zoom.domain";

const TOPE_AVISOS_SERIE = 2000;

export default async function ReunionZoomDetailPage({
  params,
  otroProveedor = null
}: Readonly<{
  params: Promise<{ solicitudId: string }>;
  /** Encuentros de la misma serie que siguen en el otro proveedor: viven en su propio panel. */
  otroProveedor?: Readonly<{ proveedor: ProveedorReunion; cantidad: number; href: string }> | null;
}>) {
  const session = await auth();
  if (!session?.user) {
    redirect("/acceso");
  }
  const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
  if (!actor?.activo) {
    redirect("/acceso");
  }

  const { solicitudId } = await params;
  const solicitud = await db.solicitudSala.findUnique({
    where: { id: solicitudId },
    include: {
      docentePrograma: { include: { programa: true, docente: { include: { usuario: true } } } }
    }
  });
  if (!solicitud || !(await puedeGestionarPrograma(db, actor, solicitud.docentePrograma.programaId))) {
    notFound();
  }

  const serie = await db.solicitudSala.findMany({
    where: construirFiltroSerieSolicitud(solicitud),
    orderBy: { id: "asc" },
    select: {
      id: true,
      instancias: {
        orderBy: { inicioProgramadoAt: "asc" },
        include: {
          eventosProveedor: {
            include: {
              proveedor: true,
              cuentaProveedor: { select: { nombre: true, emailOrganizador: true } }
            }
          }
        }
      }
    }
  });

  const ahora = new Date();
  const docente = solicitud.docentePrograma.docente.usuario;
  const verAnfitrion = puedeVerEnlaceAnfitrion(actor, docente.id);
  const puedeModificar = puedeGestionarEncuentros(actor.rol, actor.id, docente.id);
  const esAdmin = actor.rol === "ADMINISTRACION";

  const encuentros = serie
    .flatMap(({ id, instancias }) => {
      // El servidor exige conservar al menos un encuentro por solicitud.
      const activos = instancias.filter(({ estado }) => estado !== "CANCELADA").length;
      return instancias
        .filter((instancia) => proveedorActivoDeInstancia(instancia) === "ZOOM")
        .map((instancia) => {
          const enlace = resumenEnlaceZoom(instancia);
          const activo = seleccionarEventoProveedorActivo(instancia);
          const puedeUnirse = instancia.estado === "PROGRAMADA" && instancia.finProgramadoAt > ahora;
          return {
            id: instancia.id,
            solicitudId: id,
            inicioIso: instancia.inicioProgramadoAt.toISOString(),
            finIso: instancia.finProgramadoAt.toISOString(),
            descripcion: instancia.descripcion ?? null,
            estado: instancia.estado,
            editable: instancia.estado === "PROGRAMADA" && instancia.inicioProgramadoAt > ahora,
            puedeCancelar:
              instancia.estado === "PROGRAMADA" && instancia.inicioProgramadoAt > ahora && activos > 1,
            puedeUnirse,
            joinUrl: enlace.joinUrl,
            cuentaAnfitrion: enlace.cuentaAnfitrion,
            zoomMeetingId:
              activo?.proveedor.tipo === "ZOOM"
                ? (activo.codigoReunion ?? activo.externalEventId ?? null)
                : null,
            puedeIniciar: puedeUnirse && verAnfitrion && activo?.proveedor.tipo === "ZOOM",
            estadoEnlace: enlace.estado,
            eventoProveedorId: enlace.eventoProveedorId,
            operacion: enlace.operacion
          };
        });
    })
    .sort((a, b) => a.inicioIso.localeCompare(b.inicioIso));

  const encuentrosPasados = encuentros.filter(
    (encuentro) => new Date(encuentro.finIso) < ahora && encuentro.estado !== "CANCELADA"
  );
  const encuentrosPendientes = encuentros.filter(
    (encuentro) => new Date(encuentro.finIso) >= ahora && encuentro.estado !== "CANCELADA"
  );
  const proximoEncuentro = encuentrosPendientes[0] ?? null;

  const zoomActivos = serie.flatMap(({ instancias }) =>
    instancias.filter(
      (instancia) => instancia.estado !== "CANCELADA" && proveedorActivoDeInstancia(instancia) === "ZOOM"
    )
  );
  const eventosZoom = zoomActivos.map((instancia) => seleccionarEventoProveedorActivo(instancia));
  const idsCompartidos = [
    ...new Set(eventosZoom.map((evento) => evento?.reunionProveedorId).filter(Boolean))
  ];
  const permiteAgregarCompartida =
    !otroProveedor &&
    zoomActivos.length > 0 &&
    idsCompartidos.length === 1 &&
    eventosZoom.every((evento) => evento?.reunionProveedorId === idsCompartidos[0]);
  // Una serie Zoom debe compartir el mismo ID externo, enlace y anfitrión.
  // Se omiten encuentros cancelados: no deben disparar correcciones operativas.
  const distintos = (valores: readonly (string | null | undefined)[]) =>
    new Set(valores.filter((valor): valor is string => Boolean(valor)));
  const idsZoom = distintos(eventosZoom.map((evento) => evento?.codigoReunion ?? evento?.externalEventId));
  const enlacesZoom = distintos(eventosZoom.map((evento) => evento?.joinUrl));
  const cuentasZoom = distintos(eventosZoom.map((evento) => evento?.cuentaProveedorId));
  const necesitaCorreccion =
    zoomActivos.length > 1 && (idsZoom.size > 1 || enlacesZoom.size > 1 || cuentasZoom.size > 1);
  const esSerieMixta = Boolean(otroProveedor);
  const resumenCuentas = resumenCuentasAnfitrionas(
    encuentros.filter(({ estado }) => estado !== "CANCELADA").map(({ cuentaAnfitrion }) => cuentaAnfitrion)
  );

  const idsEventos = encuentros.flatMap(({ eventoProveedorId }) =>
    eventoProveedorId ? [eventoProveedorId] : []
  );
  const ocurrencias = idsEventos.length
    ? await db.ocurrenciaArchivoZoom.findMany({
        where: { eventoProveedorId: { in: idsEventos } },
        select: { eventoProveedorId: true, cuentaZoomId: true, uuid: true }
      })
    : [];
  // Una sola consulta para toda la serie; el reparto y el límite por encuentro se hacen en memoria.
  const avisos = ocurrencias.length
    ? await db.eventoWebhookZoomAdicional.findMany({
        where: {
          OR: ocurrencias.flatMap(({ cuentaZoomId, uuid }) => [
            { cuentaZoomId, uuid },
            { cuentaZoomId, uuids: { has: uuid } }
          ])
        },
        orderBy: { ocurridoAt: "desc" },
        take: TOPE_AVISOS_SERIE,
        select: { cuentaZoomId: true, uuid: true, uuids: true, tipo: true, ocurridoAt: true }
      })
    : [];
  const actividadPorEvento = agruparActividadPorEncuentro(ocurrencias, avisos, 10);

  // Encuentros sin ejecución (UUID) vinculada: se asocian por número de reunión y horario.
  const sinEjecucion = encuentros.flatMap((encuentro) =>
    encuentro.eventoProveedorId &&
    encuentro.zoomMeetingId &&
    encuentro.estado !== "CANCELADA" &&
    !ocurrencias.some(({ eventoProveedorId }) => eventoProveedorId === encuentro.eventoProveedorId)
      ? [
          {
            eventoProveedorId: encuentro.eventoProveedorId,
            meetingId: encuentro.zoomMeetingId,
            inicio: new Date(encuentro.inicioIso),
            fin: new Date(encuentro.finIso)
          }
        ]
      : []
  );
  const avisosPorHorario = sinEjecucion.length
    ? await db.eventoWebhookZoomAdicional.findMany({
        where: {
          recursoId: { in: [...new Set(sinEjecucion.map(({ meetingId }) => meetingId))] },
          ocurridoAt: {
            gte: new Date(Math.min(...sinEjecucion.map(({ inicio }) => inicio.getTime())) - 3_600_000),
            lte: new Date(Math.max(...sinEjecucion.map(({ fin }) => fin.getTime())) + 7 * 3_600_000)
          }
        },
        orderBy: { ocurridoAt: "desc" },
        take: TOPE_AVISOS_SERIE,
        select: { recursoId: true, tipo: true, ocurridoAt: true }
      })
    : [];
  const actividadPorHorario = agruparAvisosPorReunionYHorario(sinEjecucion, avisosPorHorario, 10);

  const actividadEncuentros = encuentros.map((encuentro) => {
    const clave = encuentro.eventoProveedorId ?? "";
    const propias = ocurrencias.some(
      ({ eventoProveedorId }) => eventoProveedorId === encuentro.eventoProveedorId
    );
    const porHorario = actividadPorHorario.get(clave) ?? [];
    const lista = propias ? (actividadPorEvento.get(clave) ?? []) : porHorario;
    return {
      id: encuentro.id,
      fecha: encuentro.inicioIso,
      // Sin ejecución vinculada ni número de reunión no hay forma de asociar avisos: no se afirma que no haya actividad.
      sinAsociar: !propias && !sinEjecucion.some(({ eventoProveedorId }) => eventoProveedorId === clave),
      porHorario: !propias && porHorario.length > 0,
      eventos: lista.map(({ tipo, ocurridoAt }) => ({ tipo, ocurridoAt: ocurridoAt.toISOString() }))
    };
  });

  return (
    <div className="meeting-detail-v2 zoom-series-page">
      <Link className="meeting-detail-back" href="/reuniones?proveedor=zoom">
        <ArrowLeft size={15} aria-hidden="true" />
        Volver a reuniones
      </Link>
      {otroProveedor ? <OtroProveedorAviso {...otroProveedor} /> : null}
      <header className="zoom-series-hero">
        <div className="zoom-series-hero__content">
          <p className="zoom-series-hero__eyebrow">{solicitud.docentePrograma.programa.nombre}</p>
          <h1>{solicitud.titulo}</h1>
          <p className="zoom-series-hero__teacher">
            {[docente.nombres, docente.apellidos].filter(Boolean).join(" ")}
          </p>
          {solicitud.descripcion ? (
            <p className="zoom-series-hero__description">{solicitud.descripcion}</p>
          ) : null}
          <div className="zoom-series-hero__facts" aria-label="Información de la serie">
            <span>
              <CalendarDays size={17} aria-hidden="true" /> Clases sincrónicas
            </span>
            <span>
              <Repeat2 size={17} aria-hidden="true" /> {encuentros.length}{" "}
              {encuentros.length === 1 ? "encuentro" : "encuentros"}
            </span>
            <span>
              <Video size={17} aria-hidden="true" /> Zoom
            </span>
            <span className="zoom-series-hero__host" data-cuentas={resumenCuentas.tipo}>
              <UserRound size={17} aria-hidden="true" /> Cuenta anfitriona:{" "}
              <strong>
                {resumenCuentas.tipo === "NINGUNA"
                  ? "Sin asignar"
                  : resumenCuentas.tipo === "UNA"
                    ? resumenCuentas.correos[0]
                    : `Varias (${resumenCuentas.correos.join(", ")})`}
              </strong>
            </span>
          </div>
        </div>
        <div className="zoom-series-hero__brand" aria-hidden="true">
          <span className="zoom-series-hero__brand-mark">SV</span>
          <span>
            FLACSO
            <br />
            URUGUAY
          </span>
        </div>
      </header>
      <section className="meeting-detail-summary" aria-label="Resumen de encuentros de la serie">
        <article>
          <Repeat2 size={18} aria-hidden="true" />
          <div>
            <span>Encuentros</span>
            <strong>{encuentros.length}</strong>
            <small>Incluye encuentros cancelados</small>
          </div>
        </article>
        <article>
          <History size={18} aria-hidden="true" />
          <div>
            <span>Pasados</span>
            <strong>{encuentrosPasados.length}</strong>
            <small>Su realización debe verificarse con Zoom</small>
          </div>
        </article>
        <article>
          <Clock3 size={18} aria-hidden="true" />
          <div>
            <span>Pendientes</span>
            <strong>{encuentrosPendientes.length}</strong>
            <small>Según horario programado</small>
          </div>
        </article>
        <article>
          <CalendarDays size={18} aria-hidden="true" />
          <div>
            <span>Próximo encuentro</span>
            <strong>
              {proximoEncuentro
                ? new Intl.DateTimeFormat("es-UY", {
                    dateStyle: "medium",
                    timeZone: "America/Montevideo"
                  }).format(new Date(proximoEncuentro.inicioIso))
                : "Sin próximos"}
            </strong>
            {proximoEncuentro ? (
              <Link href={`/operacion/${proximoEncuentro.id}`}>Abrir encuentro</Link>
            ) : (
              <small>Todos los encuentros programados ya pasaron</small>
            )}
          </div>
        </article>
      </section>
      {necesitaCorreccion ? (
        <section
          className="zoom-series-link-warning"
          role="status"
          aria-label="Inconsistencia de reuniones Zoom"
        >
          <div>
            <strong>Los encuentros de esta serie tienen reuniones Zoom diferentes.</strong>
            <p>
              Se detectaron {idsZoom.size} IDs y {enlacesZoom.size} enlaces de Zoom distintos. Los encuentros
              de una misma serie deberían compartir una sola reunión y un solo enlace.
            </p>
            {esSerieMixta ? (
              <p>
                Esta serie también contiene encuentros en otro proveedor. Por seguridad, primero hay que
                resolver la migración para no alterar esos encuentros.
              </p>
            ) : null}
          </div>
          {esAdmin ? (
            esSerieMixta ? (
              <Link className="secondary-action" href="/reuniones/migracion-zoom">
                Revisar migración y corregir
              </Link>
            ) : (
              <CorregirSerieZoomBoton serieClave={claveSerieReunion(solicitud)} titulo={solicitud.titulo} />
            )
          ) : null}
        </section>
      ) : null}
      <ReunionZoomEncuentros
        encuentros={encuentros}
        actividad={Object.fromEntries(actividadEncuentros.map(({ id, ...actividad }) => [id, actividad]))}
        esAdmin={esAdmin}
        puedeModificar={puedeModificar}
        permiteCancelarSerie={!otroProveedor}
        solicitudIdParaAgregar={solicitud.id}
        permiteAgregarCompartida={permiteAgregarCompartida}
        solicitudIds={serie.map(({ id }) => id)}
      />
    </div>
  );
}
