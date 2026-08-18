import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { SessionActor } from "@/src/lib/auth/session-actor.adapter";
import { crearSlugAsistenteDisponible } from "../asistencia/asistente-slug.adapter";
import { puedeAdministrar, type RolUsuario } from "./roles";

export async function aprobarSolicitudAccesoGoogle(
  db: PrismaClient,
  actor: SessionActor,
  solicitudId: string,
  rol: RolUsuario
): Promise<string> {
  if (!actor.activo || !puedeAdministrar(actor.rol)) {
    throw new Error("Solo Administración puede aprobar solicitudes de acceso.");
  }

  return db.$transaction(async (tx) => {
    const admin = await tx.usuario.findUnique({
      where: { id: actor.id },
      select: { id: true, rol: true, activo: true }
    });
    if (!admin?.activo || !puedeAdministrar(admin.rol)) {
      throw new Error("La sesión ya no tiene permisos de Administración.");
    }

    const solicitud = await tx.solicitudAccesoGoogle.findUnique({ where: { id: solicitudId } });
    if (!solicitud || solicitud.estado !== "PENDIENTE") {
      throw new Error("La solicitud ya no está pendiente.");
    }
    const existente = await tx.cuentaGoogleFlacso.findFirst({
      where: {
        OR: [
          { email: { equals: solicitud.email, mode: "insensitive" } },
          { providerAccountId: solicitud.providerAccountId }
        ]
      },
      select: { userId: true }
    });
    if (existente) throw new Error("Esta cuenta Google ya está vinculada a un usuario.");

    const usuarioId = await idDisponible(tx, solicitud.email);
    const slug = rol === "ASISTENTE_TECNICO"
      ? await crearSlugAsistenteDisponible(tx, [solicitud.nombres, solicitud.apellidos].filter(Boolean).join(" "), usuarioId)
      : null;
    const usuario = await tx.usuario.create({
      data: {
        id: usuarioId,
        nombres: solicitud.nombres,
        apellidos: solicitud.apellidos,
        emailPrincipal: solicitud.email,
        emailVerificadoAt: new Date(),
        imagenUrl: solicitud.imagenUrl,
        rol,
        activo: true,
        cuentasGoogle: {
          create: {
            email: solicitud.email,
            dominio: dominioEmail(solicitud.email),
            providerAccountId: solicitud.providerAccountId,
            emailVerificadoAt: new Date()
          }
        },
        ...(rol === "DOCENTE" ? { docente: { create: {} } } : {}),
        ...(rol === "ASISTENTE_TECNICO" ? { asistenteTecnico: { create: { slug: slug! } } } : {})
      },
      select: { id: true }
    });
    await tx.solicitudAccesoGoogle.update({
      where: { id: solicitud.id },
      data: { estado: "APROBADA", aprobadaPorUsuarioId: admin.id, aprobadaAt: new Date() }
    });
    await tx.auditoria.create({
      data: {
        actorUsuarioId: admin.id,
        accion: "SOLICITUD_ACCESO_GOOGLE_APROBADA",
        entidadTipo: "Usuario",
        entidadId: usuario.id,
        valorNuevo: { email: solicitud.email, rol, solicitudId: solicitud.id }
      }
    });
    return usuario.id;
  });
}

export async function rechazarSolicitudAccesoGoogle(
  db: PrismaClient,
  actor: SessionActor,
  solicitudId: string
): Promise<void> {
  if (!actor.activo || !puedeAdministrar(actor.rol)) {
    throw new Error("Solo Administración puede rechazar solicitudes de acceso.");
  }

  await db.$transaction(async (tx) => {
    const admin = await tx.usuario.findUnique({
      where: { id: actor.id },
      select: { id: true, rol: true, activo: true }
    });
    if (!admin?.activo || !puedeAdministrar(admin.rol)) {
      throw new Error("La sesión ya no tiene permisos de Administración.");
    }

    const solicitud = await tx.solicitudAccesoGoogle.findUnique({
      where: { id: solicitudId },
      select: { id: true, email: true, providerAccountId: true, estado: true }
    });
    if (!solicitud || solicitud.estado !== "PENDIENTE") {
      throw new Error("La solicitud ya no está pendiente.");
    }

    const eliminada = await tx.solicitudAccesoGoogle.deleteMany({
      where: { id: solicitud.id, estado: "PENDIENTE" }
    });
    if (eliminada.count !== 1) {
      throw new Error("La solicitud ya no está pendiente.");
    }

    await tx.auditoria.create({
      data: {
        actorUsuarioId: admin.id,
        accion: "SOLICITUD_ACCESO_GOOGLE_RECHAZADA",
        entidadTipo: "SolicitudAccesoGoogle",
        entidadId: solicitud.id,
        valorAnterior: {
          email: solicitud.email,
          providerAccountId: solicitud.providerAccountId,
          estado: solicitud.estado
        },
        valorNuevo: { eliminada: true }
      }
    });
  });
}

async function idDisponible(tx: Prisma.TransactionClient, email: string): Promise<string> {
  const base = email.split("@")[0]
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9._-]/gi, "-")
    .slice(0, 50) || "google";
  const existe = await tx.usuario.findUnique({ where: { id: base }, select: { id: true } });
  return existe ? `${base.slice(0, 40)}-${randomUUID().slice(0, 8)}` : base;
}

function dominioEmail(email: string): string {
  return email.split("@")[1] ?? "";
}
