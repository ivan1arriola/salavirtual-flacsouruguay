import { db } from "@/src/lib/db";
import {
  esPerfilGoogleInstitucional,
  evaluarAccesoGoogle,
  resolverVinculacionSubjectGoogle,
  type CuentaGoogleVinculada,
  type PerfilGoogle
} from "@/src/modules/usuarios/google-login.domain";

export async function resolverUsuarioGoogle(perfil: PerfilGoogle) {
  if (!esPerfilGoogleInstitucional(perfil)) return null;
  const email = perfil.email.trim().toLowerCase();
  const now = new Date();

  const cuenta = await db.$transaction(async (tx) => {
    const existingAccount = await tx.cuentaGoogleFlacso.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      include: { user: true }
    });
    if (existingAccount) {
      const subjectOwner = await tx.cuentaGoogleFlacso.findUnique({
        where: { providerAccountId: perfil.subject },
        select: { id: true }
      });
      const decision = resolverVinculacionSubjectGoogle(
        existingAccount.providerAccountId,
        perfil.subject,
        Boolean(subjectOwner && subjectOwner.id !== existingAccount.id)
      );
      if (decision === "RECHAZAR") {
        console.warn("Login Google rechazado: el identificador del proveedor pertenece a otra cuenta");
        return null;
      }
      if (decision === "REVINCULAR") {
        if (!existingAccount.user.activo || existingAccount.user.fusionadoEnId) return null;
        const updated = await tx.cuentaGoogleFlacso.update({
          where: { id: existingAccount.id },
          data: {
            providerAccountId: perfil.subject,
            emailVerificadoAt: now
          },
          include: { user: true }
        });
        await tx.auditoria.create({
          data: {
            actorUsuarioId: existingAccount.user.id,
            accion: "CUENTA_GOOGLE_REVALIDADA",
            entidadTipo: "CuentaGoogleFlacso",
            entidadId: existingAccount.id,
            valorAnterior: { providerAccountId: existingAccount.providerAccountId },
            valorNuevo: { providerAccountId: perfil.subject }
          }
        });
        return updated;
      }
      return existingAccount;
    }

    const existingUser = await tx.usuario.findFirst({
      where: { emailPrincipal: { equals: email, mode: "insensitive" } },
      include: { docente: { select: { id: true } } }
    });
    if (existingUser && (!existingUser.activo || existingUser.fusionadoEnId)) return null;

    const user = existingUser ?? await tx.usuario.create({
      data: {
        id: await idDisponible(tx, perfil),
        nombres: nombresGoogle(perfil, email),
        apellidos: apellidosGoogle(perfil),
        emailPrincipal: email,
        emailVerificadoAt: now,
        rol: "DOCENTE",
        activo: true,
        docente: { create: {} }
      },
      include: { docente: { select: { id: true } } }
    });
    if (user.rol === "DOCENTE" && !user.docente) {
      await tx.docente.create({ data: { usuarioId: user.id } });
    }
    const createdAccount = await tx.cuentaGoogleFlacso.create({
      data: {
        userId: user.id,
        email,
        dominio: "flacso.edu.uy",
        providerAccountId: perfil.subject,
        emailVerificadoAt: now,
        ultimoAccesoAt: now
      },
      include: { user: true }
    });
    await tx.auditoria.create({
      data: {
        actorUsuarioId: user.id,
        accion: existingUser ? "CUENTA_GOOGLE_AUTOVINCULADA" : "USUARIO_GOOGLE_AUTOREGISTRADO",
        entidadTipo: "Usuario",
        entidadId: user.id,
        valorNuevo: { email, proveedor: "google" }
      }
    });
    return createdAccount;
  });
  if (!cuenta) return null;

  const usuario = cuentaVinculada(cuenta);
  const autenticado = evaluarAccesoGoogle(perfil, usuario);
  if (!autenticado) return null;
  await db.cuentaGoogleFlacso.update({
    where: { id: cuenta.id },
    data: {
      providerAccountId: perfil.subject,
      emailVerificadoAt: cuenta.emailVerificadoAt ?? now,
      ultimoAccesoAt: now
    }
  });
  await db.usuario.update({
    where: { id: autenticado.id },
    data: { ultimoAccesoAt: now, ultimoProveedor: "google" }
  });
  return autenticado;
}

type GoogleAccountWithUser = Readonly<{
  id: string;
  providerAccountId: string | null;
  email: string;
  emailVerificadoAt: Date | null;
  user: {
    id: string;
    rol: "ADMINISTRACION" | "ASISTENTE" | "DOCENTE";
    debeCambiarPassword: boolean;
    activo: boolean;
    fusionadoEnId: string | null;
    emailPrincipal: string | null;
    nombres: string;
    apellidos: string | null;
  };
}>;

function cuentaVinculada(cuenta: GoogleAccountWithUser): CuentaGoogleVinculada {
  return {
    providerAccountId: cuenta.providerAccountId,
    email: cuenta.email,
    usuario: {
      id: cuenta.user.id,
      rol: cuenta.user.rol,
      debeCambiarPassword: cuenta.user.debeCambiarPassword,
      activo: cuenta.user.activo,
      fusionadoEnId: cuenta.user.fusionadoEnId,
      nombre: [cuenta.user.nombres, cuenta.user.apellidos].filter(Boolean).join(" "),
      email: cuenta.user.emailPrincipal
    }
  };
}

async function idDisponible(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  perfil: PerfilGoogle
): Promise<string> {
  const local = perfil.email.split("@")[0]
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9._-]/gi, "-")
    .slice(0, 50) || `google-${perfil.subject.slice(0, 20)}`;
  const exists = await tx.usuario.findUnique({ where: { id: local }, select: { id: true } });
  return exists ? `${local.slice(0, 28)}-${perfil.subject.slice(-12)}` : local;
}

function nombresGoogle(perfil: PerfilGoogle, email: string): string {
  return perfil.nombres?.trim() || perfil.nombre?.trim().split(/\s+/)[0] || email.split("@")[0];
}

function apellidosGoogle(perfil: PerfilGoogle): string | null {
  if (perfil.apellidos?.trim()) return perfil.apellidos.trim();
  const parts = perfil.nombre?.trim().split(/\s+/) ?? [];
  return parts.length > 1 ? parts.slice(1).join(" ") : null;
}
