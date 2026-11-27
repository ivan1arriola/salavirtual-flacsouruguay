import {
  Activity,
  CalendarDays,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileVideo,
  Info,
  Repeat2,
  UsersRound,
  Video,
  UserRound,
  Wifi,
  Timer
} from "lucide-react";
import Link from "next/link";
import { NavegacionEncuentroZoom } from "./navegacion-encuentro-zoom";
import { OperationalAssistanceClosureForm } from "@/src/components/operational-assistance-closure-form";
import type { AsistenciaZoomFicha } from "@/src/bootstrap/zoom-asistencia-lectura.server";
import { ZoomAsistenciaVista } from "@/src/components/zoom-asistencia-vista";
import { ZoomRegistroDirectorio } from "./zoom-registro-directorio";
import { ZoomConfiguracion } from "./zoom-configuracion";
import { SelectorSeccionZoom } from "./selector-seccion-zoom";
import type { ResultadoInscriptosZoom } from "@/src/integrations/zoom/zoom-registrants.client";
import type { ConfiguracionZoom } from "@/src/integrations/zoom/zoom-client";
import { ZoomActividadCategorias } from "./zoom-actividad-categorias";
import { ZoomCopyIdButton } from "@/src/components/zoom-copy-id-button";
import type { ReunionOperativaView } from "@/src/modules/reuniones/reunion-operativa.service";
import { type EntradaActividadZoom } from "@/src/modules/reuniones/presentation/actividad-encuentro-zoom";
import {
  etiquetaEstadoActualZoom,
  type EjecucionZoomObservada,
  type EstadoActualZoom
} from "@/src/modules/reuniones/presentation/estado-actual-zoom";
import {
  derivarEstadoGrabacionZoomFicha,
  type EstadoGrabacionZoomFicha,
  ETIQUETA_ARCHIVO_GRABACION_ZOOM,
  ETIQUETA_GRABACION_ZOOM
} from "@/src/modules/reuniones/estado-grabacion-zoom.domain";
import { formatDate, formatTime } from "@/src/lib/ui/format";
import styles from "./reunion-zoom-operativa.module.css";

export const SECCIONES_FICHA_ZOOM =
  ["resumen", "inscripciones", "asistencia", "grabaciones", "actividad"] as const;
export type SeccionFichaZoom = (typeof SECCIONES_FICHA_ZOOM)[number];
const NOMBRE_SECCION: Record<SeccionFichaZoom, string> = {
  resumen: "Resumen",
  asistencia: "Asistencia",
  inscripciones: "Inscripciones",
  grabaciones: "Grabaciones",
  actividad: "Actividad"
};

function duracion(inicio: Date | null, fin: Date | null): string {
  if (!inicio || !fin || fin <= inicio) {
    return "Sin confirmar";
  }
  const minutos = Math.round((fin.getTime() - inicio.getTime()) / 60_000);
  return minutos >= 60 ? `${Math.floor(minutos / 60)} h ${minutos % 60} min` : `${minutos} min`;
}

/** Zoom detectó la ejecución (hecho observado); una verificación administrativa sería un paso aparte. */
function etiquetaEjecucion(inicio: Date | null, fin: Date | null): string {
  if (fin) {
    return "Finalizada";
  }
  return inicio ? "Iniciada, sin cierre registrado" : "Sin ejecución detectada por Zoom";
}

const ETIQUETA_REPORTE: Record<string, string> = {
  ERROR: "Error al sincronizar",
  VACIO: "Reporte sin conexiones"
};
function etiquetaAsistencia(hayReporte: boolean, estadoReporte: string): string {
  return hayReporte ? "Reporte oficial de Zoom" : (ETIQUETA_REPORTE[estadoReporte] ?? "Pendiente de Zoom");
}

