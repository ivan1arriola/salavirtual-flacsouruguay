import type { Prisma, PrismaClient } from "@prisma/client";
import { enviarCorreoConfigurado } from "../configuracion/correo.service";
import { destinatariosDocentesPrograma } from "../reuniones/permisos-programa.service";
import {
  PREFERENCIA_PREDETERMINADA,
  type PreferenciaCanales,
  type TipoNotificacion
} from "./notificaciones.domain";
import { construirCorreoNotificacion } from "./notificacion-email.domain";

type Db = PrismaClient | Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

export type NotificationMessage = Readonly<{
  tipo: TipoNotificacion;
  titulo: string;
  cuerpo: string;
  href?: string;
  metadata?: Prisma.InputJsonValue;
  emailSubject?: string;
  emailText?: string;
  emailHtml?: string;
  emailActionLabel?: string;
}>;

export type NotificationRecipient = Readonly<{
  usuarioId: string;
  email?: string | null;
}>;

export async function preferenciasDeUsuario(
  db: Db,
  usuarioId: string,
  tipo: TipoNotificacion
): Promise<PreferenciaCanales> {
  const preference = await db.preferenciaNotificacion.findUnique({
    where: { usuarioId_tipo: { usuarioId, tipo } },
    select: { push: true, email: true }
  });
  return preference ?? PREFERENCIA_PREDETERMINADA;
}

export async function notificarUsuario(
  db: Db,
  recipient: NotificationRecipient,
  message: NotificationMessage
): Promise<void> {
  const asistenteCesado = await db.asistenteTecnico.findFirst({
    where: {
      usuarioId: recipient.usuarioId,
      cesadoHastaProximoInicioSesion: true,
      usuario: { rol: "ASISTENTE_TECNICO" }
    },
    select: { id: true }
  });
  if (asistenteCesado) return;

  const preference = await preferenciasDeUsuario(db, recipient.usuarioId, message.tipo);
  if (preference.push) {
    await db.notificacion.create({
      data: {
        usuarioId: recipient.usuarioId,
        tipo: message.tipo,
        titulo: message.titulo,
        cuerpo: message.cuerpo,
        href: message.href,
        metadata: message.metadata
      }
    });
  }
  if (preference.email && recipient.email) {
    try {
      const email = construirCorreoNotificacion(
        message,
        process.env.APP_BASE_URL ?? "https://salavirtual.flacso.edu.uy"
      );
      const result = await enviarCorreoConfigurado(db, {
        to: [recipient.email],
        ...email
      });
      if (!result.sent) {
        console.warn("No se envió la notificación por correo", result.skipped ?? "motivo-desconocido");
      }
    } catch (error) {
      console.warn("No se pudo enviar notificacion por correo", error);
    }
  }
}

export async function notificarUsuarios(
  db: Db,
  recipients: readonly NotificationRecipient[],
  message: NotificationMessage
): Promise<void> {
  const programRecipients = await destinatariosProgramaParaNotificacion(db, message);
  const uniqueRecipients = Array.from(
    new Map(
      [...recipients, ...programRecipients].map((recipient) => [recipient.usuarioId, recipient])
    ).values()
  );
  await Promise.all(uniqueRecipients.map((recipient) => notificarUsuario(db, recipient, message)));
}

export async function notificarAdministracion(
  db: Db,
  message: NotificationMessage
): Promise<void> {
  const admins = await db.usuario.findMany({
    where: { rol: "ADMINISTRACION", activo: true },
    select: { id: true, emailPrincipal: true }
  });
  const recipients = admins.map((admin) => ({
    usuarioId: admin.id,
    email: admin.emailPrincipal
  }));
  await notificarUsuarios(db, recipients, message);
}

