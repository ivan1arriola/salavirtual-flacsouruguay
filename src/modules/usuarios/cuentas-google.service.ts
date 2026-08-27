import type { PrismaClient } from "@prisma/client";
import {
  puedeGestionarCuentasGoogle,
  reemplazarCuentasGoogleSchema,
  resolverEmailPrincipal,
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
  const { emails, emailPrincipal: emailPrincipalSolicitado } = reemplazarCuentasGoogleSchema.parse(input);

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
        emailPrincipal: true,
        emailVerificadoAt: true,
        cuentasGoogle: {
          select: { email: true }
        }
      }
    });
    if (!usuario) {
      throw new Error("Usuario no encontrado.");
    }

    const emailPrincipal = resolverEmailPrincipal({
      emailsGoogle: emails,
      emailPrincipalActual: usuario.emailPrincipal,
      emailPrincipalSolicitado
    });

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

    if (emailPrincipal) {
      const [usuarioConMismoEmail, aliasDeOtroUsuario, googleDeOtroUsuario] = await Promise.all([
        tx.usuario.findFirst({
          where: {
            id: { not: usuario.id },
            emailPrincipal: { equals: emailPrincipal, mode: "insensitive" }
          },
          select: { id: true }
        }),
        tx.usuarioEmailAlias.findFirst({
          where: {
            usuarioId: { not: usuario.id },
            email: { equals: emailPrincipal, mode: "insensitive" }
          },
          select: { id: true }
        }),
        tx.cuentaGoogleFlacso.findFirst({
          where: {
            userId: { not: usuario.id },
            email: { equals: emailPrincipal, mode: "insensitive" }
          },
          select: { id: true }
        })
      ]);
      if (usuarioConMismoEmail || aliasDeOtroUsuario || googleDeOtroUsuario) {
        throw new Error(`El correo ${emailPrincipal} ya pertenece a otro usuario.`);
      }
    }

    if (
      !tieneMetodoDeAcceso({
        tienePassword: Boolean(usuario.passwordHash),
        cantidadCuentasGoogle: emails.length
      })
    ) {
      throw new Error("El usuario debe conservar una cuenta Google o una contrasena.");
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
          dominio: dominioEmail(email)
        },
        update: {
          userId: usuario.id
        }
      });
    }

    const emailPrincipalAnterior = usuario.emailPrincipal?.trim().toLowerCase() ?? null;
    const cambioEmailPrincipal = emailPrincipalAnterior !== emailPrincipal;
    const cuentaPrincipalGoogle = emailPrincipal && emails.includes(emailPrincipal)
      ? await tx.cuentaGoogleFlacso.findUnique({
          where: { email: emailPrincipal },
          select: { emailVerificadoAt: true }
        })
      : null;

    await tx.usuario.update({
      where: { id: usuario.id },
      data: {
        debeCambiarPassword: emails.length === 0,
        emailPrincipal,
        emailVerificadoAt: cambioEmailPrincipal
          ? cuentaPrincipalGoogle?.emailVerificadoAt ?? null
          : usuario.emailVerificadoAt
      }
    });
    await tx.auditoria.create({
      data: {
        actorUsuarioId: actorActual.id,
        accion: "CUENTAS_GOOGLE_PERMITIDAS_REEMPLAZADAS",
        entidadTipo: "Usuario",
        entidadId: usuario.id,
        valorAnterior: {
          emails: usuario.cuentasGoogle.map(({ email }) => email),
          emailPrincipal: usuario.emailPrincipal
        },
        valorNuevo: { emails, emailPrincipal }
      }
    });

    return emails;
  });
}

function dominioEmail(email: string): string {
  return email.split("@")[1] ?? "";
}
