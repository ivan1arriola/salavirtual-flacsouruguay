import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  CircleAlert,
  CircleCheck,
  History,
  Video,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import {
  comprobarCuentaZoom,
  comprobarReunionPasadaZoom,
  leerDiagnosticoZoom,
} from "@/src/bootstrap/zoom-diagnostico.server";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { formatDateTime, formatDuration } from "@/src/lib/ui/format";
import { colorCuentaZoom } from "@/src/modules/reuniones/lista-zoom-agrupacion.domain";
import { leerInconsistenciasAgendaZoom } from "@/src/modules/operaciones/zoom-agenda-observada.service";
import { AgendaZoomSeccion } from "./agenda-zoom-seccion";
import { AccionesPasada, SinVincularLista } from "./pasadas-conciliacion";
import styles from "./zoom.module.css";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Vista = "cuentas" | "series" | "pasadas" | "agenda";
const motivos = {
  SIN_REUNION: "Falta ID o cuenta",
  IDS_DISTINTOS: "IDs distintos",
  CUENTAS_DISTINTAS: "Cuentas distintas",
} as const;

const paginaActual = (actual: Vista, tab: Vista) => (actual === tab ? "page" : undefined);
const VISTAS: readonly Vista[] = ["series", "pasadas", "agenda"];
const leerVista = (valor?: string): Vista => VISTAS.find((vista) => vista === valor) ?? "cuentas";

function estadoCuenta(
  cuenta: Readonly<{ activa: boolean; fueraDelGrupoAt: Date | null; tieneLicencia: boolean }>,
) {
  if (cuenta.fueraDelGrupoAt) {
    return "Fuera del grupo";
  }
  if (!cuenta.activa) {
    return "Inactiva";
  }
  return cuenta.tieneLicencia ? "Activa · con licencia" : "Sin licencia";
}

