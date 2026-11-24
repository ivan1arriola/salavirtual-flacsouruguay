import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Hash,
  Layers3,
  List,
  Search,
  Video,
  X
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ProveedorTabs } from "@/src/components/proveedor-tabs";
import { AccesoRegistrosZoom } from "@/src/components/acceso-registros-zoom";
import { CorregirSerieZoomBoton } from "@/src/components/corregir-serie-zoom-boton";
import { ZoomCopyIdButton } from "@/src/components/zoom-copy-id-button";
import { ZoomJoinActions } from "@/src/components/zoom-join-actions";
import { ZoomLinkStatus } from "@/src/components/zoom-link-status";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { formatShortDate, formatTime, formatDuration } from "@/src/lib/ui/format";
import { resumenEnlaceZoom } from "@/src/modules/reuniones/estado-enlace-zoom.domain";
import { seleccionarEventoProveedorActivo } from "@/src/modules/reuniones/evento-proveedor-activo.domain";
import { claveSerieReunion } from "@/src/modules/reuniones/serie-reunion.domain";
import { resumirSerieZoom } from "@/src/modules/reuniones/serie-zoom-resumen.domain";
import { mensajeListaVacia } from "@/src/modules/reuniones/lista-vacia.domain";
import {
  agruparPorDia,
  colorCuentaZoom,
  cuentasPresentes,
  nombreCuentaZoom,
  type RelativoDiaZoom
} from "@/src/modules/reuniones/lista-zoom-agrupacion.domain";
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
  porPagina?: string;
  desde?: string;
  hasta?: string;
  proveedor?: string;
  vista?: string;
  densidad?: string;
}>;

type LinkFilters = Readonly<{
  q: string;
  programa: string;
  periodo: PeriodoAgenda;
  desde: string;
  hasta: string;
  vista: "series" | "encuentros";
  porPagina: number;
  densidad: "normal" | "compacta";
  page?: number;
}>;

function reunionesHref(params: LinkFilters): string {
  const search = new URLSearchParams();
  search.set("proveedor", "zoom");
  search.set("vista", params.vista);
  if (params.densidad === "compacta") {
    search.set("densidad", "compacta");
  }
  if (params.q) {
    search.set("q", params.q);
  }
  if (params.programa) {
    search.set("programa", params.programa);
  }
  if (params.periodo === "anteriores") {
    search.set("periodo", params.periodo);
  }
  if (params.desde) {
    search.set("desde", params.desde);
  }
  if (params.hasta) {
    search.set("hasta", params.hasta);
  }
  if (params.porPagina !== 10) {
    search.set("porPagina", String(params.porPagina));
  }
  if (params.page && params.page > 1) {
    search.set("page", String(params.page));
  }
  return `/reuniones?${search.toString()}`;
}

const RELATIVO: Readonly<Record<Exclude<RelativoDiaZoom, null>, string>> = { HOY: "Hoy", MANANA: "Mañana" };

/** Cuenta anfitriona con su color y su nombre en texto: el color nunca es la única señal. */
function ChipCuenta({ correo }: Readonly<{ correo: string | null | undefined }>) {
  return (
    <span
      className={styles.cuentaChip}
      data-cuenta={colorCuentaZoom(correo) ?? "sin"}
      title={correo ?? undefined}
    >
      <span className={styles.punto} aria-hidden="true" />
      {correo ? nombreCuentaZoom(correo) : "Sin asignar"}
    </span>
  );
}

function idReunionZoom(
  instancia: Readonly<{
    proveedorActivoTipo?: string | null;
    eventosProveedor: readonly {
      proveedor: { tipo: string };
      codigoReunion: string | null;
      externalEventId: string | null;
    }[];
  }>
): string | null {
  const evento = seleccionarEventoProveedorActivo(instancia);
  if (!evento || evento.proveedor.tipo !== "ZOOM") {
    return null;
  }
  return evento.codigoReunion ?? evento.externalEventId ?? null;
}

function EstadoHorario({ fin, inicio, ahora }: Readonly<{ fin: Date; inicio: Date; ahora: Date }>) {
  if (fin <= ahora) {
    return <span className={styles.scheduleStatus}>Horario finalizado</span>;
  }
  if (inicio <= ahora) {
    return <span className={styles.scheduleStatus}>En horario previsto</span>;
  }
  return null;
}

