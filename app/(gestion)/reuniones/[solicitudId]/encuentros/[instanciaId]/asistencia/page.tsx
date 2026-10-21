import { ArrowLeft, Clock3, ExternalLink, ShieldCheck, UsersRound } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { AttendanceRegenerateAction } from "@/src/components/attendance-regenerate-action";
import { crearArchivosRepository } from "@/src/bootstrap/archivos.server";
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
    timeZone: "America/Montevideo", dateStyle: "full"
  }).format(date);
}

function horaUY(date: Date): string {
  return new Intl.DateTimeFormat("es-UY", {
    timeZone: "America/Montevideo", hour: "2-digit", minute: "2-digit", hour12: false
  }).format(date);
}

function fechaHoraUY(value: string | null): string {
  if (!value) return "—";
  // La hoja ya contiene horas locales uruguayas. Los registros Meet están en ISO UTC.
  if (/^\d{1,2}:\d{2}/.test(value)) return value;
  const time = new Date(value);
  return Number.isFinite(time.getTime()) ? horaUY(time) : value;
}

function ListaAsistencia({
  filas, incluirPorcentaje = true
}: Readonly<{ filas: readonly FilaVistaAsistencia[]; incluirPorcentaje?: boolean }>) {
  if (filas.length === 0) return <p className="attendance-empty">No hay registros disponibles en esta sección. Esto no demuestra que no hubiera participantes.</p>;
  return (
    <div className="attendance-table-scroll" tabIndex={0} aria-label="Desplazar tabla de participantes">
      <table className="attendance-table">
        <thead><tr>
          <th scope="col">Participante</th>
          <th scope="col">Primera conexión (UY)</th>
          <th scope="col">Última desconexión (UY)</th>
          <th scope="col">Minutos</th>
          {incluirPorcentaje ? <th scope="col">Asistencia</th> : null}
          {incluirPorcentaje ? <th scope="col">Umbral 5/6</th> : null}
          <th scope="col">Conexiones</th>
        </tr></thead>
        <tbody>{filas.map((fila) => (
          <tr key={fila.id}>
            <td>
              <div className="attendance-identity">
                <strong>{fila.nombre}</strong>
                <small>{fila.correo ?? "Correo no verificado"}</small>
                <span className="attendance-source">{fila.rol ? `${fila.rol} · ` : ""}{fila.fuente === "REPORTS" ? "Identidad: Reports API" : "Sesiones: Google Meet"}</span>
              </div>
            </td>
            <td>{fechaHoraUY(fila.primeraConexion)}</td>
            <td>{fechaHoraUY(fila.ultimaDesconexion)}</td>
            <td className="attendance-number">{fila.minutos.toLocaleString("es-UY")}</td>
            {incluirPorcentaje ? (
              <td className="attendance-percent">
                <strong>{fila.porcentaje.toLocaleString("es-UY", { maximumFractionDigits: 2 })} %</strong>
                <span className="attendance-meter" aria-hidden="true"><span style={{ width: `${fila.porcentaje}%` }} /></span>
              </td>
            ) : null}
            {incluirPorcentaje ? <td><span className={`attendance-outcome ${fila.cumple ? "is-ok" : "is-under"}`}>{fila.cumple ? "CUMPLE" : "MENOS DE 5/6"}</span></td> : null}
            <td className="attendance-number">{fila.conexiones}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

export default async function EncuentroAsistenciaPage({
  params
}: Readonly<{ params: Promise<{ solicitudId: string; instanciaId: string }> }>) {
  const session = await auth();
  if (!session?.user) redirect("/acceso");
  const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
  if (!actor?.activo) redirect("/acceso");

  const { solicitudId, instanciaId } = await params;
  const encuentro = await db.instanciaSala.findUnique({
    where: { id: instanciaId },
    select: {
      id: true, estado: true, inicioProgramadoAt: true, finProgramadoAt: true,
      solicitud: { select: { id: true, titulo: true, docentePrograma: { select: { programaId: true } } } },
      eventosProveedor: {
        where: { proveedor: { tipo: "GOOGLE_MEET" } }, take: 1,
        select: {
          codigoReunion: true,
          cuentaProveedor: { select: { emailOrganizador: true } },
          archivos: {
            where: { tipo: "LISTA_ASISTENCIA" }, take: 1,
            select: { driveFileId: true, webViewUrl: true, mimeType: true }
          }
        }
      }
    }
  });

  if (!encuentro || encuentro.solicitud.id !== solicitudId) notFound();
  if (!await puedeGestionarPrograma(db, actor, encuentro.solicitud.docentePrograma.programaId)) notFound();

  const evento = encuentro.eventosProveedor[0];
  const archivo = evento?.archivos[0];
  const termino = encuentro.finProgramadoAt.getTime() < Date.now();
  const cancelada = encuentro.estado === "CANCELADA" || encuentro.estado === "NO_REALIZADA";
  const esAdmin = actor.rol === "ADMINISTRACION";
  const planillaUrl = archivo?.webViewUrl ?? (archivo?.driveFileId ? `https://drive.google.com/open?id=${encodeURIComponent(archivo.driveFileId)}` : null);

  let vista: ReturnType<typeof construirVistaAsistencia> | null = null;
  let errorLectura: string | null = null;
  if (archivo?.driveFileId && archivo.mimeType === "application/vnd.google-apps.spreadsheet") {
    try {
      const config = await crearArchivosRepository().obtenerConfiguracionWorkspacePrincipal();
      const subject = evento?.cuentaProveedor?.emailOrganizador?.trim();
      if (!config?.activa || !config.serviceAccountEmail || !config.privateKeyCifrada || !subject) {
        errorLectura = "No están disponibles las credenciales necesarias para leer la planilla.";
      } else {
        const jwt = crearGoogleAuthJwt({
          serviceAccountEmail: config.serviceAccountEmail,
          privateKey: descifrarConfiguracion(config.privateKeyCifrada),
          subject
        }, ["https://www.googleapis.com/auth/spreadsheets"]);
        const datos = await leerPlanillaAsistenciaGoogle(jwt, archivo.driveFileId);
        vista = construirVistaAsistencia(datos, encuentro.inicioProgramadoAt, encuentro.finProgramadoAt);
      }
    } catch {
      errorLectura = "No se pudo leer la planilla desde Google Sheets. Verificá permisos y volvé a intentarlo.";
    }
  } else if (archivo) {
    errorLectura = "El archivo existente no es una planilla Google Sheets. Se puede abrir desde el enlace original.";
  }

  const identificados = vista?.participantes.filter(p => p.correo !== null).length ?? 0;
  const sinCorreo = vista?.participantes.filter(p => p.correo === null).length ?? 0;
  const cumplen = vista?.participantes.filter(p => p.cumple).length ?? 0;
  const vuelta = `/reuniones/${solicitudId}#encuentros`;

  return (
    <main className="attendance-view">
      <Link className="meeting-detail-back" href={vuelta}><ArrowLeft size={16} aria-hidden="true" />Volver a encuentros</Link>
      <header className="attendance-view-header">
        <div>
          <p className="page-eyebrow">Google Meet + Workspace Reports</p>
          <h1>Asistencia del encuentro</h1>
          <p className="attendance-view-subtitle">{encuentro.solicitud.titulo}</p>
          <p className="attendance-view-date"><Clock3 size={16} aria-hidden="true" />{fechaUY(encuentro.inicioProgramadoAt)} · {horaUY(encuentro.inicioProgramadoAt)}–{horaUY(encuentro.finProgramadoAt)} (Uruguay)</p>
          {evento?.codigoReunion ? <small className="attendance-meet-code">Código Meet: {evento.codigoReunion}</small> : null}
        </div>
        <div className="attendance-view-actions">
          {planillaUrl ? <a className="secondary-action" href={planillaUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} />Abrir planilla</a> : null}
          {esAdmin && termino && !cancelada && evento?.codigoReunion ? <AttendanceRegenerateAction instanciaId={instanciaId} /> : null}
        </div>
      </header>

      {!termino ? (
        <section className="attendance-state" role="status">
          <h2>Encuentro pendiente o en curso</h2>
          <p>La asistencia definitiva se obtiene después de finalizar la conferencia y de que Google publique los registros. La información aún no es concluyente.</p>
        </section>
      ) : cancelada ? (
        <section className="attendance-state"><h2>Encuentro no realizado</h2><p>No se calcula asistencia para reuniones canceladas o no realizadas.</p></section>
      ) : !archivo ? (
        <section className="attendance-state">
          <h2>La planilla todavía no está disponible</h2>
          <p>Puede estar pendiente la sincronización de Meet y Reports. {esAdmin ? "Usá «Actualizar asistencia» para recuperarla." : "Solicitá a Administración que sincronice la asistencia."}</p>
        </section>
      ) : errorLectura ? (
        <section className="attendance-state" role="alert"><h2>Asistencia no disponible</h2><p>{errorLectura}</p></section>
      ) : vista ? (
        <>
          <div className="attendance-summary" aria-label="Resumen de registros">
            <article><UsersRound size={19} aria-hidden="true" /><span>Con correo verificado</span><strong>{identificados}</strong><small>Identidad informada por Reports</small></article>
            <article><UsersRound size={19} aria-hidden="true" /><span>Sin correo verificado</span><strong>{sinCorreo}</strong><small>Participantes de la hoja principal</small></article>
            <article><ShieldCheck size={19} aria-hidden="true" /><span>Cumplen 5/6</span><strong>{cumplen}</strong><small>Entre las filas de asistencia</small></article>
            <article><Clock3 size={19} aria-hidden="true" /><span>Registros de origen</span><strong>{vista.eventosReports + vista.eventosMeet}</strong><small>{vista.eventosReports} Reports · {vista.eventosMeet} Meet</small></article>
          </div>

          <section className="attendance-data">
            <h2>Participantes y cumplimiento</h2>
            <p>Asistencia calculada dentro del horario programado. El umbral de 5/6 equivale a 83,33 % del encuentro. La identidad se considera verificada solo cuando Reports informa el correo.</p>
            <ListaAsistencia filas={vista.participantes} />
          </section>

          <section className="attendance-data">
            <h2>Organizador y cohosts</h2>
            <p>Se presentan separados del conjunto de participantes para no alterar el conteo académico.</p>
            <ListaAsistencia filas={vista.responsables} incluirPorcentaje={false} />
          </section>

          <details className="attendance-data attendance-raw-details">
            <summary>Registros adicionales de Meet ({vista.registrosMeet.length})</summary>
            <p>Las sesiones de Meet y las identidades de Reports no siempre tienen un identificador común. Estos registros se muestran aparte para contraste: pueden corresponder a personas ya incluidas arriba y no se suman como participantes nuevos. Nunca se emparejan por nombre.</p>
            <ListaAsistencia filas={vista.registrosMeet} />
          </details>
          <p className="attendance-source-note">Fuente: última planilla sincronizada desde Google Meet y Workspace Reports. Un correo ausente o una lista vacía no acredita inasistencia. La información puede actualizarse con retraso.</p>
        </>
      ) : null}
    </main>
  );
}