export default async function DiagnosticoZoomPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ vista?: string; cuenta?: string; ocurrencia?: string }> }>) {
  const session = await auth();
  if (!session?.user) {
    redirect("/acceso");
  }
  const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
  if (!actor?.activo || actor.rol !== "ADMINISTRACION") {
    redirect("/");
  }
  const params = await searchParams;
  const vista = leerVista(params.vista);
  const datos = await leerDiagnosticoZoom();
  const agenda = await leerInconsistenciasAgendaZoom(db, datos.reuniones);
  const totalAgenda =
    agenda.externas.length + agenda.eliminadasEnZoom.length + agenda.horarioDistinto.length;
  const cuentaSeleccionada =
    vista === "cuentas" ? datos.cuentas.find(({ id }) => id === params.cuenta) : null;
  const pasadaSeleccionada =
    vista === "pasadas" ? datos.pasadas.find(({ id }) => id === params.ocurrencia) : null;
  const [verificacion, detallePasado] = await Promise.all([
    cuentaSeleccionada ? comprobarCuentaZoom(cuentaSeleccionada.id, datos.reuniones) : null,
    pasadaSeleccionada ? comprobarReunionPasadaZoom(pasadaSeleccionada.id) : null,
  ]);
  const activas = datos.cuentas.filter(
    ({ activa, fueraDelGrupoAt }) => activa && !fueraDelGrupoAt,
  ).length;

  return (
    <div className={styles["page"]}>
      <header className={styles["header"]}>
        <Link href="/centro-operaciones" className={styles["back"]}>
          <ArrowLeft size={16} /> Centro de operaciones
        </Link>
        <p className="page-eyebrow">Control de agenda</p>
        <h1>Diagnóstico de Zoom</h1>
        <p>
          Estado de las cuentas, coherencia de las series y detalles de clases finalizadas. Las
          comprobaciones no modifican datos; en Pasadas se pueden vincular, desvincular y reintentar
          la asistencia de ejecuciones.
        </p>
      </header>
      <div className={styles["metrics"]}>
        <div>
          <Video size={20} />
          <strong>{activas}</strong>
          <span>cuentas activas</span>
        </div>
        <div>
          <CalendarClock size={20} />
          <strong>{datos.solapes.length}</strong>
          <span>solapamientos próximos</span>
        </div>
        <div>
          <CircleAlert size={20} />
          <strong>{datos.incidencias.length}</strong>
          <span>series para revisar</span>
        </div>
      </div>
      <p className={styles["scope"]}>
        Próximos 60 días · {formatDateTime(datos.desde)} al {formatDateTime(datos.hasta)}. El
        historial muestra las últimas 30 ocurrencias vinculadas y las no vinculadas de los últimos
        30 días.
      </p>
      {datos.parcial ? (
        <p className={styles["notice"]} role="alert">
          Hay más de 2000 encuentros próximos. El diagnóstico es parcial; ampliá la consulta antes
          de descartar incidencias.
        </p>
      ) : null}
      <nav className={styles["tabs"]} aria-label="Secciones del diagnóstico">
        <Link href="?vista=cuentas" aria-current={paginaActual(vista, "cuentas")}>
          Cuentas <span>{datos.cuentas.length}</span>
        </Link>
        <Link href="?vista=series" aria-current={paginaActual(vista, "series")}>
          Series <span>{datos.incidencias.length}</span>
        </Link>
        <Link href="?vista=pasadas" aria-current={paginaActual(vista, "pasadas")}>
          Pasadas <span>{datos.pasadas.length}</span>
        </Link>
        <Link href="?vista=agenda" aria-current={paginaActual(vista, "agenda")}>
          Agenda de Zoom <span>{totalAgenda}</span>
        </Link>
      </nav>
      {vista === "cuentas" ? (
        <section aria-label="Cuentas anfitrionas" className={styles["list"]}>
          {datos.cuentas.length === 0 ? <p>No hay cuentas Zoom configuradas.</p> : null}
          {datos.cuentas.map((cuenta) => {
            const agenda = datos.reuniones.filter(({ cuentaId }) => cuentaId === cuenta.id);
            const solapes = datos.solapes.filter(({ cuentaId }) => cuentaId === cuenta.id);
            const seleccionada = cuentaSeleccionada?.id === cuenta.id;
            return (
              <article
                className={styles["card"]}
                data-cuenta={colorCuentaZoom(cuenta.emailOrganizador ?? cuenta.nombre) ?? "sin"}
                key={cuenta.id}
              >
                <div className={styles["cardHead"]}>
                  <div>
                    <small>Cuenta anfitriona</small>
                    <h2>{cuenta.nombre}</h2>
                    <p>{cuenta.emailOrganizador ?? "Sin correo"}</p>
                  </div>
                  <span
                    className={
                      cuenta.activa && !cuenta.fueraDelGrupoAt && cuenta.tieneLicencia
                        ? styles["ok"]
                        : styles["warning"]
                    }
                  >
                    {estadoCuenta(cuenta)}
                  </span>
                </div>
                <p>
                  {agenda.length} encuentros próximos en Sala Virtual · {solapes.length}{" "}
                  solapamientos de horario
                </p>
                {solapes.length ? (
                  <ul className={styles["warnings"]}>
                    {solapes.map(({ primera, segunda }) => (
                      <li key={`${primera.instanciaId}:${segunda.instanciaId}`}>
                        <CircleAlert size={15} /> {formatDateTime(segunda.inicio)}: {primera.titulo}{" "}
                        y {segunda.titulo}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <Link
                  href={`?vista=cuentas&cuenta=${encodeURIComponent(cuenta.id)}`}
                  aria-expanded={seleccionada}
                >
                  Comprobar agenda en Zoom <ArrowRight size={15} />
                </Link>
                {seleccionada && verificacion ? (
                  <div className={styles["result"]} role="status">
                    {verificacion.estado === "DISPONIBLE" ? (
                      <>
                        <strong>
                          <CircleCheck size={17} /> Consulta completada
                        </strong>
                        <p>
                          {verificacion.totalZoom} reuniones próximas informadas por Zoom ·{" "}
                          {verificacion.verificadas} encuentros locales con ID presente.
                        </p>
                        {verificacion.ausentes.length ? (
                          <>
                            <p>
                              Estos IDs de Sala Virtual no aparecen en la agenda próxima de Zoom;
                              revisá su estado antes de actuar:
                            </p>
                            <ul>
                              {verificacion.ausentes.map((item) => (
                                <li key={item.instanciaId}>
                                  <Link href={`/reuniones/${item.solicitudId}`}>
                                    {item.titulo} · {formatDateTime(item.inicio)}
                                  </Link>
                                </li>
                              ))}
                            </ul>
                          </>
                        ) : null}
                        <small>
                          La API de Zoom puede agrupar una serie bajo un solo ID. Esta comprobación
                          no modifica encuentros.
                        </small>
                      </>
                    ) : (
                      <p>
                        <CircleAlert size={16} /> {verificacion.mensaje}
                      </p>
                    )}
                  </div>
                ) : null}
              </article>
            );
          })}
        </section>
      ) : null}
      {vista === "series" ? (
        <section aria-label="Auditoría de series Zoom" className={styles["list"]}>
          <p>
            Revisión global de series con dos o más encuentros próximos. Los enlaces y cuentas
            distintos requieren inspección; no se corrigen automáticamente.
          </p>
          {datos.incidencias.length === 0 ? (
            <div className={styles["empty"]}>
              <CircleCheck size={24} /> No se encontraron inconsistencias en el período consultado.
            </div>
          ) : null}
          {datos.incidencias.map((serie) => (
            <article className={styles["card"]} key={serie.solicitudId}>
              <div className={styles["cardHead"]}>
                <div>
                  <small>
                    {formatDateTime(serie.inicio)} · {serie.encuentros} encuentros
                  </small>
                  <h2>{serie.titulo}</h2>
                </div>
                <CircleAlert size={21} aria-label="Requiere revisión" />
              </div>
              <div className={styles["tags"]}>
                {serie.motivos.map((motivo) => (
                  <span key={motivo}>{motivos[motivo]}</span>
                ))}
              </div>
              <Link href={`/reuniones/${serie.solicitudId}`}>
                Abrir serie <ArrowRight size={15} />
              </Link>
            </article>
          ))}
        </section>
      ) : null}
      {vista === "agenda" ? <AgendaZoomSeccion agenda={agenda} total={totalAgenda} /> : null}
      {vista === "pasadas" ? (
        <section aria-label="Reuniones Zoom pasadas" className={styles["list"]}>
          <p>
            Las conexiones registradas y el estado de asistencia vienen de la base de Sala Virtual.
            El detalle de horario y duración se consulta a Zoom al abrirlo.
          </p>
          <SinVincularLista items={datos.sinVincular} />
          <h2>Vinculadas</h2>
          {datos.pasadas.length === 0 ? (
            <p>No hay ocurrencias vinculadas en este período.</p>
          ) : null}
          {datos.pasadas.map((pasada) => (
            <article className={styles["card"]} key={pasada.id}>
              <div className={styles["cardHead"]}>
                <div>
                  <small>
                    {formatDateTime(pasada.inicioRealAt)} · Zoom {pasada.meetingId}
                  </small>
                  <h2>{pasada.eventoProveedor?.instancia.solicitud.titulo}</h2>
                </div>
                <History size={21} aria-hidden="true" />
              </div>
              <p>
                {pasada.sesionesAsistencia.length} conexiones registradas · Reporte:{" "}
                {pasada.estadoAsistencia.toLowerCase().replaceAll("_", " ")}
              </p>
              <div className={styles["actions"]}>
                <Link
                  href={`/reuniones/${pasada.eventoProveedor?.instancia.solicitudSalaId}/encuentros/${pasada.eventoProveedor?.instanciaSalaId}/asistencia#ocurrencia-${pasada.id}`}
                >
                  Ver asistencia de este Zoom
                </Link>
                <Link
                  href={`?vista=pasadas&ocurrencia=${encodeURIComponent(pasada.id)}`}
                  aria-expanded={pasadaSeleccionada?.id === pasada.id}
                >
                  Consultar duración real <ArrowRight size={15} />
                </Link>
              </div>
              <AccionesPasada
                ocurrenciaId={pasada.id}
                eventoId={pasada.eventoProveedorId}
                instanciaId={pasada.eventoProveedor?.instanciaSalaId}
              />
              {pasadaSeleccionada?.id === pasada.id && detallePasado ? (
                <div className={styles["result"]} role="status">
                  {detallePasado.estado === "DISPONIBLE" ? (
                    <>
                      <strong>Detalle informado por Zoom</strong>
                      <p>
                        Inicio:{" "}
                        {detallePasado.detalle.inicio
                          ? formatDateTime(detallePasado.detalle.inicio)
                          : "Sin dato"}{" "}
                        · Fin:{" "}
                        {detallePasado.detalle.fin
                          ? formatDateTime(detallePasado.detalle.fin)
                          : "Sin dato"}
                      </p>
                      <p>
                        Duración real:{" "}
                        {detallePasado.detalle.duracionMinutos === null
                          ? "Sin dato"
                          : `${detallePasado.detalle.duracionMinutos} min`}
                        {detallePasado.detalle.inicio && detallePasado.detalle.fin
                          ? ` (${formatDuration(detallePasado.detalle.inicio, detallePasado.detalle.fin)})`
                          : ""}
                      </p>
                      {detallePasado.detalle.participantesReportados !== null ? (
                        <p>
                          Participaciones informadas por Zoom:{" "}
                          {detallePasado.detalle.participantesReportados}. Puede incluir
                          reconexiones; la asistencia por ejecución figura en el informe.
                        </p>
                      ) : null}
                    </>
                  ) : (
                    <p>
                      <CircleAlert size={16} /> {detallePasado.mensaje}
                    </p>
                  )}
                </div>
              ) : null}
            </article>
          ))}
        </section>
      ) : null}
    </div>
  );
}
