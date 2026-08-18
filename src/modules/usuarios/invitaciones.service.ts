import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { authConfig } from "@/src/lib/auth/config";
import type { SessionActor } from "@/src/lib/auth/session-actor.adapter";
import { enviarCorreoConfigurado } from "@/src/modules/configuracion/correo.service";
import { invitarUsuarioSchema, puedeInvitarUsuarios } from "./invitaciones.domain";
import { crearSlugAsistenteDisponible } from "../asistencia/asistente-slug.adapter";

export async function invitarUsuario(
  db: PrismaClient,
  actor: SessionActor,
  rawInput: unknown
): Promise<Readonly<{ usuarioId: string; correoEnviado: boolean }>> {
  if (!puedeInvitarUsuarios(actor)) throw new Error("Solo Administración puede invitar usuarios.");
  const input = invitarUsuarioSchema.parse(rawInput);
  const user = await db.$transaction(async (tx) => {
    const admin = await tx.usuario.findUnique({
      where: { id: actor.id },
      select: { id: true, rol: true, activo: true }
    });
    if (!admin || !puedeInvitarUsuarios(admin)) {
      throw new Error("La sesión ya no tiene permisos de Administración.");
    }
    const duplicate = await tx.usuario.findFirst({
      where: {
        OR: [
          { emailPrincipal: { equals: input.email, mode: "insensitive" } },
          { cuentasGoogle: { some: { email: { equals: input.email, mode: "insensitive" } } } }
        ]
      },
      select: { id: true }
    });
    if (duplicate) throw new Error("Ya existe un usuario asociado a ese correo.");

    const programa = input.rol === "DOCENTE"
      ? await resolverProgramaInvitacion(tx, input.programaId, input.programaNuevo)
      : null;
    const usuarioId = await idInvitadoDisponible(tx, input.email);
    const assistantSlug = input.rol === "ASISTENTE_TECNICO"
      ? await crearSlugAsistenteDisponible(
          tx,
          [input.nombres, input.apellidos].filter(Boolean).join(" "),
          usuarioId
        )
      : null;
    const created = await tx.usuario.create({
      data: {
        id: usuarioId,
        nombres: input.nombres,
        apellidos: input.apellidos,
        emailPrincipal: input.email,
        rol: input.rol,
        activo: true,
        cuentasGoogle: {
          create: { email: input.email, dominio: dominioEmail(input.email) }
        },
        ...(input.rol === "DOCENTE"
          ? {
              docente: {
                create: {
                  programas: { create: { programaId: programa!.id, activo: true } }
                }
              }
            }
          : input.rol === "ASISTENTE_TECNICO" ? { asistenteTecnico: { create: { slug: assistantSlug! } } } : {})
      },
      select: { id: true }
    });
    await tx.auditoria.create({
      data: {
        actorUsuarioId: admin.id,
        accion: "USUARIO_INVITADO",
        entidadTipo: "Usuario",
        entidadId: created.id,
        valorNuevo: { email: input.email, rol: input.rol, programaId: programa?.id }
      }
    });
    return created;
  });

  try {
    const mail = await enviarCorreoConfigurado(db, {
      to: [input.email],
      subject: "Invitación a Sala Virtual FLACSO",
      text: [
        `Hola ${input.nombres},`,
        "",
        "Administración te invitó a Sala Virtual FLACSO.",
        "Ingresá usando la cuenta de Google asociada a este correo:",
        `${authConfig.baseUrl.replace(/\/$/, "")}/acceso`,
        "",
        "No necesitás crear una contraseña."
      ].join("\n")
    });
    return { usuarioId: user.id, correoEnviado: mail.sent };
  } catch (error) {
    console.warn("El usuario fue invitado, pero no se pudo enviar el correo", error);
    return { usuarioId: user.id, correoEnviado: false };
  }
}

async function resolverProgramaInvitacion(
  tx: Prisma.TransactionClient,
  programaId: string | null,
  programaNuevo: string | null
) {
  if (programaId) {
    const existing = await tx.programa.findFirst({
      where: { id: programaId, activo: true },
      select: { id: true, nombre: true }
    });
    if (!existing) throw new Error("El programa seleccionado no existe o está inactivo.");
    return existing;
  }
  const duplicate = await tx.programa.findFirst({
    where: { nombre: { equals: programaNuevo!, mode: "insensitive" } },
    select: { id: true, nombre: true, activo: true }
  });
  if (duplicate && !duplicate.activo) throw new Error("Ya existe un programa inactivo con ese nombre.");
  return duplicate ?? tx.programa.create({
    data: { nombre: programaNuevo!, activo: true },
    select: { id: true, nombre: true }
  });
}

async function idInvitadoDisponible(tx: Prisma.TransactionClient, email: string): Promise<string> {
  const local = email.split("@")[0].slice(0, 50);
  const exists = await tx.usuario.findUnique({ where: { id: local }, select: { id: true } });
  return exists ? `${local.slice(0, 40)}-${randomUUID().slice(0, 8)}` : local;
}

function dominioEmail(email: string): string {
  return email.split("@")[1] ?? "";
}