async function destinatariosProgramaParaNotificacion(
  db: Db,
  message: NotificationMessage
): Promise<readonly NotificationRecipient[]> {
  if (
    message.tipo !== "REUNION_CREADA" &&
    message.tipo !== "ASISTENCIA_ASIGNACION"
  ) return [];

  const solicitudId = message.href?.match(/^\/reuniones\/([^/?#]+)/)?.[1];
  if (!solicitudId) return [];

  const request = await db.solicitudSala.findUnique({
    where: { id: solicitudId },
    select: { docentePrograma: { select: { programaId: true } } }
  });
  if (!request) return [];
  return destinatariosDocentesPrograma(db, request.docentePrograma.programaId);
}

export type ReunionEmailInput = Readonly<{
  titulo: string;
  programa?: string | null;
  docente?: string | null;
  modalidad?: string | null;
  requiereAsistenciaTecnica?: boolean;
  requiereGrabacion?: boolean;
  anfitrionDesignado?: string | null;
  asistenteTecnico?: string | null;
  instancias: readonly Readonly<{
    inicio: string;
    fin: string;
    sala?: string | null;
    password?: string | null;
    meet?: string | null;
    joinUrl?: string | null;
  }>[];
}>;

export function reunionEmailText(input: ReunionEmailInput): string {
  const lines = [
    "DATOS DE LA REUNIÓN",
    `Reunión: ${input.titulo}`,
    input.programa ? `Programa: ${input.programa}` : null,
    input.docente ? `Docente/responsable: ${input.docente}` : null,
    input.modalidad ? `Modalidad: ${input.modalidad}` : null,
    `Asistencia técnica: ${input.requiereAsistenciaTecnica ? "requerida" : "no requerida"}`,
    `Grabación: ${input.requiereGrabacion ? "requerida" : "no requerida"}`,
    input.anfitrionDesignado ? `Anfitrión designado: ${input.anfitrionDesignado}` : null,
    input.asistenteTecnico ? `Asistente técnico: ${input.asistenteTecnico}` : null,
    "",
    input.instancias.length === 1 ? "ENCUENTRO" : "ENCUENTROS"
  ].filter((line): line is string => line !== null);

  input.instancias.forEach((item, index) => {
    lines.push(`${index + 1}. ${item.inicio} – ${item.fin}`);
    if (item.sala) lines.push(`   Sala: ${item.sala}`);
    if (item.password) lines.push(`   Contraseña: ${item.password}`);
    if (item.meet) lines.push(`   Código de Meet: ${item.meet}`);
    if (item.joinUrl) lines.push(`   Acceso: ${item.joinUrl}`);
    if (index < input.instancias.length - 1) lines.push("");
  });

  lines.push("");
  lines.push("¿CÓMO ACCEDER A LA REUNIÓN?");
  lines.push("• No es necesario iniciar sesión con la cuenta de la sala ni usar su contraseña.");
  lines.push(
    "• Anfitriones y docentes: ingresen al enlace de Google Meet directamente con su cuenta de Google asignada. Google Meet les otorgará automáticamente permisos de co-anfitrión (co-host) para iniciar la sesión, admitir participantes y gestionar la grabación."
  );
  lines.push(
    "• Participantes y estudiantes: ingresan directamente a través del enlace de Google Meet provisto."
  );
  if (input.requiereAsistenciaTecnica) {
    if (input.asistenteTecnico) {
      lines.push(
        `• Asistencia técnica: asignada a ${input.asistenteTecnico}. El/la asistente técnico/a ingresará como anfitrión/co-anfitrión para brindar soporte y moderar la sesión.`
      );
    } else {
      lines.push(
        "• Asistencia técnica: la reunión requiere asistencia técnica (pendiente de asignación). Quien sea designado/a como asistente técnico/a ingresará como anfitrión/co-anfitrión de la sesión."
      );
    }
  } else {
    lines.push(
      "• Asistencia técnica: no requerida. Quien solicitó la reunión y el/la docente o anfitrión designado cuentan con permisos de anfitrión en Google Meet."
    );
  }

  return lines.join("\n");
}