import type { PrismaClient } from "@prisma/client";
import {
  puedeGestionarCuentasGoogle,
  reemplazarCuentasGoogleSchema,
  tieneMetodoDeAcceso,
  type ActorGestionUsuarios
} from "./cuentas-google.domain";

export type DependenciasCuentasGoogle = Readonly<{
  db: PrismaClient;
}>;

export async function reemplazarCuentasGooglePermitidas(
  dependencias: DependenciasCuentasGoogle,
  actor: ActorGestionUsuarios,
  usuarioId: string,
  input: unknown
): Promise<readonly string[]> {
  if (!puedeGestionarCuentasGoogle(actor)) {
    throw new Error("Solo Administracion puede gestionar cuentas Google.");
  }
  const { emails } = reemplazarCuentasGoogleSchema.parse(input);

  return dependencias.db.$transaction(async (tx) => {
    const actorActual = await tx.usuario.findUnique({
      where: { id: actor.id },
      select: { id: true, rol: true, activo: true }
    });
    if (!actorActual) {
      throw new Error("La sesión no corresponde a un usuario vigente. Volvé a iniciar sesión.");
    }
    if (!puedeGestionarCuentasGoogle(actorActual)) {
      throw new Error("Solo Administracion puede gestionar cuentas Google.");
    }

    const usuario = await tx.usuario.findUnique({
      where: { id: usuarioId },
      select: {
        id: true,
        passwordHash: true,
        cuentasGoogle: {
          select: { email: true }
        }
      }
    });
    if (!usuario) {
      throw new Error("Usuario no encontrado.");
    }
    const cuentaDeOtroUsuario = await tx.cuentaGoogleFlacso.findFirst({
      where: {
        email: { in: emails },
        userId: { not: usuario.id }
      },
      select: { email: true }
    });
    if (cuentaDeOtroUsuario) {
      throw new Error(`La cuenta ${cuentaDeOtroUsuario.email} ya pertenece a otro usuario.`);
    }
    if (
      !tieneMetodoDeAcceso({
        tienePassword: Boolean(usuario.passwordHash),
        cantidadCuentasGoogle: emails.length
      })
    ) {
      throw new Error("El usuario debe conservar una cuenta FLACSO o una contrasena.");
    }

    await tx.cuentaGoogleFlacso.deleteMany({
      where: {
        userId: usuario.id,
        email: { notIn: emails }
      }
    });
    for (const email of emails) {
      await tx.cuentaGoogleFlacso.upsert({
        where: { email },
        create: {
          userId: usuario.id,
          email,
          dominio: "flacso.edu.uy"
        },
        update: {
          userId: usuario.id
        }
      });
    }

    await tx.usuario.update({
      where: { id: usuario.id },
      data: {
        debeCambiarPassword: emails.length === 0
      }
    });
    await tx.auditoria.create({
      data: {
        actorUsuarioId: actorActual.id,
        accion: "CUENTAS_GOOGLE_PERMITIDAS_REEMPLAZADAS",
        entidadTipo: "Usuario",
        entidadId: usuario.id,
        valorAnterior: {
          emails: usuario.cuentasGoogle.map(({ email }) => email)
        },
        valorNuevo: { emails }
      }
    });

    return emails;
  });
}
