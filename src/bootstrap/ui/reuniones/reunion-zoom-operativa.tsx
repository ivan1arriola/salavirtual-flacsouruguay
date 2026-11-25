import {
  Activity,
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Clock3,
  ExternalLink,
  FileText,
  Hash,
  Radio,
  Users,
  Video,
  Settings2,
  ShieldCheck,
  LockKeyhole
} from "lucide-react";
import Link from "next/link";
import type { EstadoAsistenciaZoomEnVivo } from "@/src/integrations/zoom/zoom-live-participants.client";
import type { ReunionOperativaView } from "@/src/modules/reuniones/reunion-operativa.service";
import { ZoomPasscodeControl } from "@/src/components/zoom-passcode-control";
import { MeetingScheduleTimes } from "@/src/components/meeting-schedule-times";
import { OperationalIncidentForm } from "@/src/components/operational-incident-form";
import { OperationalAssistanceClosureForm } from "@/src/components/operational-assistance-closure-form";
import { AssistantSelfUnassignButton } from "@/src/modules/asistencia/presentation/components/assistant-self-unassign-button";
import { formatDate, formatTime } from "@/src/lib/ui/format";
import styles from "./reunion-zoom-operativa.module.css";
import { NavegacionEncuentroZoom } from "./navegacion-encuentro-zoom";
import { ItemActividad } from "./zoom-actividad-item";
import {
  esActividadOperativaZoom,
  resumirActividadEncuentroZoom,
  resumirPresenciaObservadaZoom,
  type EntradaActividadZoom
} from "@/src/modules/reuniones/presentation/actividad-encuentro-zoom";
import { ZoomIntegrationWarning } from "./zoom-integration-warning";
import {
  etiquetaEstadoActualZoom,
  type EstadoActualZoom
} from "@/src/modules/reuniones/presentation/estado-actual-zoom";