function etiquetaEnlaceSerie(
  serie: readonly Parameters<typeof resumenEnlaceZoom>[0][],
  cantidadEnlaces: number
) {
  if (!cantidadEnlaces || serie.some((item) => !resumenEnlaceZoom(item).joinUrl)) {
    return "Enlace pendiente";
  }
  return serie.length === 1 ? "Enlace disponible" : "Enlace compartido";
}

function Paginacion({
  filtro,
  actual,
  total,
  desde,
  hasta,
  cantidad
}: Readonly<{
  filtro: LinkFilters;
  actual: number;
  total: number;
  desde: number;
  hasta: number;
  cantidad: number;
}>) {
  const paginas = Array.from(
    { length: Math.min(5, total) },
    (_, i) => Math.min(Math.max(1, actual - 2), Math.max(1, total - 4)) + i
  );
  return (
    <nav className={styles.pagination} aria-label="Paginación de reuniones">
      <span className={styles.resultCount}>
        Mostrando {desde}–{hasta} de {cantidad} {filtro.vista === "series" ? "series" : "reuniones"}
      </span>
      <div className={styles.paginationLinks}>
        {actual > 1 ? (
          <Link aria-label="Página anterior" href={reunionesHref({ ...filtro, page: actual - 1 })}>
            <ChevronLeft size={16} /> Anterior
          </Link>
        ) : (
          <span aria-disabled="true" className={styles.disabledPage}>
            <ChevronLeft size={16} /> Anterior
          </span>
        )}
        {paginas.map((numero) => (
          <Link
            aria-current={numero === actual ? "page" : undefined}
            key={numero}
            href={reunionesHref({ ...filtro, page: numero })}
          >
            {numero}
          </Link>
        ))}
        {actual < total ? (
          <Link aria-label="Página siguiente" href={reunionesHref({ ...filtro, page: actual + 1 })}>
            Siguiente <ChevronRight size={16} />
          </Link>
        ) : (
          <span aria-disabled="true" className={styles.disabledPage}>
            Siguiente <ChevronRight size={16} />
          </span>
        )}
      </div>
    </nav>
  );
}

