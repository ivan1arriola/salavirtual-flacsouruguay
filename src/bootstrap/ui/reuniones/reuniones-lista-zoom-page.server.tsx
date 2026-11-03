import { CalendarDays, CalendarPlus, History, Search } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ZoomJoinActions } from "@/src/components/zoom-join-actions";
import { ZoomLinkStatus } from "@/src/components/zoom-link-status";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { formatDate, formatShortDate, formatTime } from "@/src/lib/ui/format";
import { resumenEnlaceZoom } from "@/src/modules/reuniones/estado-enlace-zoom.domain";
import {
  obtenerDatosPaginaReuniones,
  type PeriodoAgenda
} from "@/src/modules/reuniones/reuniones-page.service";
import { puedeVerAgendaCompleta } from "@/src/modules/reuniones/reuniones.domain";
import styles from "@/app/(gestion)/reuniones/reuniones-zoom.module.css";

type SearchParams = Readonly<{
  q?: string;
  programa?: string;
  periodo?: string;
  page?: string;
  desde?: string;
  hasta?: string;
}>;

export default async function ReunionesZoomPage({
  searchParams
}: Readonly<{ searchParams: Promise<SearchParams> }>) {
  const session = await auth();
  if (!session?.user) redirect("/acceso");

  const actor = await resolveSessionActor(db, {
    id: session.user.id,
    email: session.user.email
  });
  if (!actor?.activo || !puedeVerAgendaCompleta(actor.rol)) redirect("/mi-agenda");

  const params = await searchParams;
  const esAdmin = actor.rol === "ADMINISTRACION";
  const datos = await obtenerDatosPaginaReuniones(db, actor, { ...params, vista: "encuentros" });
  const { q, programaId, periodo, isHistory, pagination, programs, desdeParam, hastaParam } = datos;
  const encuentros = datos.meetings;
  const href = (page?: number, nuevoPeriodo: PeriodoAgenda = periodo) =>
    reunionesHref({ q, programa: programaId, periodo: nuevoPeriodo, desde: desdeParam, hasta: hastaParam, page });

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className="page-eyebrow">{formatShortDate(new Date())}</p>
          <h1>Reuniones</h1>
          <p>{isHistory ? "Reuniones realizadas." : "Próximas reuniones por Zoom."}</p>
        </div>
        <Link className="primary-action" href="/reuniones/nueva">
          <CalendarPlus size={18} aria-hidden="true" />
          Nueva reunión
        </Link>
      </header>

      {esAdmin ? (
        <p>
          <Link className="secondary-action" href="/reuniones/migracion-zoom">Migración a Zoom</Link>
        </p>
      ) : null}

      <nav className={styles.tabs} aria-label="Período de reuniones">
          <Link aria-current={!isHistory ? "page" : undefined} href={href(undefined, "proximas")}>
            <CalendarDays size={17} aria-hidden="true" /> Próximas
          </Link>
          <Link aria-current={isHistory ? "page" : undefined} href={href(undefined, "anteriores")}>
            <History size={17} aria-hidden="true" /> Pasadas
          </Link>
        </nav>

      <form className={styles.filters} method="get">
        <input name="periodo" type="hidden" value={periodo} />
        <label className={styles.search}>
          <span className="sr-only">Buscar reuniones</span>
          <Search size={18} aria-hidden="true" />
          <input aria-label="Buscar reuniones" defaultValue={q} name="q" placeholder="Buscar por título, programa o docente" type="search" />
        </label>
        {esAdmin ? (
          <label>
            <span className="sr-only">Filtrar por programa</span>
            <select aria-label="Filtrar por programa" defaultValue={programaId} name="programa">
              <option value="">Todos los programas</option>
              {programs.map((program) => <option key={program.id} value={program.id}>{program.nombre}</option>)}
            </select>
          </label>
        ) : null}
        <label>
          <span className="sr-only">Desde</span>
          <input aria-label="Fecha desde" defaultValue={desdeParam} name="desde" type="date" />
        </label>
        <label>
          <span className="sr-only">Hasta</span>
          <input aria-label="Fecha hasta" defaultValue={hastaParam} name="hasta" type="date" />
        </label>
        <button className="secondary-action" type="submit">Aplicar</button>
        {q || programaId || desdeParam || hastaParam ? <Link href={reunionesHref({ periodo })}>Limpiar</Link> : null}
      </form>

      {encuentros.length === 0 ? (
        <p className={styles.empty} role="status">No hay reuniones para mostrar.</p>
      ) : (
        <ul className={styles.list}>
          {encuentros.map((encuentro) => {
            const enlace = resumenEnlaceZoom(encuentro);
            const { docentePrograma } = encuentro.solicitud;
            const docente = `${docentePrograma.docente.usuario.nombres} ${docentePrograma.docente.usuario.apellidos ?? ""}`.trim();
            return (
              <li className={styles.item} key={encuentro.id}>
                <div className={styles.when}>
                  <strong>{formatDate(encuentro.inicioProgramadoAt)}</strong>
                  <span>{formatTime(encuentro.inicioProgramadoAt)} – {formatTime(encuentro.finProgramadoAt)}</span>
                </div>
                <div className={styles.what}>
                  <Link href={`/reuniones/${encuentro.solicitudSalaId}`}>{encuentro.solicitud.titulo}</Link>
                  <span>{docentePrograma.programa.nombre} · {docente}</span>
                </div>
                <div className={styles.link}>
                  <ZoomLinkStatus
                    estado={enlace.estado}
                    esAdmin={esAdmin}
                    eventoProveedorId={enlace.eventoProveedorId}
                    operacion={enlace.operacion}
                  />
                  {enlace.joinUrl && !isHistory ? <ZoomJoinActions url={enlace.joinUrl} /> : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {pagination.totalPaginas > 1 ? (
        <nav className={styles.pagination} aria-label="Paginación de reuniones">
          {pagination.tieneAnterior ? <Link className="secondary-action" href={href(pagination.paginaActual - 1)}>Anterior</Link> : null}
          <span>Página <strong>{pagination.paginaActual}</strong> de <strong>{pagination.totalPaginas}</strong></span>
          {pagination.tieneSiguiente ? <Link className="secondary-action" href={href(pagination.paginaActual + 1)}>Siguiente</Link> : null}
        </nav>
      ) : null}
    </div>
  );
}

function reunionesHref(params: Readonly<{
  q?: string;
  programa?: string;
  periodo?: PeriodoAgenda;
  desde?: string;
  hasta?: string;
  page?: number;
}>): string {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.programa) search.set("programa", params.programa);
  if (params.periodo === "anteriores") search.set("periodo", params.periodo);
  if (params.desde) search.set("desde", params.desde);
  if (params.hasta) search.set("hasta", params.hasta);
  if (params.page && params.page > 1) search.set("page", String(params.page));
  const query = search.toString();
  return query ? `/reuniones?${query}` : "/reuniones";
}
