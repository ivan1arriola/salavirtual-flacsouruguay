import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, ExternalLink, Link2, Settings2 } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { descifrarConfiguracion } from "@/src/lib/config/encryption";
import { db } from "@/src/lib/db";
import { formatDate, formatTime } from "@/src/lib/ui/format";
import { listarEventosGoogleCalendar } from "@/src/modules/meet/google-calendar.adapter";
import { reconciliarEventosCalendarioSalas, type EventoCalendarioSala } from "@/src/modules/reuniones/calendario-salas.domain";
import { resolverSemanaCalendarioSalas } from "@/src/modules/reuniones/calendario-salas.service";

type SearchParams = Readonly<{ desde?: string; sala?: string }>;

export default async function CalendarioSalasPage({ searchParams }: Readonly<{ searchParams: Promise<SearchParams> }>) {
  const session = await auth();
  if (session?.user.role !== "ADMINISTRACION") redirect("/");
  const query = await searchParams;
  const semana = resolverSemanaCalendarioSalas(query.desde, new Date());
  const selectedRoom = query.sala?.trim() ?? "";
  const [configuration, rooms] = await Promise.all([
    db.configuracionGoogleWorkspace.findUnique({ where: { id: "principal" } }),
    db.cuentaProveedor.findMany({
      where: { activa: true, emailOrganizador: { not: null }, proveedor: { tipo: "GOOGLE_MEET" } },
      select: { id: true, nombre: true, emailOrganizador: true }, orderBy: { prioridad: "asc" }
    })
  ]);
  const visibleRooms = selectedRoom ? rooms.filter(({ id }) => id === selectedRoom) : rooms;
  const instances = await db.instanciaSala.findMany({
    where: {
      estado: { not: "CANCELADA" }, inicioProgramadoAt: { lt: semana.hasta }, finProgramadoAt: { gt: semana.desde },
      eventosProveedor: { some: { cuentaProveedorId: { in: visibleRooms.map(({ id }) => id) }, proveedor: { tipo: "GOOGLE_MEET" } } }
    },
    select: {
      id: true, inicioProgramadoAt: true, finProgramadoAt: true, solicitud: { select: { id: true, titulo: true } },
      eventosProveedor: { where: { proveedor: { tipo: "GOOGLE_MEET" } }, select: { cuentaProveedorId: true, externalEventId: true, joinUrl: true, estadoIntegracion: true } }
    }
  });
  const canReadGoogle = Boolean(configuration?.activa && configuration.serviceAccountEmail && configuration.privateKeyCifrada);
  const privateKey = canReadGoogle && configuration?.privateKeyCifrada ? descifrarConfiguracion(configuration.privateKeyCifrada) : undefined;
  const calendars = await Promise.all(visibleRooms.map(async (room) => {
    const localMeetings = instances.flatMap((instance) => instance.eventosProveedor.filter((event) => event.cuentaProveedorId === room.id).map((event) => ({
      instanciaId: instance.id, solicitudId: instance.solicitud.id, externalEventId: event.externalEventId, titulo: instance.solicitud.titulo,
      inicio: instance.inicioProgramadoAt, fin: instance.finProgramadoAt, estadoIntegracion: event.estadoIntegracion, enlaceMeet: event.joinUrl
    })));
    if (!canReadGoogle || !privateKey || !room.emailOrganizador || !configuration?.serviceAccountEmail) {
      return { room, events: reconciliarEventosCalendarioSalas([], localMeetings), error: "Google Workspace no está configurado para consultar este calendario." };
    }
    try {
      const googleEvents = await listarEventosGoogleCalendar({ serviceAccountEmail: configuration.serviceAccountEmail, privateKey, subject: room.emailOrganizador }, room.emailOrganizador, semana);
      return { room, events: reconciliarEventosCalendarioSalas(googleEvents, localMeetings), error: null };
    } catch {
      return { room, events: reconciliarEventosCalendarioSalas([], localMeetings), error: "No se pudo consultar Google Calendar para esta sala." };
    }
  }));
  const entries = calendars.flatMap(({ room, events }) => events.map((event) => ({ room, event }))).sort((left, right) => left.event.inicio.getTime() - right.event.inicio.getTime());
  const errors = calendars.filter(({ error }) => error);

  return <>
    <header className="page-header"><div><p className="page-eyebrow">Administración</p><h1>Calendario de salas</h1><p>Agenda de Google Calendar de todas las cuentas Meet y su estado en Sala Virtual.</p></div><CalendarDays size={28} color="var(--brand)" /></header>
    <section className="content-section">
      <div className="section-heading"><div><h2>{formatDate(semana.desde)} — {formatDate(new Date(semana.hasta.getTime() - 1))}</h2><p>{entries.length} eventos en {visibleRooms.length} {visibleRooms.length === 1 ? "sala" : "salas"}.</p></div><div className="inline-actions"><Link className="secondary-action" href={calendarHref(addDays(semana.desde, -7), selectedRoom)}><ChevronLeft size={16} />Semana anterior</Link><Link className="secondary-action" href={calendarHref(addDays(semana.desde, 7), selectedRoom)}>Semana siguiente<ChevronRight size={16} /></Link></div></div>
      <nav className="user-type-tabs" aria-label="Filtrar por sala"><Link className={!selectedRoom ? "is-active" : undefined} href={calendarHref(semana.desde, "")}>Todas <strong>{rooms.length}</strong></Link>{rooms.map((room) => <Link className={selectedRoom === room.id ? "is-active" : undefined} href={calendarHref(semana.desde, room.id)} key={room.id}>{room.nombre}</Link>)}</nav>
    </section>
    {errors.length ? <p className="form-notice form-notice-error"><AlertTriangle size={16} />{errors.map(({ room }) => room.nombre).join(", ")}: no se pudo leer Google Calendar. Las reuniones locales siguen visibles.</p> : null}
    <section className="content-section"><div className="section-heading"><div><h2>Agenda</h2><p>Los eventos externos sólo se muestran. Las reuniones administradas se editan desde su ficha.</p></div></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Fecha y hora</th><th>Reunión</th><th>Sala</th><th>Estado</th><th></th></tr></thead><tbody>{entries.map(({ room, event }) => <CalendarRow event={event} key={`${room.id}:${event.id}`} roomName={room.nombre} />)}{!entries.length ? <tr><td className="empty-table-cell" colSpan={5}>No hay reuniones en este período.</td></tr> : null}</tbody></table></div></section>
  </>;
}