export default async function ReunionesZoomPage({
  searchParams
}: Readonly<{ searchParams: Promise<SearchParams> }>) {
  const session = await auth();
  if (!session?.user) {
    redirect("/acceso");
  }
  const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
  if (!actor?.activo || !puedeVerAgendaCompleta(actor.rol)) {
    redirect("/mi-agenda");
  }

  const params = await searchParams;
  const esAdmin = actor.rol === "ADMINISTRACION";
  const datos = await obtenerDatosPaginaReuniones(db, actor, {
    ...params,
    vista: params.vista,
    proveedor: "zoom"
  });
  const { q, programaId, periodo, isHistory, pagination, programs, desdeParam, hastaParam } = datos;
  const encuentros = datos.meetings;
  const porSerie = datos.vista === "series";
  const series = datos.series;
  const densidad = params.densidad === "compacta" ? "compacta" : "normal";
  const filtro: LinkFilters = {
    q,
    programa: programaId,
    periodo,
    desde: desdeParam,
    hasta: hastaParam,
    vista: porSerie ? "series" : "encuentros",
    porPagina: pagination.tamanoPagina,
    densidad
  };
  const url = (cambios: Partial<LinkFilters> = {}) => reunionesHref({ ...filtro, ...cambios });
  const hayFiltros = Boolean(q || programaId || desdeParam || hastaParam);
  const vacio = mensajeListaVacia({ hayFiltros, esHistorial: isHistory });
  const ahora = new Date();
  const cuentas = cuentasPresentes(
    porSerie
      ? series.flatMap((serie) => resumirSerieZoom(serie).cuentas)
      : encuentros.map((encuentro) => resumenEnlaceZoom(encuentro).cuentaAnfitrion)
  );
  const diasSeries = agruparPorDia(series, (serie) => serie[0].inicioProgramadoAt, ahora);
  const diasEncuentros = agruparPorDia(encuentros, (encuentro) => encuentro.inicioProgramadoAt, ahora);
  const encabezadoDia = (
    dia: { clave: string; etiqueta: string; relativo: RelativoDiaZoom },
    cantidad: number
  ) => (
    <h2 className={styles.diaTitulo} id={`dia-${dia.clave}`}>
      {dia.relativo ? <span className={styles.diaRelativo}>{RELATIVO[dia.relativo]}</span> : null}
      <span className={styles.diaEtiqueta}>{dia.etiqueta}</span>
      <span className={styles.diaCantidad}>
        {cantidad}{" "}
        {porSerie ? (cantidad === 1 ? "serie" : "series") : cantidad === 1 ? "reunión" : "reuniones"}
      </span>
    </h2>
  );

  return (
    <div className={`${styles.page} ${densidad === "compacta" ? styles.compact : ""}`}>
      <header className={styles.header}>
        <div>
          <p className="page-eyebrow">{formatShortDate(new Date())}</p>
          <h1>
            <Video size={27} aria-hidden="true" /> Reuniones
          </h1>
          <p>{isHistory ? "Reuniones de días anteriores." : "Reuniones de hoy y de los próximos días."}</p>
        </div>
        <div className={styles.headerActions}>
          <AccesoRegistrosZoom rol={actor.rol} />
        </div>
      </header>

      <ProveedorTabs activo="ZOOM" filtros={filtro} />
      <div className={styles.toolbar}>
        <nav className={styles.tabs} aria-label="Período de reuniones">
          <Link aria-current={!isHistory ? "page" : undefined} href={url({ periodo: "proximas", page: 1 })}>
            <CalendarDays size={17} /> Hoy y próximas
          </Link>
          <Link aria-current={isHistory ? "page" : undefined} href={url({ periodo: "anteriores", page: 1 })}>
            <Clock3 size={17} /> Anteriores
          </Link>
        </nav>
        <nav className={styles.tabs} aria-label="Agrupar reuniones">
          <Link aria-current={!porSerie ? "page" : undefined} href={url({ vista: "encuentros", page: 1 })}>
            <List size={17} /> Por reunión
          </Link>
          <Link aria-current={porSerie ? "page" : undefined} href={url({ vista: "series", page: 1 })}>
            <Layers3 size={17} /> Por serie
          </Link>
        </nav>
        <nav className={styles.tabs} aria-label="Densidad del listado">
          <Link aria-current={densidad === "normal" ? "page" : undefined} href={url({ densidad: "normal" })}>
            Tarjetas
          </Link>
          <Link
            aria-current={densidad === "compacta" ? "page" : undefined}
            href={url({ densidad: "compacta" })}
          >
            Compacta
          </Link>
        </nav>
      </div>

      <form className={styles.filters} method="get">
        <input type="hidden" name="proveedor" value="zoom" />
        <input type="hidden" name="periodo" value={periodo} />
        <input type="hidden" name="porPagina" value={pagination.tamanoPagina} />
        <input type="hidden" name="vista" value={filtro.vista} />
        {densidad === "compacta" ? <input type="hidden" name="densidad" value="compacta" /> : null}
        <label className={styles.search}>
          <span className={styles.fieldLabel}>Buscar reunión</span>
          <span className={styles.searchField}>
            <Search size={17} aria-hidden="true" />
            <input
              defaultValue={q}
              name="q"
              placeholder="Título, programa, docente o ID de Zoom"
              type="search"
            />
          </span>
        </label>
        {esAdmin ? (
          <label>
            <span className={styles.fieldLabel}>Programa</span>
            <select defaultValue={programaId} name="programa">
              <option value="">Todos los programas</option>
              {programs.map((program) => (
                <option key={program.id} value={program.id}>
                  {program.nombre}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label>
          <span className={styles.fieldLabel}>Desde</span>
          <input defaultValue={desdeParam} name="desde" type="date" />
        </label>
        <label>
          <span className={styles.fieldLabel}>Hasta</span>
          <input defaultValue={hastaParam} name="hasta" type="date" />
        </label>
        <button className="primary-action" type="submit">
          Aplicar filtros
        </button>
        {hayFiltros ? (
          <Link className={styles.clear} href={url({ q: "", programa: "", desde: "", hasta: "", page: 1 })}>
            <X size={15} /> Limpiar
          </Link>
        ) : null}
      </form>

      <div className={styles.listTools}>
        <span>
          {pagination.totalElementos} {porSerie ? "series" : "reuniones"} ·{" "}
          {isHistory ? "Anteriores" : "Hoy y próximas"}
        </span>
        <form method="get" className={styles.pageSizeForm}>
          <input type="hidden" name="proveedor" value="zoom" />
          {periodo === "anteriores" ? <input type="hidden" name="periodo" value="anteriores" /> : null}
          <input type="hidden" name="vista" value={filtro.vista} />
          {densidad === "compacta" ? <input type="hidden" name="densidad" value="compacta" /> : null}
          {q ? <input type="hidden" name="q" value={q} /> : null}
          {programaId ? <input type="hidden" name="programa" value={programaId} /> : null}
          {desdeParam ? <input type="hidden" name="desde" value={desdeParam} /> : null}
          {hastaParam ? <input type="hidden" name="hasta" value={hastaParam} /> : null}
          <label htmlFor="zoom-list-limit">Mostrar</label>
          <select defaultValue={pagination.tamanoPagina} id="zoom-list-limit" name="porPagina">
            <option value="10">10 por página</option>
            <option value="20">20 por página</option>
            <option value="50">50 por página</option>
          </select>
          <button type="submit" className={styles.pageSizeApply}>
            Cambiar
          </button>
        </form>
      </div>

      {cuentas.length > 0 ? (
        <section className={styles.leyenda} aria-label="Cuentas anfitrionas">
          <h2 className={styles.leyendaTitulo}>Cuentas anfitrionas</h2>
          <ul>
            {cuentas.map((cuenta) => (
              <li key={cuenta.correo} data-cuenta={cuenta.color} title={cuenta.correo}>
                <span className={styles.punto} aria-hidden="true" />
                {cuenta.nombre}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {(porSerie ? series.length : encuentros.length) === 0 ? (
        <div className={styles.empty} role="status">
          <p>{vacio.texto}</p>
          {vacio.accion === "LIMPIAR" ? (
            <Link
              className="secondary-action"
              href={url({ q: "", programa: "", desde: "", hasta: "", page: 1 })}
            >
              Limpiar filtros
            </Link>
          ) : null}
          {vacio.accion === "CREAR" ? (
            <Link className="primary-action" href="/reuniones/nueva">
              Crear una reunión
            </Link>
          ) : null}
        </div>
      ) : porSerie ? (
        <div className={styles.dias}>
          {diasSeries.map((dia) => (
            <section className={styles.dia} key={dia.clave} aria-labelledby={`dia-${dia.clave}`}>
              {encabezadoDia(dia, dia.items.length)}
              <ul className={styles.list}>
                {dia.items.map((serie) => {
                  const primero = serie[0];
                  const siguiente = serie.find((item) => item.finProgramadoAt > ahora);
                  const referencia = siguiente ?? primero;
                  const { docentePrograma } = primero.solicitud;
                  const docente =
                    `${docentePrograma.docente.usuario.nombres} ${docentePrograma.docente.usuario.apellidos ?? ""}`.trim();
                  const resumen = resumirSerieZoom(serie);
                  const serieClave = claveSerieReunion(primero.solicitud);
                  const idZoom = resumen.unificada ? idReunionZoom(referencia) : null;
                  const etiquetaEnlace = etiquetaEnlaceSerie(serie, resumen.enlaces.length);
                  return (
                    <li
                      className={styles.item}
                      data-cuenta={
                        resumen.cuentas.length === 1
                          ? (colorCuentaZoom(resumen.cuentas[0]) ?? "sin")
                          : resumen.cuentas.length > 1
                            ? "varias"
                            : "sin"
                      }
                      key={serieClave}
                    >
                      <div className={styles.when}>
                        <strong>{formatTime(primero.inicioProgramadoAt)}</strong>
                        <span>{formatTime(primero.finProgramadoAt)}</span>
                        <EstadoHorario
                          fin={primero.finProgramadoAt}
                          inicio={primero.inicioProgramadoAt}
                          ahora={ahora}
                        />
                      </div>
                      <div className={styles.what}>
                        <Link className={styles.titleLink} href={`/reuniones/${primero.solicitudSalaId}`}>
                          {primero.solicitud.titulo}
                        </Link>
                        <span>
                          {docentePrograma.programa.nombre} · {docente}
                        </span>
                        <span className={styles.cuentas}>
                          Cuenta:{" "}
                          {resumen.cuentas.length ? (
                            resumen.cuentas.map((cuenta) => <ChipCuenta correo={cuenta} key={cuenta} />)
                          ) : (
                            <ChipCuenta correo={null} />
                          )}
                        </span>
                        <span className={styles.seriesBadge}>
                          {serie.length} {serie.length === 1 ? "encuentro" : "encuentros"} en este listado
                        </span>
                      </div>
                      <div className={styles.link}>
                        {idZoom ? (
                          <span className={styles.zoomId}>
                            <Hash size={15} /> ID de Zoom: <strong>{idZoom}</strong>
                          </span>
                        ) : null}
                        {resumen.unificada ? (
                          <>
                            <span
                              className={
                                etiquetaEnlace === "Enlace pendiente"
                                  ? styles.statusWarning
                                  : styles.statusOk
                              }
                            >
                              {etiquetaEnlace}
                            </span>
                            {resumen.enlaces[0] &&
                              !isHistory &&
                              siguiente &&
                              etiquetaEnlace !== "Enlace pendiente" ? (
                                <ZoomJoinActions
                                  url={resumen.enlaces[0]}
                                  contexto={primero.solicitud.titulo}
                                />
                              ) : null}
                          </>
                        ) : (
                          <>
                            <span className={styles.statusWarning}>Enlaces o cuentas distintos</span>
                            {esAdmin && !isHistory ? (
                              <CorregirSerieZoomBoton
                                serieClave={serieClave}
                                titulo={primero.solicitud.titulo}
                              />
                            ) : null}
                          </>
                        )}
                        <Link className={styles.details} href={`/reuniones/${primero.solicitudSalaId}`}>
                          Ver serie
                        </Link>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <div className={styles.dias}>
          {diasEncuentros.map((dia) => (
            <section className={styles.dia} key={dia.clave} aria-labelledby={`dia-${dia.clave}`}>
              {encabezadoDia(dia, dia.items.length)}
              <ul className={styles.list}>
                {dia.items.map((encuentro) => {
                  const enlace = resumenEnlaceZoom(encuentro);
                  const { docentePrograma } = encuentro.solicitud;
                  const docente =
                    `${docentePrograma.docente.usuario.nombres} ${docentePrograma.docente.usuario.apellidos ?? ""}`.trim();
                  const contexto = `${encuentro.solicitud.titulo}, ${formatShortDate(
                    encuentro.inicioProgramadoAt
                  )} ${formatTime(encuentro.inicioProgramadoAt)}`;
                  const serieClave = claveSerieReunion(encuentro.solicitud);
                  const zoomId = idReunionZoom(encuentro);
                  return (
                    <li
                      className={styles.item}
                      data-cuenta={colorCuentaZoom(enlace.cuentaAnfitrion) ?? "sin"}
                      key={encuentro.id}
                    >
                      <div className={styles.when}>
                        <strong>
                          <Clock3 size={15} aria-hidden="true" /> {formatTime(encuentro.inicioProgramadoAt)} –{" "}
                          {formatTime(encuentro.finProgramadoAt)}
                        </strong>
                        <EstadoHorario
                          fin={encuentro.finProgramadoAt}
                          inicio={encuentro.inicioProgramadoAt}
                          ahora={ahora}
                        />
                        <span className={styles.durationChip}>
                          {formatDuration(encuentro.inicioProgramadoAt, encuentro.finProgramadoAt)}
                        </span>
                      </div>
                      <div className={styles.what}>
                        <Link className={styles.titleLink} href={`/reuniones/${encuentro.solicitudSalaId}`}>
                          {encuentro.solicitud.titulo}
                        </Link>
                        <span>
                          {docentePrograma.programa.nombre} · {docente}
                        </span>
                        <span className={styles.cuentas}>
                          Anfitrión: <ChipCuenta correo={enlace.cuentaAnfitrion} />
                        </span>
                      </div>
                      <div className={styles.link}>
                        <span className={styles.zoomId}>
                          <Hash size={15} aria-hidden="true" /> ID de Zoom:{" "}
                          <strong>{zoomId ?? "Pendiente"}</strong>
                        </span>
                        {zoomId ? <ZoomCopyIdButton meetingId={zoomId} contexto={contexto} /> : null}
                        {enlace.estado !== "LISTO" ? (
                          <ZoomLinkStatus
                            estado={enlace.estado}
                            esAdmin={esAdmin}
                            eventoProveedorId={enlace.eventoProveedorId}
                            operacion={enlace.operacion}
                            contexto={contexto}
                          />
                        ) : null}
                        {enlace.joinUrl && !isHistory && encuentro.finProgramadoAt > ahora ? (
                          <ZoomJoinActions url={enlace.joinUrl} contexto={contexto} />
                        ) : null}
                        <Link className={styles.details} href={`/reuniones/${encuentro.solicitudSalaId}`}>
                          Detalle
                        </Link>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      {pagination.totalElementos > 0 ? (
        <Paginacion
          filtro={filtro}
          actual={pagination.paginaActual}
          total={pagination.totalPaginas}
          desde={pagination.desdeElemento}
          hasta={pagination.hastaElemento}
          cantidad={pagination.totalElementos}
        />
      ) : null}
    </div>
  );
}