/** La consola Zoom no presenta datos ni controles de Google Meet como propios. */
export function ReunionZoomOperativa({
  reunion,
  rol,
  salaEspera,
  asistenciaEnVivo,
  actividad = [],
  estadoActual,
  actualizarAutomaticamente
}: Readonly<{
  reunion: ReunionOperativaView;
  rol: "ADMINISTRACION" | "DOCENTE" | "ASISTENTE_TECNICO";
  salaEspera: boolean | null;
  asistenciaEnVivo: EstadoAsistenciaZoomEnVivo;
  /** Hechos confirmados por webhooks de Zoom para esta ejecución, de más antiguo a más reciente. */
  actividad?: readonly EntradaActividadZoom[];
  estadoActual?: EstadoActualZoom;
  actualizarAutomaticamente?: boolean;
}>) {
  const esAsistente = rol === "ASISTENTE_TECNICO";
  const enlace = reunion.zoom.joinUrl;
  const puedeDesasignarse =
    esAsistente &&
    Boolean(reunion.asistencia.asignacionId) &&
    reunion.asistencia.inicioAt > reunion.actualizadoAt;
  const completada = reunion.estado === "FINALIZADA" || reunion.estado === "NO_INICIADA";
  const participantes = asistenciaEnVivo.estado === "DISPONIBLE" ? asistenciaEnVivo.participantes : [];
  const enReunion = participantes.filter((p) => p.estado === "EN_REUNION").length;
  const anfitrionesConectados = participantes.filter(
    (p) => p.estado === "EN_REUNION" && p.rol === "ANFITRION"
  ).length;
  const enEspera = participantes.filter((p) => p.estado === "EN_ESPERA").length;
  const salieron = participantes.filter((p) => p.estado === "DESCONECTADO").length;
  const sinEstado = participantes.filter((p) => p.estado === "DESCONOCIDO").length;
  const tieneMetricasCalidad = participantes.some(
    (p) => p.calidadAudio || p.calidadVideo || p.calidadPantalla
  );
  const conProblemasCalidad = participantes.filter((p) =>
    [p.calidadAudio, p.calidadVideo, p.calidadPantalla].some(
      (calidad) => calidad === "poor" || calidad === "bad"
    )
  ).length;

  const actividadOperativa = actividad.filter((a) => esActividadOperativaZoom(a.tipo));
  const actividadSecundaria = actividad.filter((a) => !esActividadOperativaZoom(a.tipo));
  const resumen = resumirActividadEncuentroZoom(actividadOperativa);
  const presenciaObservada = resumirPresenciaObservadaZoom(actividadOperativa);
  const alertasCalidad = actividadOperativa
    .filter((a) => a.tipo === "meeting.alert")
    .slice(-5)
    .reverse();
  const eventosRecientes = actividadOperativa.slice(-15).reverse();
  const eventosAnteriores = actividadOperativa.slice(0, -15).reverse();
  const ultimoEvento = actividad.at(-1);
  let estadoAnfitrion = "Sin verificar";
  if (asistenciaEnVivo.estado === "DISPONIBLE") {
    estadoAnfitrion = anfitrionesConectados > 0 ? "Detectado en sala" : "No detectado en sala";
  }

  return (
    <main className={styles.page}>
      <NavegacionEncuentroZoom
        reunion={reunion}
        rol={rol}
        historica={false}
        actualizarAutomaticamente={actualizarAutomaticamente}
      />

      <header className={styles.hero}>
        <div className={styles.eyebrow}>
          <span>{reunion.programa}</span>
          <span className={styles.provider}>
            <Video size={15} /> Zoom
          </span>
        </div>
        <h1>{reunion.titulo}</h1>
        <p className={styles.subtitle}>
          {reunion.docente}
          {reunion.docenteEmail ? ` · ${reunion.docenteEmail}` : ""}
        </p>
        <div className={styles.chips} aria-label="Fecha y horario">
          <span>
            <CalendarClock size={15} /> {formatDate(reunion.inicioProgramadoAt)}
          </span>
          <span>
            <Clock3 size={15} /> {formatTime(reunion.inicioProgramadoAt)} –{" "}
            {formatTime(reunion.finProgramadoAt)}
          </span>
          <span>{reunion.modalidad === "HIBRIDA" ? "Híbrida" : "Virtual"}</span>
        </div>
        <details className={styles.scheduleDetails}>
          <summary>Ver horarios de asistencia</summary>
          <MeetingScheduleTimes
            startsAt={reunion.inicioProgramadoAt}
            endsAt={reunion.finProgramadoAt}
            requiresAssistance={reunion.asistencia.requerida}
            modality={reunion.modalidad}
            assistanceStartsAt={reunion.asistencia.inicioAt}
            assistanceEndsAt={reunion.asistencia.finAt}
            viewerIsAssistant={esAsistente}
            compact
          />
        </details>
        <div className={styles.actions}>
          {enlace ? (
            <a href={enlace} rel="noreferrer" target="_blank" className={styles.primary}>
              <ExternalLink size={17} aria-hidden="true" /> Unirse a Zoom
            </a>
          ) : (
            <span className={styles.pending}>
              <AlertTriangle size={16} /> Enlace Zoom pendiente
            </span>
          )}

          {puedeDesasignarse && reunion.asistencia.asignacionId ? (
            <AssistantSelfUnassignButton
              assignmentId={reunion.asistencia.asignacionId}
              title={reunion.titulo}
            />
          ) : null}
        </div>
      </header>

      <section className={styles.securityCard} aria-label="Seguridad y acceso de Zoom">
        <div className={styles.heading}>
          <ShieldCheck size={20} aria-hidden="true" />
          <h2>Seguridad y acceso</h2>
        </div>
        <p className={styles.note}>
          Configuración consultada en Zoom. Los cambios pueden afectar a toda una serie de reuniones.
        </p>
        <div className={styles.securityGrid}>
          <div className={styles.securityItem}>
            <div className={styles.securityLabel}>
              <Users size={19} aria-hidden="true" />
              <strong>Sala de espera</strong>
            </div>
            <span
              className={
                salaEspera === true ? styles.enabled : salaEspera === false ? styles.disabled : styles.unknown
              }
            >
              {salaEspera === true ? "Habilitada" : salaEspera === false ? "Deshabilitada" : "Sin verificar"}
            </span>
            <small>
              {asistenciaEnVivo.estado === "DISPONIBLE"
                ? enEspera + " persona(s) esperando según Zoom Dashboard"
                : "La cantidad de personas en espera depende de la consulta de participantes en vivo"}
            </small>
          </div>
          <div className={styles.securityItem}>
            <div className={styles.securityLabel}>
              <LockKeyhole size={19} aria-hidden="true" />
              <strong>Código de acceso</strong>
            </div>
            {rol === "ADMINISTRACION" ? (
              <ZoomPasscodeControl instanciaId={reunion.id} />
            ) : (
              <p className={styles.note}>
                La consulta y gestión del código requieren permisos de administración.
              </p>
            )}
          </div>
        </div>
      </section>

      <section className={styles.card} aria-label="Estado de la reunión">
        <div className={styles.heading}>
          <Activity size={19} aria-hidden="true" />
          <h2>Estado de la reunión</h2>
        </div>
        <p className={styles.status}>
          {estadoActual
            ? etiquetaEstadoActualZoom(estadoActual)
            : reunion.estado.replaceAll("_", " ").toLowerCase()}
        </p>
        {estadoActual?.ejecucion &&
        (estadoActual.tipo === "ACTIVA" || estadoActual.tipo === "INICIO_SIN_VERIFICAR") ? (
          <p className={styles.note}>Inicio observado: {formatTime(estadoActual.ejecucion.inicio)}.</p>
        ) : null}
        {estadoActual?.tipo === "OTRA_EJECUCION" ? (
          <p className={styles.note}>
            No se muestran asistentes de otra ejecución de la serie. Se actualizará cuando se confirme el
            vínculo.
          </p>
        ) : null}
        <p className={styles.note}>Última comprobación: {formatTime(reunion.actualizadoAt)}.</p>
        <div className={styles.statusGrid}>
          <div>
            <Video size={18} aria-hidden="true" />
            <strong>Zoom</strong>
            <span>{reunion.zoom.estadoIntegracion ?? "Pendiente"}</span>
          </div>
          <div>
            <Users size={18} aria-hidden="true" />
            <strong>En reunión</strong>
            <span>
              {asistenciaEnVivo.estado === "DISPONIBLE" ? enReunion + " conexión(es)" : "Sin verificar"}
            </span>
          </div>
          <div>
            <Users size={18} aria-hidden="true" />
            <strong>Anfitrión</strong>
            <span>{estadoAnfitrion}</span>
          </div>
          <div>
            <Radio size={18} aria-hidden="true" />
            <strong>Grabación</strong>
            <span>{estadoGrabacionActual(actividad)}</span>
            <small>{reunion.requiereGrabacion ? "Requerida" : "No requerida"}</small>
          </div>
        </div>
        <p className={styles.note}>
          La solicitud de grabación no confirma que Zoom esté grabando. El inicio y la finalización se
          verifican mediante los eventos de grabación recibidos.
        </p>
        {reunion.zoom.errorIntegracion ? (
          <ZoomIntegrationWarning error={reunion.zoom.errorIntegracion} rol={rol} />
        ) : null}
      </section>

      <section className={styles.card} aria-label="Participantes de Zoom en vivo">
        <div className={styles.sectionHeading}>
          <div className={styles.heading}>
            <Users size={19} aria-hidden="true" />
            <h2>Participantes en vivo</h2>
          </div>
          {asistenciaEnVivo.estado === "DISPONIBLE" ? (
            <span className={styles.updatedTag}>Datos de Zoom Dashboard</span>
          ) : null}
        </div>
        {asistenciaEnVivo.estado === "DISPONIBLE" ? (
          <>
            <p className={styles.note}>
              Zoom informa conexiones en reunión, sala de espera y sesiones que ya finalizaron. Una persona
              que vuelve a entrar puede aparecer en más de una conexión.
            </p>
            <div className={styles.liveSummary}>
              <div>
                <strong>{enReunion}</strong>
                <span>Conexiones en reunión</span>
              </div>
              <div>
                <strong>{enEspera}</strong>
                <span>Conexiones en espera</span>
              </div>
              <div>
                <strong>{salieron}</strong>
                <span>Conexiones que salieron</span>
              </div>
              <div>
                <strong>{conProblemasCalidad}</strong>
                <span>Conexiones con calidad deficiente</span>
              </div>
            </div>
            {participantes.length ? (
              <>
                <div className={styles.liveList}>
                  {participantes.map((p, index) => (
                    <article key={p.id + ":" + index} className={styles.liveRow}>
                      <div className={styles.liveIdentity}>
                        <strong>{p.nombre}</strong>
                        <span>{p.email ?? "Correo no disponible"}</span>
                        {p.rol !== "DESCONOCIDO" ? <small>{rolParticipanteLabel(p.rol)}</small> : null}
                      </div>
                      <div className={styles.liveStatus}>
                        <span className={estadoParticipanteClass(p.estado)}>
                          {estadoParticipanteLabel(p.estado)}
                        </span>
                        <small>
                          {p.ingreso ? "Entró " + formatTime(new Date(p.ingreso)) : "Ingreso sin horario"}
                        </small>
                        {p.salida ? <small>Salió {formatTime(new Date(p.salida))}</small> : null}
                        {p.motivoSalida ? <small>{p.motivoSalida}</small> : null}
                      </div>
                      <div className={styles.liveQuality} aria-label="Calidad de conexión">
                        <span className={calidadClass(p.calidadAudio)}>
                          Audio: {calidadLabel(p.calidadAudio)}
                        </span>
                        <span className={calidadClass(p.calidadVideo)}>
                          Vídeo: {calidadLabel(p.calidadVideo)}
                        </span>
                        <span className={calidadClass(p.calidadPantalla)}>
                          Pantalla: {calidadLabel(p.calidadPantalla)}
                        </span>
                        {p.tipoConexion || p.tipoRed ? (
                          <small>{[p.tipoConexion, p.tipoRed].filter(Boolean).join(" · ")}</small>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
                {sinEstado > 0 ? (
                  <p className={styles.note}>{sinEstado} conexión(es) sin estado informado por Zoom.</p>
                ) : null}
              </>
            ) : (
              <p className={styles.note}>Zoom no devolvió conexiones para esta consulta.</p>
            )}
            <p className={styles.disclaimer}>
              Las métricas de audio, vídeo y pantalla dependen de que estén habilitadas las puntuaciones de
              calidad en Zoom Dashboard. «Sin dato» no significa que la conexión sea buena o mala.
            </p>
          </>
        ) : (
          <div className={styles.unavailable}>
            <AlertTriangle size={19} aria-hidden="true" />
            <div>
              <strong>{tituloMotivoAsistenciaZoom(asistenciaEnVivo.motivo)}</strong>
              <p>{mensajeMotivoAsistenciaZoom(asistenciaEnVivo.motivo)}</p>
              {asistenciaEnVivo.httpStatus ? (
                <small>
                  HTTP {asistenciaEnVivo.httpStatus}
                  {asistenciaEnVivo.codigoZoom !== undefined
                    ? " · Código Zoom " + asistenciaEnVivo.codigoZoom
                    : ""}
                </small>
              ) : null}
              {asistenciaEnVivo.detalle ? <small>Respuesta de Zoom: {asistenciaEnVivo.detalle}</small> : null}
            </div>
          </div>
        )}
        {asistenciaEnVivo.estado !== "DISPONIBLE" && presenciaObservada.ultimoAviso ? (
          <div className={styles.card}>
            <h3>Última presencia observada por webhooks</h3>
            <p>
              {presenciaObservada.identificadores > 0
                ? presenciaObservada.enSala + " identificador(es) con entrada sin salida posterior · " +
                  presenciaObservada.enEspera + " en espera según el último aviso"
                : "No se recibieron identificadores suficientes para estimar presencia."}
            </p>
            <p className={styles.note}>
              Último aviso: {formatTime(presenciaObservada.ultimoAviso)}. Estos datos pueden estar incompletos,
              no confirman cuántas personas están conectadas ahora y no sustituyen la asistencia oficial.
              {presenciaObservada.sinIdentificador > 0
                ? " Avisos sin identificador: " + presenciaObservada.sinIdentificador + "."
                : ""}
            </p>
          </div>
        ) : null}
      </section>

      <section className={styles.card} aria-label="Calidad de la reunión">
        <div className={styles.heading}>
          <AlertTriangle size={19} aria-hidden="true" />
          <h2>Alertas de calidad de Zoom</h2>
        </div>
        {alertasCalidad.length ? (
          <>
            <p className={styles.note}>
              Problemas de calidad informados por Zoom durante esta ejecución. Son avisos recibidos, no un
              diagnóstico permanente del estado actual.
            </p>
            <ul className={styles.alertList}>
              {alertasCalidad.map((a) => (
                <li key={a.huella ?? a.tipo + a.desde.toISOString()}>
                  <time dateTime={a.desde.toISOString()}>{formatTime(a.desde)}</time>
                  <div>
                    <strong>
                      {a.detalle ? traducirAlertaZoom(a.detalle) : "Problema de calidad reportado"}
                    </strong>
                    <small>Alerta emitida por Zoom</small>
                  </div>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className={styles.note}>
            No se recibieron alertas de calidad para esta ejecución. Esto no demuestra que no haya habido
            problemas: Zoom solo envía estas alertas si la cuenta tiene Business o superior, la opción de
            calidad y alertas de red habilitada en Dashboard y la suscripción meeting.alert activa.
          </p>
        )}
        {tieneMetricasCalidad ? (
          <p className={styles.note}>
            En la consulta actual hay {conProblemasCalidad} conexión(es) con al menos una métrica de calidad
            «deficiente» o «muy deficiente».
          </p>
        ) : null}
      </section>

      <section className={styles.card} aria-labelledby="zoom-actividad-vivo">
        <div className={styles.sectionHeading}>
          <div>
            <h2 id="zoom-actividad-vivo">Actividad operativa</h2>
            <p className={styles.note}>
              Avisos recibidos por webhook, ordenados por la hora del evento.
              {ultimoEvento ? " Último aviso: " + formatTime(ultimoEvento.desde) + "." : ""}
            </p>
          </div>
          <span className={styles.updatedTag}>Actualización automática cada 30 s</span>
        </div>
        {actividadOperativa.length === 0 ? (
          <p>
            Todavía no llegaron avisos operativos de Zoom para esta ejecución. Verificá las suscripciones de
            webhooks; la ausencia de avisos no significa que no haya participantes.
          </p>
        ) : (
          <>
            <div className={styles.activitySummary}>
              <div>
                <strong>{resumen.entradas}</strong>
                <span>Entradas</span>
              </div>
              <div>
                <strong>{resumen.salidas}</strong>
                <span>Salidas</span>
              </div>
              <div>
                <strong>{resumen.admisiones}</strong>
                <span>Admisiones</span>
              </div>
              <div>
                <strong>{resumen.esperaAnfitrion}</strong>
                <span>Esperas</span>
              </div>
              <div>
                <strong>{resumen.cambiosRol}</strong>
                <span>Cambios de rol</span>
              </div>
              <div>
                <strong>{resumen.movimientosGrupos}</strong>
                <span>Movimientos en grupos</span>
              </div>
              <div>
                <strong>{resumen.alertasCalidad}</strong>
                <span>Alertas de calidad</span>
              </div>
              <div>
                <strong>{resumen.eventosGrabacion}</strong>
                <span>Eventos de grabación</span>
              </div>
              <div>
                <strong>{resumen.comparticiones}</strong>
                <span>Eventos de pantalla compartida</span>
              </div>
            </div>
            <ol className={styles.timeline}>
              {eventosRecientes.map((a) => (
                <ItemActividad key={a.huella ?? a.tipo + "-" + a.desde.toISOString()} a={a} />
              ))}
            </ol>
            {eventosAnteriores.length ? (
              <details className={styles.moreActivity}>
                <summary>Ver {eventosAnteriores.length} eventos operativos anteriores</summary>
                <ol className={styles.timeline}>
                  {eventosAnteriores.map((a) => (
                    <ItemActividad key={a.huella ?? a.tipo + "-" + a.desde.toISOString()} a={a} />
                  ))}
                </ol>
              </details>
            ) : null}
            <p className={styles.disclaimer}>
              Los contadores representan avisos recibidos por webhook; no equivalen a cantidad de personas ni
              sustituyen el reporte oficial de asistencia, que se consulta al finalizar la reunión.
            </p>
          </>
        )}
        {actividadSecundaria.length ? (
          <details className={styles.moreActivity}>
            <summary>Otros eventos de Zoom ({actividadSecundaria.length})</summary>
            <ol className={styles.timeline}>
              {actividadSecundaria
                .slice(-20)
                .reverse()
                .map((a) => (
                  <ItemActividad key={a.huella ?? a.tipo + "-" + a.desde.toISOString()} a={a} />
                ))}
            </ol>
            <small>
              Incluye inscripciones y cambios administrativos que no forman parte de la actividad en vivo.
            </small>
          </details>
        ) : null}
      </section>

      <section className={styles.card} aria-label="Acciones rápidas">
        <div className={styles.heading}>
          <ClipboardList size={19} aria-hidden="true" />
          <h2>Acciones rápidas</h2>
        </div>
        <div className={styles.quickActions}>
          {!esAsistente ? (
            <Link href={`/reuniones/${reunion.solicitudId}`}>
              <FileText size={19} /> Ficha completa
            </Link>
          ) : null}
          <Link href="/grabaciones">
            <FileText size={19} /> Grabaciones
          </Link>
          <a href="#incidencias">
            <AlertTriangle size={19} /> Incidencias
          </a>
          <a href="#datos-zoom">
            <Settings2 size={19} /> Datos técnicos
          </a>
        </div>
      </section>

      <section id="incidencias" className={styles.card}>
        <div className={styles.heading}>
          <AlertTriangle size={19} aria-hidden="true" />
          <h2>
            Incidencias (
            {reunion.incidencias.filter((i) => i.estado === "ABIERTA" || i.estado === "EN_ANALISIS").length}{" "}
            abiertas)
          </h2>
        </div>
        <details className={styles.incidents}>
          <summary>Ver historial de incidencias</summary>
          {reunion.incidencias.length ? (
            <ul>
              {reunion.incidencias.map((i) => (
                <li key={i.id}>
                  <strong>{i.tipo.replaceAll("_", " ")}</strong> · {i.estado}
                  <p>{i.descripcion}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p>No hay incidencias registradas.</p>
          )}
        </details>
        <OperationalIncidentForm instanciaId={reunion.id} />
      </section>

      <details id="datos-zoom" className={styles.advanced}>
        <summary>
          <Hash size={18} aria-hidden="true" /> Datos técnicos y configuración de Zoom
        </summary>
        <dl className={styles.facts}>
          <div>
            <dt>ID de reunión</dt>
            <dd className={styles.mono}>{reunion.zoom.id ?? "Pendiente"}</dd>
          </div>
          <div>
            <dt>Cuenta anfitriona</dt>
            <dd>{reunion.zoom.anfitrion ?? "Sin asignar"}</dd>
          </div>
          <div>
            <dt>Integración</dt>
            <dd>{reunion.zoom.estadoIntegracion ?? "Pendiente"}</dd>
          </div>
          <div>
            <dt>Operación pendiente</dt>
            <dd>{reunion.zoom.operacionPendiente ?? "Ninguna"}</dd>
          </div>
          <div>
            <dt>Monitoreo</dt>
            <dd>
              {reunion.asistencia.requerida
                ? (reunion.asistencia.asistente ?? "Pendiente de asignación")
                : "No requerido"}
            </dd>
          </div>
        </dl>
        <p className={styles.note}>
          La admisión, los coanfitriones y la grabación se administran desde Zoom.
        </p>
      </details>
      {esAsistente && reunion.asistencia.asignacionId && completada ? (
        <OperationalAssistanceClosureForm
          asignacionId={reunion.asistencia.asignacionId}
          inicioProgramado={reunion.asistencia.inicioAt.toISOString()}
          finProgramado={reunion.asistencia.finAt.toISOString()}
          cierreConfirmado={reunion.asistencia.cierreConfirmado}
        />
      ) : null}
      <footer className={styles.footer}>
        <CheckCircle2 size={15} aria-hidden="true" /> Información institucional de SalaVirtual · Última
        revisión {formatTime(reunion.actualizadoAt)}
      </footer>
    </main>
  );
}

function estadoParticipanteLabel(estado: string): string {
  if (estado === "EN_REUNION") {
    return "En reunión";
  }
  if (estado === "EN_ESPERA") {
    return "En sala de espera";
  }
  if (estado === "DESCONECTADO") {
    return "Desconectado";
  }
  return "Estado sin informar";
}

function estadoParticipanteClass(estado: string): string {
  if (estado === "EN_REUNION") {
    return styles.participantOnline;
  }
  if (estado === "EN_ESPERA") {
    return styles.participantWaiting;
  }
  if (estado === "DESCONECTADO") {
    return styles.participantDeparted;
  }
  return styles.participantUnknown;
}

function rolParticipanteLabel(rol: string): string {
  if (rol === "ANFITRION") {
    return "Anfitrión";
  }
  if (rol === "PARTICIPANTE") {
    return "Participante";
  }
  return "Rol sin informar";
}

function calidadLabel(calidad: string | null): string {
  if (calidad === "good") {
    return "Buena";
  }
  if (calidad === "fair") {
    return "Aceptable";
  }
  if (calidad === "poor") {
    return "Deficiente";
  }
  if (calidad === "bad") {
    return "Muy deficiente";
  }
  return "Sin dato";
}

function calidadClass(calidad: string | null): string {
  if (calidad === "good") {
    return styles.qualityGood;
  }
  if (calidad === "fair") {
    return styles.qualityFair;
  }
  if (calidad === "poor" || calidad === "bad") {
    return styles.qualityPoor;
  }
  return styles.qualityUnknown;
}

function tituloMotivoAsistenciaZoom(motivo: string): string {
  if (motivo === "SIN_DATOS") {
    return "La consulta de asistencia en vivo no se ejecutó";
  }
  if (motivo === "PLAN_DASHBOARD_REQUERIDO") {
    return "La cuenta no tiene habilitada esta consulta de Dashboard";
  }
  if (motivo === "SIN_PERMISOS") {
    return "Zoom rechazó los permisos de consulta";
  }
  if (motivo === "SIN_REUNION") {
    return "Zoom no encuentra esta reunión";
  }
  if (motivo === "ID_REUNION_INVALIDO") {
    return "El identificador de reunión no es válido";
  }
  if (motivo === "LIMITE_CONSULTAS") {
    return "Zoom limitó temporalmente las consultas";
  }
  if (motivo === "ERROR_CONEXION") {
    return "No se pudo conectar con Zoom";
  }
  return "No se pudo consultar la asistencia en vivo";
}

function mensajeMotivoAsistenciaZoom(motivo: string): string {
  if (motivo === "SIN_DATOS") {
    return "No hay un ID de reunión o credenciales de Zoom disponibles para consultar los participantes en vivo.";
  }
  if (motivo === "PLAN_DASHBOARD_REQUERIDO") {
    return "La API de participantes en vivo requiere una cuenta Business o superior con la función Dashboard habilitada.";
  }
  if (motivo === "SIN_PERMISOS") {
    return "Revisá el scope dashboard:read:list_meeting_participants:admin o los scopes amplios dashboard_meetings:read:admin / dashboard:read:admin, y que la aplicación pueda consultar la cuenta anfitriona.";
  }
  if (motivo === "SIN_REUNION") {
    return "Zoom no devolvió una instancia activa para este ID. Verificá que el encuentro siga abierto y que se esté usando el ID correcto.";
  }
  if (motivo === "ID_REUNION_INVALIDO") {
    return "El ID enviado a Zoom no tiene el formato esperado. Revisá el vínculo entre esta instancia y su reunión en Zoom.";
  }
  if (motivo === "LIMITE_CONSULTAS") {
    return "Se alcanzó el límite de consultas de Dashboard. La próxima actualización automática volverá a intentarlo.";
  }
  if (motivo === "ERROR_CONEXION") {
    return "La API de Zoom no respondió dentro del tiempo esperado. La consulta se reintentará en la siguiente actualización.";
  }
  return "Zoom devolvió un error que no se pudo clasificar. Revisá el código y el mensaje informado abajo.";
}

function traducirAlertaZoom(detalle: string): string {
  const traducciones: Record<string, string> = {
    "Unstable audio quality": "Audio inestable",
    "Unstable video quality": "Vídeo inestable",
    "Unstable screen share quality": "Compartir pantalla inestable",
    "High CPU occupation": "Uso elevado de CPU",
    "Call Reconnection": "Problemas de reconexión"
  };
  return detalle
    .split(",")
    .map((parte) => parte.trim())
    .filter(Boolean)
    .map((parte) => traducciones[parte] ?? parte)
    .join(" · ");
}

function estadoGrabacionActual(actividad: readonly EntradaActividadZoom[]): string {
  const ultimo = [...actividad].reverse().find((a) =>
    [
      "recording.started",
      "recording.resumed",
      "recording.paused",
      "recording.stopped",
      "recording.completed"
    ].includes(a.tipo)
  );
  switch (ultimo?.tipo) {
    case "recording.started":
    case "recording.resumed":
      return "Inicio informado por Zoom";
    case "recording.paused":
      return "Pausa informada por Zoom";
    case "recording.stopped":
    case "recording.completed":
      return "Finalización informada por Zoom";
    default:
      return "Sin confirmar";
  }
}
