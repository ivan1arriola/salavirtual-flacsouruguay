import { mobileSessionIdentifier } from "@/src/lib/auth/mobile-token";
import { randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { authConfig } from "@/src/lib/auth/config";
import { enviarCorreoConfigurado } from "@/src/modules/configuracion/correo.service";
import {
  hashTokenRecuperacion,
  identifierRecuperacionPassword,
  RECUPERACION_PASSWORD_IDENTIFIER_PREFIX,
  RECUPERACION_PASSWORD_REENVIO_MS,
  RECUPERACION_PASSWORD_TTL_MS,
  restablecerPasswordSchema,
  solicitudRecuperacionPasswordSchema,
  tokenRecuperacionVigente,
  usuarioIdDesdeIdentifierRecuperacion
} from "./recuperacion-password.domain";

export async function solicitarRecuperacionPassword(
  db: PrismaClient,
  rawInput: unknown,
  ahora = new Date()
): Promise<void> {
  const input = solicitudRecuperacionPasswordSchema.parse(rawInput);
  const usuario = await db.usuario.findFirst({
    where: {
      activo: true,
      fusionadoEnId: null,
      OR: [
        { emailPrincipal: { equals: input.email, mode: "insensitive" } },
        { emailAliases: { some: { email: { equals: input.email, mode: "insensitive" } } } },
        { cuentasGoogle: { some: { email: { equals: input.email, mode: "insensitive" } } } }
      ]
    },
    select: { id: true, nombres: true, emailPrincipal: true }
  });

  // La respuesta pública siempre es la misma, exista o no la cuenta.
  if (!usuario) return;

  const identifier = identifierRecuperacionPassword(usuario.id);
  const limiteReenvio = new Date(
    ahora.getTime() + RECUPERACION_PASSWORD_TTL_MS - RECUPERACION_PASSWORD_REENVIO_MS
  );
  const solicitudReciente = await db.tokenVerificacion.findFirst({
    where: { identifier, expires: { gt: limiteReenvio } },
    select: { identifier: true }
  });
  if (solicitudReciente) return;

  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashTokenRecuperacion(token);
  const expires = new Date(ahora.getTime() + RECUPERACION_PASSWORD_TTL_MS);

  await db.$transaction(async (tx) => {
    await tx.tokenVerificacion.deleteMany({ where: { identifier } });
    await tx.tokenVerificacion.create({
      data: { identifier, token: tokenHash, expires }
    });
  });

  const destino = usuario.emailPrincipal?.trim().toLowerCase() || input.email;
  const url = new URL("/restablecer-contrasena", authConfig.baseUrl);
  url.searchParams.set("token", token);

  try {
    const resultado = await enviarCorreoConfigurado(db, {
      to: [destino],
      subject: "Restablecer contraseña · Sala Virtual FLACSO",
      text: [
        `Hola ${usuario.nombres},`,
        "",
        "Recibimos una solicitud para restablecer tu contraseña de Sala Virtual FLACSO.",
        "",
        `Abrí este enlace para elegir una nueva contraseña: ${url.toString()}`,
        "",
        "El enlace vence en 30 minutos y solo puede utilizarse una vez.",
        "Si no solicitaste este cambio, podés ignorar este correo."
      ].join("\n")
    });

    if (!resultado.sent) {
      await db.tokenVerificacion.deleteMany({ where: { identifier, token: tokenHash } });
    }
  } catch (error) {
    await db.tokenVerificacion.deleteMany({ where: { identifier, token: tokenHash } }).catch(() => undefined);
    console.warn("No se pudo enviar el correo de recuperación de contraseña", error);
  }
}

export async function restablecerPassword(
  db: PrismaClient,
  rawInput: unknown,
  ahora = new Date()
): Promise<void> {
  const input = restablecerPasswordSchema.parse(rawInput);
  const tokenHash = hashTokenRecuperacion(input.token);
  const recuperacion = await db.tokenVerificacion.findFirst({
    where: {
      token: tokenHash,
      identifier: { startsWith: RECUPERACION_PASSWORD_IDENTIFIER_PREFIX }
    },
    select: { identifier: true, token: true, expires: true }
  });
  const usuarioId = recuperacion
    ? usuarioIdDesdeIdentifierRecuperacion(recuperacion.identifier)
    : null;

  if (!recuperacion || !usuarioId || !tokenRecuperacionVigente(recuperacion, ahora)) {
    throw new Error("El enlace de recuperación no es válido o ya venció.");
  }

  const passwordHash = await hash(input.passwordNueva, 12);
  await db.$transaction(async (tx) => {
    const consumido = await tx.tokenVerificacion.deleteMany({
      where: {
        identifier: recuperacion.identifier,
        token: recuperacion.token,
        expires: { gt: ahora }
      }
    });
    if (consumido.count !== 1) {
      throw new Error("El enlace de recuperación no es válido o ya venció.");
    }

    const actualizado = await tx.usuario.updateMany({
      where: { id: usuarioId, activo: true, fusionadoEnId: null },
      data: {
        passwordHash,
        passwordInicialCifrada: null,
        debeCambiarPassword: false
      }
    });
    if (actualizado.count !== 1) {
      throw new Error("La cuenta ya no está disponible.");
    }

    await tx.tokenVerificacion.deleteMany({ where: { identifier: recuperacion.identifier } });
    await tx.tokenVerificacion.deleteMany({ where: { identifier: mobileSessionIdentifier(usuarioId) } });
    await tx.auditoria.create({
      data: {
        actorUsuarioId: null,
        accion: "PASSWORD_RECUPERADA",
        entidadTipo: "Usuario",
        entidadId: usuarioId,
        valorNuevo: { metodo: "TOKEN_EMAIL" }
      }
    });
  });
}
