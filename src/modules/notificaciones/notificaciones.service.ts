import type { Prisma, PrismaClient } from "@prisma/client";
import { sendMail } from "@/src/lib/email.client";
import {
  PREFERENCIA_PREDETERMINADA,
  type PreferenciaCanales,
  type TipoNotificacion
} from "./notificaciones.domain";

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
      await sendMail({
        to: [recipient.email],
        subject: message.emailSubject ?? message.titulo,
        text: message.emailText ?? message.cuerpo,
        html: message.emailHtml
      });
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
  requiereAsistencia?: boolean;
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
    `Reunion: ${input.titulo}`,
    input.programa ? `Programa: ${input.programa}` : null,
    input.docente ? `Docente/responsable: ${input.docente}` : null,
    input.modalidad ? `Modalidad: ${input.modalidad}` : null,
    `Asistencia requerida: ${input.requiereAsistencia ? "si" : "no"}`,
    `Grabacion requerida: ${input.requiereGrabacion ? "si" : "no"}`,
    "",
    "Instancias:"
  ].filter((line): line is string => line !== null);
  for (const item of input.instancias) {
    lines.push(`- ${item.inicio} a ${item.fin}`);
    if (item.sala) lines.push(`  Sala: ${item.sala}`);
    if (item.meet) lines.push(`  Meet: ${item.meet}`);
    if (item.joinUrl) lines.push(`  Acceso: ${item.joinUrl}`);
  }
  return lines.join("\n");
}
