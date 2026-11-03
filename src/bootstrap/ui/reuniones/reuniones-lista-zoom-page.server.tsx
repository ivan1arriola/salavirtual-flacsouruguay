import { CalendarDays, CalendarPlus, ChevronLeft, ChevronRight, Clock3, Hash, Layers3, List, Search, Video, X } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ProveedorTabs } from "@/src/components/proveedor-tabs";
import { CorregirSerieZoomBoton } from "@/src/components/corregir-serie-zoom-boton";
import { ZoomJoinActions } from "@/src/components/zoom-join-actions";
import { ZoomLinkStatus } from "@/src/components/zoom-link-status";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { formatShortDate, formatTime } from "@/src/lib/ui/format";
import { resumenEnlaceZoom } from "@/src/modules/reuniones/estado-enlace-zoom.domain";
import { seleccionarEventoProveedorActivo } from "@/src/modules/reuniones/evento-proveedor-activo.domain";
import { claveSerieReunion } from "@/src/modules/reuniones/serie-reunion.domain";
import { resumirSerieZoom } from "@/src/modules/reuniones/serie-zoom-resumen.domain";
import { mensajeListaVacia } from "@/src/modules/reuniones/lista-vacia.domain";
import { obtenerDatosPaginaReuniones, type PeriodoAgenda } from "@/src/modules/reuniones/reuniones-page.service";
import { puedeVerAgendaCompleta } from "@/src/modules/reuniones/reuniones.domain";
import styles from "@/app/(gestion)/reuniones/reuniones-zoom.module.css";

type SearchParams = Readonly<{
  q?: string; programa?: string; periodo?: string; page?: string; porPagina?: string;
  desde?: string; hasta?: string; proveedor?: string; vista?: string; densidad?: string;
}>;

type LinkFilters = Readonly<{
  q: string; programa: string; periodo: PeriodoAgenda; desde: string; hasta: string;
  vista: "series" | "encuentros"; porPagina: number; densidad: "normal" | "compacta";
  page?: number;
}>;

function reunionesHref(params: LinkFilters): string {
  const search = new URLSearchParams();
  search.set("proveedor", "zoom");
  if (params.vista === "series") search.set("vista", "series");
  if (params.densidad === "compacta") search.set("densidad", "compacta");
  if (params.q) search.set("q", params.q);
  if (params.programa) search.set("programa", params.programa);
  if (params.periodo === "anteriores") search.set("periodo", params.periodo);
  if (params.desde) search.set("desde", params.desde);
  if (params.hasta) search.set("hasta", params.hasta);
  if (params.porPagina !== 10) search.set("porPagina", String(params.porPagina));
  if (params.page && params.page > 1) search.set("page", String(params.page));
  return `/reuniones?${search.toString()}`;
}

/** Un mismo identificador recibe el mismo color incluso entre páginas y períodos. */
function tonoSerie(clave: string): string {
  const hash = [...clave].reduce((value, char) => ((value * 31 + char.charCodeAt(0)) >>> 0), 7);
  return String(hash % 7);
}

function idReunionZoom(instancia: Readonly<{
  proveedorActivoTipo?: string | null;
  eventosProveedor: readonly { proveedor: { tipo: string }; codigoReunion: string | null; externalEventId: string | null }[];
}>): string | null {
  const evento = seleccionarEventoProveedorActivo(instancia);
  if (!evento || evento.proveedor.tipo !== "ZOOM") return null;
  return evento.codigoReunion ?? evento.externalEventId ?? null;
}

