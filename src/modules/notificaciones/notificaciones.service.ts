import type { Prisma, PrismaClient } from "@prisma/client";
import { enviarCorreoConfigurado } from "../configuracion/correo.service";
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
        process.env.APP_BASE_URL ?? "https://salas-meet.flacso.edu.uy"
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
  const uniqueRecipients = Array.from(
    new Map(recipients.map((recipient) => [recipient.usuarioId, recipient])).values()
  );
  await Promise.all(uniqueRecipients.map((recipient) => notificarUsuario(db, recipient, message)));
}

export function reunionEmailText(input: Readonly<{
  titulo: string;
  programa?: string | null;
  docente?: string | null;
  modalidad?: string | null;
  requiereAsistenciaTecnica?: boolean;
  requiereGrabacion?: boolean;
  instancias: readonly Readonly<{
    inicio: string;
    fin: string;
    sala?: string | null;
    meet?: string | null;
    joinUrl?: string | null;
  }>[];
}>): string {
  const lines = [
    `Reunión: ${input.titulo}`,
    input.programa ? `Programa: ${input.programa}` : null,
    input.docente ? `Docente/responsable: ${input.docente}` : null,
    input.modalidad ? `Modalidad: ${input.modalidad}` : null,
    `Asistencia técnica requerida: ${input.requiereAsistenciaTecnica ? "sí" : "no"}`,
    `Grabación requerida: ${input.requiereGrabacion ? "sí" : "no"}`,
    "",
    "Encuentros:"
  ].filter((line): line is string => line !== null);
  for (const item of input.instancias) {
    lines.push(`- ${item.inicio} a ${item.fin}`);
    if (item.sala) lines.push(`  Sala: ${item.sala}`);
    if (item.meet) lines.push(`  Meet: ${item.meet}`);
    if (item.joinUrl) lines.push(`  Acceso: ${item.joinUrl}`);
  }
  return lines.join("\n");
}