function SeccionResumen({
  reunion,
  asistencia,
  esAsistente,
  hayReporte,
  conexiones,
  estadoAsistencia,
  ejecuciones = []
}: Readonly<{
  reunion: ReunionOperativaView;
  asistencia: AsistenciaZoomFicha;
  esAsistente: boolean;
  hayReporte: boolean;
  conexiones: number;
  estadoAsistencia: string;
  ejecuciones?: readonly EjecucionZoomObservada[];
}>) {
  const { registros } = asistencia;
  const { inicioRealAt, finRealAt } = reunion.conferencia;
  let inicioRealLabel = "Sin confirmar";
  let finRealLabel = "Sin confirmar";
  if (ejecuciones.length > 1) {
    inicioRealLabel = "Ver ejecuciones";
  } else if (inicioRealAt) {
    inicioRealLabel = formatTime(inicioRealAt);
  }
  if (ejecuciones.length > 1) {
    finRealLabel = "Ver ejecuciones";
  } else if (finRealAt) {
    finRealLabel = formatTime(finRealAt);
  }
  return (
    <>
      <section className={styles.card} aria-labelledby="zoom-resumen">
        <h2 id="zoom-resumen" className={styles.sectionTitle}>
          <Activity size={21} aria-hidden="true" /> Resumen de ejecución
        </h2>
        {ejecuciones.length > 1 ? (
          <div>
            <strong>{ejecuciones.length} ejecuciones vinculadas</strong>
            <p>El inicio y el cierre de cada ejecución se muestran por separado.</p>
            <ul className={styles.files}>
              {[...ejecuciones]
                .sort((a, b) => a.inicio.getTime() - b.inicio.getTime())
                .map((e) => (
                  <li key={e.cuentaZoomId + ":" + e.uuid}>
                    <span>
                      {formatDate(e.inicio)} · {formatTime(e.inicio)}
                    </span>
                    <span>
                      {e.fin
                        ? formatTime(e.fin) + " · " + duracion(e.inicio, e.fin)
                        : "Sin cierre confirmado"}
                    </span>
                  </li>
                ))}
            </ul>
          </div>
        ) : null}
        <dl className={styles.kpis}>
          <div>
            <dt>
              <CalendarDays size={21} aria-hidden="true" /> Inicio real
            </dt>
            <dd>{inicioRealLabel}</dd>
            <small>Programado {formatTime(reunion.inicioProgramadoAt)}</small>
          </div>
          <div>
            <dt>
              <Clock3 size={21} aria-hidden="true" /> Fin real
            </dt>
            <dd>{finRealLabel}</dd>
            <small>Programado {formatTime(reunion.finProgramadoAt)}</small>
          </div>
          <div>
            <dt>
              <Timer size={21} aria-hidden="true" /> Duración real
            </dt>
            <dd>{ejecuciones.length > 1 ? "Por ejecución" : duracion(inicioRealAt, finRealAt)}</dd>
            <small>Según Zoom</small>
          </div>
          <div>
            <dt>
              <UsersRound size={21} aria-hidden="true" /> Personas
            </dt>
            <dd>{hayReporte ? registros.length : "—"}</dd>
            <small>{hayReporte ? "En el reporte de Zoom" : "Sin reporte verificable"}</small>
          </div>
          <div>
            <dt>
              <Wifi size={21} aria-hidden="true" /> Conexiones
            </dt>
            <dd>{hayReporte ? conexiones : "—"}</dd>
            <small>Incluye reingresos</small>
          </div>
          <div>
            <dt>
              <CheckCircle2 size={21} aria-hidden="true" /> Asistencia
            </dt>
            <dd>{estadoAsistencia}</dd>
          </div>
        </dl>
      </section>
      {esAsistente && reunion.asistencia.asignacionId ? (
        <section className={styles.card} aria-label="Cierre de asistencia técnica">
          <h2>Cierre de asistencia técnica</h2>
          <OperationalAssistanceClosureForm
            asignacionId={reunion.asistencia.asignacionId}
            inicioProgramado={reunion.asistencia.inicioAt.toISOString()}
            finProgramado={reunion.asistencia.finAt.toISOString()}
            cierreConfirmado={reunion.asistencia.cierreConfirmado}
          />
        </section>
      ) : null}
    </>
  );
}

const ETIQUETA_TIPO_ZOOM = {
  VIDEO: "Video",
  AUDIO: "Audio",
  CHAT: "Chat",
  TRANSCRIPCION: "Transcripción",
  LINEA_DE_TIEMPO: "Línea de tiempo",
  RESUMEN: "Resumen",
  OTROS: "Otro archivo"
} as const;

function SeccionGrabaciones({
  estado,
  ocurrencias
}: Readonly<{
  estado: EstadoGrabacionZoomFicha;
  ocurrencias: AsistenciaZoomFicha["ocurrencias"];
}>) {
  return (
    <section className={styles.card} aria-labelledby="zoom-grabaciones">
      <h2 id="zoom-grabaciones" className={styles.sectionTitle}>
        <FileVideo size={21} aria-hidden="true" /> Grabaciones
      </h2>
      <p>
        <strong>{ETIQUETA_GRABACION_ZOOM[estado]}</strong>
        {estado === "NO_PREVISTA" ? " · Este encuentro no requería grabación." : null}
        {estado === "SIN_CONFIRMAR"
          ? " · Se esperaba una grabación, pero aún no hay rastro; no se puede afirmar que no exista."
          : null}
      </p>
      <ul className={styles.files}>
        {ocurrencias.flatMap((o) =>
          o.grabaciones.map((g) => (
            <li key={g.id}>
              <span>{ETIQUETA_TIPO_ZOOM[g.tipo]}</span>
              {g.url ? (
                <a href={g.url} target="_blank" rel="noreferrer">
                  Abrir en Drive
                </a>
              ) : (
                <em>{ETIQUETA_ARCHIVO_GRABACION_ZOOM[g.estado]}</em>
              )}
            </li>
          ))
        )}
      </ul>
    </section>
  );
}