function Paginacion({
  filtro, actual, total, desde, hasta, cantidad
}: Readonly<{ filtro: LinkFilters; actual: number; total: number; desde: number; hasta: number; cantidad: number }>) {
  const paginas = Array.from({ length: Math.min(5, total) }, (_, i) =>
    Math.min(Math.max(1, actual - 2), Math.max(1, total - 4)) + i
  );
  return (
    <nav className={styles.pagination} aria-label="Paginación de reuniones">
      <span className={styles.resultCount}>Mostrando {desde}–{hasta} de {cantidad} {filtro.vista === "series" ? "series" : "reuniones"}</span>
      <div className={styles.paginationLinks}>
        {actual > 1
          ? <Link aria-label="Página anterior" href={reunionesHref({ ...filtro, page: actual - 1 })}><ChevronLeft size={16} /> Anterior</Link>
          : <span aria-disabled="true" className={styles.disabledPage}><ChevronLeft size={16} /> Anterior</span>}
        {paginas.map((numero) =>
          <Link aria-current={numero === actual ? "page" : undefined} key={numero} href={reunionesHref({ ...filtro, page: numero })}>{numero}</Link>
        )}
        {actual < total
          ? <Link aria-label="Página siguiente" href={reunionesHref({ ...filtro, page: actual + 1 })}>Siguiente <ChevronRight size={16} /></Link>
          : <span aria-disabled="true" className={styles.disabledPage}>Siguiente <ChevronRight size={16} /></span>}
      </div>
    </nav>
  );
}