function CalendarRow({ event, roomName }: Readonly<{ event: EventoCalendarioSala; roomName: string }>) {
  const managed = event.estado === "ADMINISTRADA" || event.estado === "SIN_EVENTO_GOOGLE";
  return <tr><td><strong>{formatDate(event.inicio)}</strong><small>{formatTime(event.inicio)}–{formatTime(event.fin)}</small></td><td><strong>{event.titulo}</strong>{event.enlaceMeet ? <a className="text-link" href={event.enlaceMeet} rel="noreferrer" target="_blank"><Link2 size={14} />Abrir Meet</a> : null}</td><td>{roomName}</td><td><span className={`status ${event.estado === "ADMINISTRADA" ? "status-ok" : event.estado === "EXTERNA" ? "status-warning" : "status-error"}`}>{event.estado === "ADMINISTRADA" ? "Sala Virtual" : event.estado === "EXTERNA" ? "Externa" : "Sin evento Google"}</span></td><td>{managed && event.solicitudId ? <Link className="icon-link" href={`/reuniones/${encodeURIComponent(event.solicitudId)}`} title="Editar reunión o serie"><Settings2 size={18} /><span className="sr-only">Editar reunión o serie</span></Link> : <ExternalLink size={17} aria-label="Evento externo" />}</td></tr>;
}

function addDays(date: Date, days: number): Date { return new Date(date.getTime() + days * 24 * 60 * 60 * 1000); }

function calendarHref(desde: Date, sala: string): string { const date = desde.toLocaleDateString("en-CA", { timeZone: "America/Montevideo" }); return `/calendario-salas?desde=${date}${sala ? `&sala=${encodeURIComponent(sala)}` : ""}`; }
