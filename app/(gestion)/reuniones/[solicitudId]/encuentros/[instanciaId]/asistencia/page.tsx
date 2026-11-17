import { ArrowLeft, Clock3, ExternalLink, ShieldCheck, UsersRound, GitCompareArrows } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { AttendanceRegenerateAction } from "@/src/components/attendance-regenerate-action";
import { AttendanceRawDownloads } from "@/src/components/attendance-raw-downloads";
import { crearArchivosRepository } from "@/src/bootstrap/archivos.server";
import { leerAsistenciaZoomFicha } from "@/src/bootstrap/zoom-asistencia-lectura.server";
import { ZoomAsistenciaConciliacion } from "@/src/components/zoom-asistencia-conciliacion";
import { ZoomAsistenciaOcurrencias } from "@/src/components/zoom-asistencia-ocurrencias";
import { descifrarConfiguracion } from "@/src/lib/config/encryption";
import { db } from "@/src/lib/db";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { crearGoogleAuthJwt } from "@/src/integrations/google";
import {
  construirVistaAsistencia,
  type FilaVistaAsistencia
} from "@/src/modules/archivos/domain/attendance-view.domain";
import { leerPlanillaAsistenciaGoogle } from "@/src/modules/archivos/infrastructure/google/google-attendance-sheet-reader.client";
import { puedeGestionarPrograma } from "@/src/modules/reuniones/permisos-programa.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function fechaUY(date: Date): string {
  return new Intl.DateTimeFormat("es-UY", {
    timeZone: "America/Montevideo",
    dateStyle: "full"
  }).format(date);
}