export default async function ReunionesZoomPage({
  searchParams
}: Readonly<{ searchParams: Promise<SearchParams> }>) {
  const session = await auth();
  if (!session?.user) redirect("/acceso");
  const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
  if (!actor?.activo || !puedeVerAgendaCompleta(actor.rol)) redirect("/mi-agenda");

  const params = await searchParams;
  const esAdmin = actor.rol === "ADMINISTRACION";
  const datos = await obtenerDatosPaginaReuniones(db, actor, {
    ...params,
    vista: params.vista === "series" ? "series" : "encuentros",
    proveedor: "zoom"
  });
  const { q, programaId, periodo, isHistory, pagination, programs, desdeParam, hastaParam } = datos;
  const encuentros = datos.meetings;
  const porSerie = datos.vista === "series";
  const series = datos.series;
  const densidad = params.densidad === "compacta" ? "compacta" : "normal";
  const filtro: LinkFilters = {
    q, programa: programaId, periodo, desde: desdeParam, hasta: hastaParam,
    vista: porSerie ? "series" : "encuentros", porPagina: pagination.tamanoPagina, densidad
  };
  const url = (cambios: Partial<LinkFilters> = {}) => reunionesHref({ ...filtro, ...cambios });
  const hayFiltros = Boolean(q || programaId || desdeParam || hastaParam);
  const vacio = mensajeListaVacia({ hayFiltros, esHistorial: isHistory });

  return (
    <div className={`${styles.page} ${densidad === "compacta" ? styles.compact : ""}`}>
      <ProveedorTabs activo="ZOOM" />
      <header className={styles.header}>
        <div>
          <p className="page-eyebrow">{formatShortDate(new Date())}</p>
          <h1><Video size={27} aria-hidden="true" /> Reuniones</h1>
          <p>{isHistory ? "Historial de reuniones por Zoom." : "Próximas reuniones por Zoom."}</p>
        </div>
        <div className={styles.headerActions}>
          <Link className="primary-action" href="/reuniones/nueva"><CalendarPlus size={18} aria-hidden="true" /> Nueva reunión</Link>
          {esAdmin ? <Link className="secondary-action" href="/reuniones/migracion-zoom">Migración a Zoom</Link> : null}
        </div>
      </header>

      <div className={styles.toolbar}>
        <nav className={styles.tabs} aria-label="Período de reuniones">
          <Link aria-current={!isHistory ? "page" : undefined} href={url({ periodo: "proximas", page: 1 })}><CalendarDays size={17} /> Próximas</Link>
          <Link aria-current={isHistory ? "page" : undefined} href={url({ periodo: "anteriores", page: 1 })}><Clock3 size={17} /> Pasadas</Link>
        </nav>
        <nav className={styles.tabs} aria-label="Agrupar reuniones">
          <Link aria-current={!porSerie ? "page" : undefined} href={url({ vista: "encuentros", page: 1 })}><List size={17} /> Por reunión</Link>
          <Link aria-current={porSerie ? "page" : undefined} href={url({ vista: "series", page: 1 })}><Layers3 size={17} /> Por serie</Link>
        </nav>
        <nav className={styles.tabs} aria-label="Densidad del listado">
          <Link aria-current={densidad === "normal" ? "page" : undefined} href={url({ densidad: "normal" })}>Tarjetas</Link>
          <Link aria-current={densidad === "compacta" ? "page" : undefined} href={url({ densidad: "compacta" })}>Compacta</Link>
        </nav>
      </div>

      <form className={styles.filters} method="get">
        <input type="hidden" name="proveedor" value="zoom" />
        <input type="hidden" name="periodo" value={periodo} />
        <input type="hidden" name="porPagina" value={pagination.tamanoPagina} />
        {porSerie ? <input type="hidden" name="vista" value="series" /> : null}
        {densidad === "compacta" ? <input type="hidden" name="densidad" value="compacta" /> : null}
        <label className={styles.search}>
          <span className={styles.fieldLabel}>Buscar reunión</span>
          <span className={styles.searchField}><Search size={17} aria-hidden="true" />
            <input defaultValue={q} name="q" placeholder="Título, programa, docente o ID de Zoom" type="search" />
          </span>
        </label>
        {esAdmin ? <label><span className={styles.fieldLabel}>Programa</span>
          <select defaultValue={programaId} name="programa"><option value="">Todos los programas</option>
            {programs.map(program => <option key={program.id} value={program.id}>{program.nombre}</option>)}
          </select>
        </label> : null}
        <label><span className={styles.fieldLabel}>Desde</span><input defaultValue={desdeParam} name="desde" type="date" /></label>
        <label><span className={styles.fieldLabel}>Hasta</span><input defaultValue={hastaParam} name="hasta" type="date" /></label>
        <button className="primary-action" type="submit">Aplicar filtros</button>
        {hayFiltros ? <Link className={styles.clear} href={url({ q: "", programa: "", desde: "", hasta: "", page: 1 })}><X size={15} /> Limpiar</Link> : null}
      </form>

      <div className={styles.listTools}>
        <span>{pagination.totalElementos} {porSerie ? "series" : "reuniones"} · {isHistory ? "Pasadas" : "Próximas"}</span>
        <form method="get" className={styles.pageSizeForm}>
          <input type="hidden" name="proveedor" value="zoom" />
          {periodo === "anteriores" ? <input type="hidden" name="periodo" value="anteriores" /> : null}
          {porSerie ? <input type="hidden" name="vista" value="series" /> : null}
          {densidad === "compacta" ? <input type="hidden" name="densidad" value="compacta" /> : null}
          {q ? <input type="hidden" name="q" value={q} /> : null}
          {programaId ? <input type="hidden" name="programa" value={programaId} /> : null}
          {desdeParam ? <input type="hidden" name="desde" value={desdeParam} /> : null}
          {hastaParam ? <input type="hidden" name="hasta" value={hastaParam} /> : null}
          <label htmlFor="zoom-list-limit">Mostrar</label>
          <select defaultValue={pagination.tamanoPagina} id="zoom-list-limit" name="porPagina">
            <option value="10">10 por página</option><option value="20">20 por página</option><option value="50">50 por página</option>
          </select>
          <button type="submit" className={styles.pageSizeApply}>Cambiar</button>
        </form>
      </div>

      {(porSerie ? series.length : encuentros.length) === 0 ? (
        <div className={styles.empty} role="status">
          <p>{vacio.texto}</p>
          {vacio.accion === "LIMPIAR" ? <Link className="secondary-action" href={url({ q: "", programa: "", desde: "", hasta: "", page: 1 })}>Limpiar filtros</Link> : null}
          {vacio.accion === "CREAR" ? <Link className="primary-action" href="/reuniones/nueva">Crear una reunión</Link> : null}
        </div>
      ) : porSerie ? (
        <ul className={styles.list}>
          {series.map(serie => {
            const primero = serie[0];
            const { docentePrograma } = primero.solicitud;
            const docente = `${docentePrograma.docente.usuario.nombres} ${docentePrograma.docente.usuario.apellidos ?? ""}`.trim();
            const resumen = resumirSerieZoom(serie);
            const serieClave = claveSerieReunion(primero.solicitud);
            const idZoom = resumen.unificada ? idReunionZoom(primero) : null;
            return (
              <li className={styles.item} data-tone={tonoSerie(serieClave)} key={serieClave}>
                <div className={styles.when}><strong>{serie.length} {serie.length === 1 ? "encuentro" : "encuentros"}</strong><span><CalendarDays size={15} /> {formatShortDate(primero.inicioProgramadoAt)}</span><span>{formatTime(primero.inicioProgramadoAt)}</span></div>
                <div className={styles.what}>
                  <Link className={styles.titleLink} href={`/reuniones/${primero.solicitudSalaId}`}>{primero.solicitud.titulo}</Link>
                  <span>{docentePrograma.programa.nombre} · {docente}</span>
                  <span>Cuenta: {resumen.cuentas.join(", ") || "Sin asignar"}</span>
                  <span className={styles.seriesBadge}>Serie · {serie.length} encuentros</span>
                </div>
                <div className={styles.link}>
                  {idZoom ? <span className={styles.zoomId}><Hash size={15} /> ID de Zoom: <strong>{idZoom}</strong></span> : null}
                  {resumen.unificada ? (
                    <>
                      <span className={styles.statusOk}>Enlace compartido</span>
                      {resumen.enlaces[0] && !isHistory ? <ZoomJoinActions url={resumen.enlaces[0]} contexto={primero.solicitud.titulo} /> : null}
                    </>
                  ) : (
                    <>
                      <span className={styles.statusWarning}>Enlaces o cuentas distintos</span>
                      {esAdmin && !isHistory ? <CorregirSerieZoomBoton serieClave={serieClave} titulo={primero.solicitud.titulo} /> : null}
                    </>
                  )}
                  <Link className={styles.details} href={`/reuniones/${primero.solicitudSalaId}`}>Ver serie</Link>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <ul className={styles.list}>
          {encuentros.map(encuentro => {
            const enlace = resumenEnlaceZoom(encuentro);
            const { docentePrograma } = encuentro.solicitud;
            const docente = `${docentePrograma.docente.usuario.nombres} ${docentePrograma.docente.usuario.apellidos ?? ""}`.trim();
            const contexto = `${encuentro.solicitud.titulo}, ${formatShortDate(encuentro.inicioProgramadoAt)} ${formatTime(encuentro.inicioProgramadoAt)}`;
            const serieClave = claveSerieReunion(encuentro.solicitud);
            const zoomId = idReunionZoom(encuentro);
            return (
              <li className={styles.item} data-tone={tonoSerie(serieClave)} key={encuentro.id}>
                <div className={styles.when}>
                  <strong><CalendarDays size={15} aria-hidden="true" /> {formatShortDate(encuentro.inicioProgramadoAt)}</strong>
                  <span><Clock3 size={15} aria-hidden="true" /> {formatTime(encuentro.inicioProgramadoAt)} – {formatTime(encuentro.finProgramadoAt)}</span>
                </div>
                <div className={styles.what}>
                  <Link className={styles.titleLink} href={`/reuniones/${encuentro.solicitudSalaId}`}>{encuentro.solicitud.titulo}</Link>
                  <span>{docentePrograma.programa.nombre} · {docente}</span>
                  <span>Anfitrión: {enlace.cuentaAnfitrion ?? "Sin asignar"}</span>
                  <Link className={styles.seriesBadge} href={`/reuniones/${encuentro.solicitudSalaId}`}>Ver serie</Link>
                </div>
                <div className={styles.link}>
                  <span className={styles.zoomId}><Hash size={15} aria-hidden="true" /> ID de Zoom: <strong>{zoomId ?? "Pendiente"}</strong></span>
                  <ZoomLinkStatus estado={enlace.estado} esAdmin={esAdmin} eventoProveedorId={enlace.eventoProveedorId} operacion={enlace.operacion} contexto={contexto} />
                  {enlace.joinUrl && !isHistory ? <ZoomJoinActions url={enlace.joinUrl} contexto={contexto} /> : null}
                  <Link className={styles.details} href={`/reuniones/${encuentro.solicitudSalaId}`}>Detalle</Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {pagination.totalElementos > 0 ? (
        <Paginacion filtro={filtro} actual={pagination.paginaActual} total={pagination.totalPaginas}
          desde={pagination.desdeElemento} hasta={pagination.hastaElemento} cantidad={pagination.totalElementos} />
      ) : null}
    </div>
  );
}