export function ReunionZoomHistorica({
  reunion,
  rol,
  asistencia,
  actividad,
  inscriptosZoom,
  configuracion,
  seccion,
  ejecuciones = [],
  estadoActual,
  mostrarRegresoEnVivo = false
}: Readonly<{
  reunion: ReunionOperativaView;
  rol: "ADMINISTRACION" | "DOCENTE" | "ASISTENTE_TECNICO";
  asistencia: AsistenciaZoomFicha;
  actividad: readonly EntradaActividadZoom[];
  inscriptosZoom?: ResultadoInscriptosZoom;
  configuracion?: ConfiguracionZoom;
  seccion: SeccionFichaZoom;
  ejecuciones?: readonly EjecucionZoomObservada[];
  estadoActual?: EstadoActualZoom;
  mostrarRegresoEnVivo?: boolean;
}>) {
  const { registros, ocurrencias } = asistencia;
  const esAsistente = rol === "ASISTENTE_TECNICO";
  const { inicioRealAt, finRealAt } = reunion.conferencia;
  const ejecucion = estadoActual
    ? etiquetaEstadoActualZoom(estadoActual)
    : etiquetaEjecucion(inicioRealAt, finRealAt);
  const hayReporte = asistencia.estadoReporte === "DISPONIBLE" && registros.length > 0;
  const conexiones = registros.reduce((total, r) => total + r.sesiones, 0);
  const estadoGrabacion = derivarEstadoGrabacionZoomFicha({
    requiereGrabacion: reunion.requiereGrabacion,
    ocurrencias: ocurrencias.map((o) => ({
      pendiente: o.hayGrabacionPendiente,
      archivos: o.grabaciones
    }))
  });
  const estadoAsistencia = etiquetaAsistencia(hayReporte, asistencia.estadoReporte);

  return (
    <main className={styles.page}>
      <NavegacionEncuentroZoom
        reunion={reunion}
        rol={rol}
        historica
        actualizarAutomaticamente={mostrarRegresoEnVivo}
      />
      <header className={styles.hero}>
        <div className={styles.eyebrow}>
          <span>{reunion.programa}</span>
          <span className={styles.provider}>
            <Video size={15} aria-hidden="true" /> Zoom
          </span>
          <span className={styles.historyTag}>
            <CheckCircle2 size={15} aria-hidden="true" /> {ejecucion}
          </span>
          <span className={styles.historyTag}>
            <FileVideo size={15} aria-hidden="true" />
            Grabación: {ETIQUETA_GRABACION_ZOOM[estadoGrabacion]}
          </span>
        </div>
        <h1>{reunion.titulo}</h1>
        <p className={styles.subtitle}>
          <UserRound size={17} aria-hidden="true" />
          {reunion.docente}
          {reunion.docenteEmail ? ` · ${reunion.docenteEmail}` : ""}
        </p>
        <div className={styles.chips}>
          <span>
            <CalendarDays size={15} aria-hidden="true" /> {formatDate(reunion.inicioProgramadoAt)}
          </span>
          <span>
            <Clock3 size={15} aria-hidden="true" />
            Programado {formatTime(reunion.inicioProgramadoAt)} – {formatTime(reunion.finProgramadoAt)}
          </span>
        </div>
      </header>

      {mostrarRegresoEnVivo ? (
        <section className={styles.card}>
          <strong>Estás consultando el historial, no la actividad en vivo.</strong>
          <Link href="?vista=actual" className={styles.primary}>
            Ver estado actual de la reunión
          </Link>
        </section>
      ) : null}
      <SelectorSeccionZoom
        seccion={seccion}
        opciones={SECCIONES_FICHA_ZOOM.map((id) => ({ id, nombre: NOMBRE_SECCION[id] }))}
      />
      <nav className={styles.tabs} aria-label="Secciones del encuentro">
        {SECCIONES_FICHA_ZOOM.map((s) => (
          <Link
            key={s}
            href={`?vista=historial&seccion=${s}`}
            aria-current={s === seccion ? "page" : undefined}
            scroll={false}
          >
            {NOMBRE_SECCION[s]}
          </Link>
        ))}
      </nav>

      <div className={styles.historicalLayout}>
        <div className={styles.historicalMain}>
          {seccion === "resumen" ? (
            <>
              <SeccionResumen
                reunion={reunion}
                asistencia={asistencia}
                esAsistente={esAsistente && !mostrarRegresoEnVivo}
                hayReporte={hayReporte}
                conexiones={conexiones}
                estadoAsistencia={estadoAsistencia}
                ejecuciones={ejecuciones}
              />
            </>
          ) : null}

          {seccion === "inscripciones" &&
            (inscriptosZoom ? (
              <ZoomRegistroDirectorio resultado={inscriptosZoom} />
            ) : (
              <section className={styles.card}>
                <h2 className={styles.sectionTitle}>Inscripciones de Zoom</h2>
                <p>No se pudo consultar el directorio.</p>
              </section>
            ))}

          {seccion === "actividad" ? (
            <>
              <ZoomConfiguracion configuracion={configuracion} anfitrion={reunion.zoom.anfitrion} />
              <ZoomActividadCategorias actividad={actividad} id="zoom-actividad" />

              <details className={styles.advanced}>
                <summary>
                  <Info size={19} aria-hidden="true" /> Información técnica
                </summary>
                <dl className={styles.facts}>
                  {ocurrencias.map((o, i) => (
                    <div key={o.id}>
                      <dt>UUID de la ejecución{ocurrencias.length > 1 ? ` ${i + 1}` : ""}</dt>
                      <dd className={styles.mono}>{o.uuid}</dd>
                    </div>
                  ))}
                  <div>
                    <dt>Asistente técnico</dt>
                    <dd>{reunion.asistencia.asistente ?? "Sin asignar"}</dd>
                  </div>
                </dl>
              </details>
            </>
          ) : null}

          {seccion === "asistencia" ? (
            <section className={styles.card} aria-label="Asistencia de Zoom">
              <ZoomAsistenciaVista
                instanciaId={reunion.id}
                asistencia={asistencia}
                puedeDescargar={asistencia.puedeConciliar}
                puedeReintentar={rol === "ADMINISTRACION"}
              />
            </section>
          ) : null}

          {seccion === "grabaciones" ? (
            <SeccionGrabaciones estado={estadoGrabacion} ocurrencias={ocurrencias} />
          ) : null}
        </div>
        {seccion === "actividad" ? (
          <aside className={styles.historicalSidebar} aria-label="Detalles y acciones de Zoom">
              <section className={styles.card} aria-labelledby="zoom-identificacion">
                <h2 id="zoom-identificacion" className={styles.sectionTitle}>
                  <Info size={20} aria-hidden="true" />
                  Detalles de la reunión
                </h2>
                <dl className={styles.facts}>
                  <div>
                    <dt>
                      <Video size={17} aria-hidden="true" /> Meeting ID (compartido por la serie)
                    </dt>
                    <dd className={styles.mono}>
                      {reunion.zoom.id ?? "No disponible"}
                      {reunion.zoom.id ? (
                        <ZoomCopyIdButton meetingId={reunion.zoom.id} contexto={reunion.titulo} />
                      ) : null}
                  </dd>
                </div>
                <div>
                  <dt>
                    <UserRound size={17} aria-hidden="true" /> Cuenta anfitriona
                  </dt>
                  <dd>{reunion.zoom.anfitrion ?? "Sin asignar"}</dd>
                </div>
                <div>
                  <dt>
                    <CheckCircle2 size={17} aria-hidden="true" /> Integración
                  </dt>
                  <dd>{reunion.zoom.estadoIntegracion ?? "Sin verificar"}</dd>
                </div>
                <div>
                  <dt>
                    <Repeat2 size={17} aria-hidden="true" /> Ejecución
                  </dt>
                  <dd>
                    {ocurrencias.length
                      ? `${ocurrencias.length} vinculada(s)`
                      : "Sin ejecución de Zoom vinculada"}
                  </dd>
                </div>
              </dl>
            </section>
            <section className={styles.card} aria-labelledby="zoom-acciones">
              <h2 id="zoom-acciones" className={styles.sectionTitle}>
                <ExternalLink size={20} aria-hidden="true" /> Acciones rápidas
              </h2>
              <div className={styles.quickActions}>
                {reunion.zoom.joinUrl ? (
                  <a href={reunion.zoom.joinUrl} target="_blank" rel="noreferrer">
                    <ExternalLink size={18} aria-hidden="true" /> Abrir en Zoom
                  </a>
                ) : null}
                {!esAsistente ? (
                  <Link href={`/reuniones/${reunion.solicitudId}`}>
                    <Repeat2 size={18} aria-hidden="true" /> Ver serie completa de Zoom
                  </Link>
                ) : null}
              </div>
            </section>
          </aside>
        ) : null}
      </div>
    </main>
  );
}