function horaUY(date: Date): string {
  return new Intl.DateTimeFormat("es-UY", {
    timeZone: "America/Montevideo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function fechaHoraUY(value: string | null): string {
  if (!value) {
    return "—";
  }
  // La hoja ya contiene horas locales uruguayas. Los registros Meet están en ISO UTC.
  if (/^\d{1,2}:\d{2}/.test(value)) {
    return value;
  }
  const time = new Date(value);
  return Number.isFinite(time.getTime()) ? horaUY(time) : value;
}

function ListaAsistencia({
  filas,
  incluirPorcentaje = true
}: Readonly<{ filas: readonly FilaVistaAsistencia[]; incluirPorcentaje?: boolean }>) {
  if (filas.length === 0) {
    return (
      <p className="attendance-empty">
        No hay registros disponibles en esta sección. Esto no demuestra que no hubiera participantes.
      </p>
    );
  }
  return (
    <div className="attendance-table-scroll" tabIndex={0} aria-label="Desplazar tabla de participantes">
      <table className="attendance-table">
        <thead>
          <tr>
            <th scope="col">Participante</th>
            <th scope="col">Primera conexión (UY)</th>
            <th scope="col">Última desconexión (UY)</th>
            <th scope="col">Minutos</th>
            {incluirPorcentaje ? <th scope="col">Asistencia</th> : null}
            {incluirPorcentaje ? <th scope="col">Umbral 5/6</th> : null}
            <th scope="col">Conexiones</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((fila) => (
            <tr key={fila.id}>
              <td>
                <div className="attendance-identity">
                  <strong>{fila.nombre}</strong>
                  <small>{fila.correo ?? "Correo no verificado"}</small>
                  <span className="attendance-source">
                    {fila.rol ? `${fila.rol} · ` : ""}
                    {fila.fuente === "REPORTS"
                      ? "Identidad de Reports, sin sumar al total Meet"
                      : fila.fuente === "LEGADO"
                        ? "Planilla anterior, sin verificar fuente"
                        : fila.conciliacion === "VERIFICADA"
                          ? "Meet + Reports · identidad vinculada"
                          : "Sesiones: Meet · identidad sin conciliar"}
                  </span>
                  {fila.conciliacion === "VERIFICADA" &&
                  fila.diferenciaMinutos !== null &&
                  fila.diferenciaMinutos !== undefined ? (
                    <small className="attendance-delta">
                      Diferencia de minutos Meet − Reports: {fila.diferenciaMinutos.toLocaleString("es-UY")}
                    </small>
                  ) : null}
                </div>
              </td>
              <td>{fechaHoraUY(fila.primeraConexion)}</td>
              <td>{fechaHoraUY(fila.ultimaDesconexion)}</td>
              <td className="attendance-number">{fila.minutos.toLocaleString("es-UY")}</td>
              {incluirPorcentaje ? (
                <td className="attendance-percent">
                  <strong>{fila.porcentaje.toLocaleString("es-UY", { maximumFractionDigits: 2 })} %</strong>
                  <span className="attendance-meter" aria-hidden="true">
                    <span style={{ width: `${fila.porcentaje}%` }} />
                  </span>
                </td>
              ) : null}
              {incluirPorcentaje ? (
                <td>
                  <span className={`attendance-outcome ${fila.cumple ? "is-ok" : "is-under"}`}>
                    {fila.cumple ? "CUMPLE" : "MENOS DE 5/6"}
                  </span>
                </td>
              ) : null}
              <td className="attendance-number">{fila.conexiones}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function EncuentroAsistenciaPage({
  params
}: Readonly<{ params: Promise<{ solicitudId: string; instanciaId: string }> }>) {
  const session = await auth();
  if (!session?.user) {
    redirect("/acceso");
  }
  const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
  if (!actor?.activo) {
    redirect("/acceso");
  }

  const { solicitudId, instanciaId } = await params;
  const encuentro = await db.instanciaSala.findUnique({
    where: { id: instanciaId },
    select: {
      id: true,
      estado: true,
      inicioProgramadoAt: true,
      finProgramadoAt: true,
      solicitud: { select: { id: true, titulo: true, docentePrograma: { select: { programaId: true } } } },
      eventosProveedor: {
        where: { proveedor: { tipo: "GOOGLE_MEET" } },
        take: 1,
        select: {
          codigoReunion: true,
          cuentaProveedor: { select: { emailOrganizador: true } },
          archivos: {
            where: { tipo: "LISTA_ASISTENCIA" },
            take: 1,
            select: { driveFileId: true, webViewUrl: true, mimeType: true }
          }
        }
      }
    }
  });

  if (!encuentro || encuentro.solicitud.id !== solicitudId) {
    notFound();
  }
  if (!(await puedeGestionarPrograma(db, actor, encuentro.solicitud.docentePrograma.programaId))) {
    notFound();
  }

  if (encuentro.eventosProveedor.length === 0) {
    const eventoZoom = await db.eventoProveedor.findFirst({
      where: { instanciaSalaId: instanciaId, proveedor: { tipo: "ZOOM" } },
      select: { id: true }
    });
    if (eventoZoom) {
      // Zoom: lectura de lo persistido, sin Workspace; Sala Virtual sirve la vista y la exportación tras validar el alcance.
      const zoom = await leerAsistenciaZoomFicha(instanciaId, { id: actor.id, rol: actor.rol });
      const base = `/api/v1/reuniones/instancias/${encodeURIComponent(instanciaId)}/asistencia/exportar/zoom`;
      return (
        <main className="attendance-page">
          <Link href={`/reuniones/${solicitudId}`}>
            <ArrowLeft size={16} /> Volver a la reunión
          </Link>
          <h1>Asistencia Zoom · {encuentro.solicitud.titulo}</h1>
          <p>
            {fechaUY(encuentro.inicioProgramadoAt)} · {horaUY(encuentro.inicioProgramadoAt)}–
            {horaUY(encuentro.finProgramadoAt)} (UY)
          </p>
          <ZoomAsistenciaOcurrencias ocurrencias={zoom.ocurrencias} instanciaId={instanciaId} />
          <h2>Resumen consolidado del encuentro</h2>
          {zoom.registros.length === 0 ? (
            <p className="attendance-empty">
              {zoom.estadoReporte === "VACIO"
                ? "El reporte de Zoom no contiene conexiones."
                : "Todavía no hay registros de asistencia de Zoom. Esto no demuestra que no hubiera participantes."}
            </p>
          ) : (
            <>
              <p>
                <a href={`${base}?conjunto=resumen&formato=csv`}>Resumen (CSV)</a> ·{" "}
                <a href={`${base}?conjunto=sesiones&formato=csv`}>Sesiones originales (CSV)</a> ·{" "}
                <a href={`${base}?conjunto=resumen&formato=json`}>Resumen (JSON)</a>
              </p>
              <ZoomAsistenciaConciliacion
                instanciaId={instanciaId}
                registros={zoom.registros}
                invitados={zoom.invitados}
                puedeConciliar={zoom.puedeConciliar}
              />
            </>
          )}
          {actor.rol === "ADMINISTRACION" ? <AttendanceRegenerateAction instanciaId={instanciaId} /> : null}
        </main>
      );
    }
  }

  const evento = encuentro.eventosProveedor[0];
  const archivo = evento?.archivos[0];
  const termino = encuentro.finProgramadoAt.getTime() < Date.now();
  const cancelada = encuentro.estado === "CANCELADA" || encuentro.estado === "NO_REALIZADA";
  const esAdmin = actor.rol === "ADMINISTRACION";
  const planillaUrl =
    archivo?.webViewUrl ??
    (archivo?.driveFileId
      ? `https://drive.google.com/open?id=${encodeURIComponent(archivo.driveFileId)}`
      : null);

  let vista: ReturnType<typeof construirVistaAsistencia> | null = null;
  let errorLectura: string | null = null;
  if (archivo?.driveFileId && archivo.mimeType === "application/vnd.google-apps.spreadsheet") {
    try {
      const config = await crearArchivosRepository().obtenerConfiguracionWorkspacePrincipal();
      const subject = evento?.cuentaProveedor?.emailOrganizador?.trim();
      if (!config?.activa || !config.serviceAccountEmail || !config.privateKeyCifrada || !subject) {
        errorLectura = "No están disponibles las credenciales necesarias para leer la planilla.";
      } else {
        const jwt = crearGoogleAuthJwt(
          {
            serviceAccountEmail: config.serviceAccountEmail,
            privateKey: descifrarConfiguracion(config.privateKeyCifrada),
            subject
          },
          ["https://www.googleapis.com/auth/spreadsheets"]
        );
        const datos = await leerPlanillaAsistenciaGoogle(jwt, archivo.driveFileId);
        vista = construirVistaAsistencia(datos, encuentro.inicioProgramadoAt, encuentro.finProgramadoAt);
      }
    } catch {
      errorLectura =
        "No se pudo leer la planilla desde Google Sheets. Verificá permisos y volvé a intentarlo.";
    }
  } else if (archivo) {
    errorLectura =
      "El archivo existente no es una planilla Google Sheets. Se puede abrir desde el enlace original.";
  }

  const conciliacion = vista?.indicador;
  const cumplen = vista?.participantes.filter((p) => p.cumple).length ?? 0;
  const estadoConciliacion =
    conciliacion?.estado === "VINCULADA"
      ? "Vinculación completa"
      : conciliacion?.estado === "CONFERENCIA_AMBIGUA"
        ? "Conferencias ambiguas"
        : conciliacion?.estado === "SIN_MEET"
          ? "Sin sesiones Meet verificables"
          : conciliacion?.estado === "SIN_REPORTS"
            ? "Sin eventos Reports disponibles"
            : "Conciliación parcial";
  const vuelta = `/reuniones/${solicitudId}#encuentros`;

  return (
    <main className="attendance-view">
      <Link className="meeting-detail-back" href={vuelta}>
        <ArrowLeft size={16} aria-hidden="true" />
        Volver a encuentros
      </Link>
      <header className="attendance-view-header">
        <div>
          <p className="page-eyebrow">Google Meet + Workspace Reports</p>
          <h1>Asistencia del encuentro</h1>
          <p className="attendance-view-subtitle">{encuentro.solicitud.titulo}</p>
          <p className="attendance-view-date">
            <Clock3 size={16} aria-hidden="true" />
            {fechaUY(encuentro.inicioProgramadoAt)} · {horaUY(encuentro.inicioProgramadoAt)}–
            {horaUY(encuentro.finProgramadoAt)} (Uruguay)
          </p>
          {evento?.codigoReunion ? (
            <small className="attendance-meet-code">Código Meet: {evento.codigoReunion}</small>
          ) : null}
        </div>
        <div className="attendance-view-actions">
          {planillaUrl ? (
            <a className="secondary-action" href={planillaUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={16} />
              Abrir planilla
            </a>
          ) : null}
          {esAdmin && termino && !cancelada && evento?.codigoReunion ? (
            <AttendanceRegenerateAction instanciaId={instanciaId} />
          ) : null}
        </div>
      </header>

      {archivo?.driveFileId && archivo.mimeType === "application/vnd.google-apps.spreadsheet" ? (
        <AttendanceRawDownloads instanciaId={instanciaId} />
      ) : null}

      {!termino ? (
        <section className="attendance-state" role="status">
          <h2>Encuentro pendiente o en curso</h2>
          <p>
            La asistencia definitiva se obtiene después de finalizar la conferencia y de que Google publique
            los registros. La información aún no es concluyente.
          </p>
        </section>
      ) : cancelada ? (
        <section className="attendance-state">
          <h2>Encuentro no realizado</h2>
          <p>No se calcula asistencia para reuniones canceladas o no realizadas.</p>
        </section>
      ) : !archivo ? (
        <section className="attendance-state">
          <h2>La planilla todavía no está disponible</h2>
          <p>
            Puede estar pendiente la sincronización de Meet y Reports.{" "}
            {esAdmin
              ? "Usá «Actualizar asistencia» para recuperarla."
              : "Solicitá a Administración que sincronice la asistencia."}
          </p>
        </section>
      ) : errorLectura ? (
        <section className="attendance-state" role="alert">
          <h2>Asistencia no disponible</h2>
          <p>{errorLectura}</p>
        </section>
      ) : vista ? (
        <>
          <section className="attendance-reconciliation" aria-label="Indicador de conciliación">
            <div className="attendance-reconciliation-heading">
              <div>
                <h2>
                  <GitCompareArrows size={19} aria-hidden="true" />
                  Conciliación Meet y Reports
                </h2>
                <p>
                  Recuentos de ambas fuentes por separado. Nunca se suman como si fueran personas distintas.
                </p>
              </div>
              <span
                className={`attendance-reconciliation-status ${conciliacion?.estado === "VINCULADA" ? "is-verified" : "is-pending"}`}
              >
                {estadoConciliacion}
              </span>
            </div>
            <div className="attendance-summary">
              <article>
                <UsersRound size={19} aria-hidden="true" />
                <span>Personas Meet</span>
                <strong>{conciliacion?.personasMeet ?? 0}</strong>
                <small>Participantes únicos según Meet</small>
              </article>
              <article>
                <UsersRound size={19} aria-hidden="true" />
                <span>Correos Reports</span>
                <strong>{conciliacion?.correosReports ?? 0}</strong>
                <small>Direcciones únicas observadas</small>
              </article>
              <article>
                <Clock3 size={19} aria-hidden="true" />
                <span>Sesiones Meet</span>
                <strong>{conciliacion?.sesionesMeet ?? 0}</strong>
                <small>Conexiones de participantes Meet</small>
              </article>
              <article>
                <Clock3 size={19} aria-hidden="true" />
                <span>Eventos Reports</span>
                <strong>{conciliacion?.sesionesReports ?? 0}</strong>
                <small>Registros de finalización de llamada</small>
              </article>
            </div>
            <div className="attendance-reconciliation-details">
              <span>
                <strong>{conciliacion?.personasVinculadas ?? 0}</strong> identidades vinculadas con evidencia
              </span>
              <span>
                <strong>{conciliacion?.meetSinVincular ?? 0}</strong> participantes Meet sin vincular
              </span>
              <span>
                <strong>{conciliacion?.correosSinVincular ?? 0}</strong> correos Reports sin vincular
              </span>
              <span>
                <strong>{conciliacion?.registrosReportsSinCorreo ?? 0}</strong> registros Reports sin correo
              </span>
            </div>
            <p className="attendance-reconciliation-diff">
              Diferencia entre fuentes (Meet − Reports):{" "}
              <strong>{conciliacion?.diferenciaPersonas ?? 0}</strong> registros de personas/correos y{" "}
              <strong>{conciliacion?.diferenciaSesiones ?? 0}</strong> conexiones/eventos.{" "}
              {conciliacion?.sesionesReportsSinSolapamiento ?? 0} eventos Reports no se superponen
              temporalmente con ninguna sesión Meet observada.
            </p>
            {conciliacion?.estado === "CONFERENCIA_AMBIGUA" ? (
              <p className="attendance-reconciliation-warning" role="status">
                Los registros de Reports incluyen {conciliacion.conferenciasReports} identificadores de
                conferencia. No es seguro atribuir sus correos a este encuentro. Revisá la auditoría antes de
                utilizarlos.
              </p>
            ) : null}
            {conciliacion?.estado === "SIN_REPORTS" && conciliacion.personasMeet > 0 ? (
              <p className="attendance-reconciliation-warning" role="status">
                Asistencia preliminar según Google Meet. Workspace Reports todavía no aportó registros; los
                datos pueden actualizarse cuando Google los publique. Administración puede volver a
                sincronizar la asistencia.
              </p>
            ) : null}
            <p className="attendance-reconciliation-note">
              Las APIs no comparten necesariamente una clave de identidad. Los mismos nombres u horarios no
              prueban que dos registros sean de la misma persona. Los números distintos señalan una diferencia
              de cobertura, no participantes adicionales ni ausencias confirmadas.
            </p>
          </section>

          <section className="attendance-summary-compact" aria-label="Cumplimiento de asistencia">
            <ShieldCheck size={18} aria-hidden="true" />
            <span>
              <strong>{cumplen}</strong> participantes Meet alcanzan el umbral de 5/6, de{" "}
              {conciliacion?.personasMeet ?? 0} registros principales.
            </span>
          </section>

          <section className="attendance-data">
            <h2>Participantes y cumplimiento</h2>
            <p>
              Fuente principal: sesiones de Meet dentro del horario programado. El umbral de 5/6 equivale a
              83,33 % del encuentro. Los correos de Reports se vinculan solo cuando existe correspondencia
              inequívoca; no se asocian por nombre.
            </p>
            <ListaAsistencia filas={vista.participantes} />
          </section>

          <section className="attendance-data">
            <h2>Identidades observadas en Reports</h2>
            <p>
              Correos identificados en la auditoría, con sus propios tiempos y cantidad de eventos. No son
              personas adicionales al listado de Meet: pueden corresponder a los mismos asistentes, pero no se
              asignan sin una clave comprobable.
            </p>
            <ListaAsistencia filas={vista.reportes} incluirPorcentaje={false} />
          </section>

          <details className="attendance-data attendance-raw-details">
            <summary>Organizador y cohosts configurados ({vista.responsables.length})</summary>
            <p>
              Estos correos se muestran por separado. Una cuenta configurada no implica que su conexión haya
              sido identificada en Meet.
            </p>
            <ListaAsistencia filas={vista.responsables} incluirPorcentaje={false} />
          </details>

          {vista.origenPrincipal === "SIN_MEET" && vista.registrosHeredados.length > 0 ? (
            <details className="attendance-data attendance-raw-details">
              <summary>
                Filas de planilla anterior sin trazabilidad Meet ({vista.registrosHeredados.length})
              </summary>
              <p>
                La planilla anterior no conserva sesiones brutas de Meet. Estas filas son históricas y no se
                cuentan como participantes Meet; regenerá la planilla desde las APIs para obtener una
                conciliación actualizada.
              </p>
              <ListaAsistencia filas={vista.registrosHeredados} />
            </details>
          ) : null}
          <p className="attendance-source-note">
            Fuente: última planilla sincronizada desde Meet y Workspace Reports. La diferencia entre eventos
            Reports y sesiones Meet no demuestra ausencia ni identidad. Los datos pueden publicarse con
            retraso.
          </p>
        </>
      ) : null}
    </main>
  );
}
