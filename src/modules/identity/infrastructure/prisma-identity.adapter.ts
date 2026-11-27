import type { PrismaClient } from "@prisma/client";
import {
  esPerfilGoogleInstitucional,
  resolverVinculacionSubjectGoogle,
  type CuentaGoogleVinculada,
  type PerfilGoogle,
  type UsuarioCredenciales,
} from "../domain";
import type { IdentityRepository } from "../ports";

const loginSelect = {
  id: true,
  passwordHash: true,
  debeCambiarPassword: true,
  rol: true,
  activo: true,
  fusionadoEnId: true,
  emailPrincipal: true,
  nombres: true,
  apellidos: true,
} as const;

type PrismaIdentityDb = Pick<
  PrismaClient,
  | "usuario"
  | "cuentaGoogleFlacso"
  | "solicitudAccesoGoogle"
  | "docente"
  | "asistenteTecnico"
  | "auditoria"
  | "$transaction"
>;

export function crearPrismaIdentityAdapter(db: PrismaIdentityDb): IdentityRepository {
  return {
    async buscarParaLoginLocal(identificador: string): Promise<UsuarioCredenciales | null> {
      const normalizado = identificador.trim();
      const esEmail = normalizado.includes("@");

      const usuarioPorId = await db.usuario.findUnique({
        where: { id: normalizado },
        select: loginSelect,
      });

      const usuario =
        usuarioPorId ??
        (esEmail
          ? await db.usuario.findFirst({
              where: {
                OR: [
                  { emailPrincipal: { equals: normalizado, mode: "insensitive" } },
                  {
                    emailAliases: { some: { email: { equals: normalizado, mode: "insensitive" } } },
                  },
                  {
                    cuentasGoogle: {
                      some: { email: { equals: normalizado, mode: "insensitive" } },
                    },
                  },
                ],
              },
              select: loginSelect,
            })
          : null);

      if (!usuario) {
        return null;
      }

      const nombre = [usuario.nombres, usuario.apellidos].filter(Boolean).join(" ");

      return {
        id: usuario.id,
        passwordHash: usuario.passwordHash,
        debeCambiarPassword: usuario.debeCambiarPassword,
        rol: usuario.rol,
        activo: usuario.activo,
        fusionadoEnId: usuario.fusionadoEnId,
        nombre: nombre || null,
        email: usuario.emailPrincipal,
      };
    },

    async registrarAcceso(
      usuarioId: string,
      proveedor: "credentials" | "google",
      fecha = new Date(),
    ): Promise<void> {
      await db.$transaction(async (tx: any) => {
        await tx.usuario.update({
          where: { id: usuarioId },
          data: { ultimoAccesoAt: fecha, ultimoProveedor: proveedor },
        });

        const reactivados = await tx.asistenteTecnico.updateMany({
          where: {
            usuarioId,
            cesadoHastaProximoInicioSesion: true,
          },
          data: { cesadoHastaProximoInicioSesion: false },
        });

        if (reactivados.count === 0) {
          return;
        }

        await tx.auditoria.create({
          data: {
            actorUsuarioId: usuarioId,
            accion: "ASISTENTE_TECNICO_REACTIVADO_POR_LOGIN",
            entidadTipo: "Usuario",
            entidadId: usuarioId,
            valorAnterior: { cesadoHastaProximoInicioSesion: true },
            valorNuevo: { cesadoHastaProximoInicioSesion: false, proveedor },
          },
        });
      });
    },

    async resolverOCrearCuentaGoogle(
      perfil: PerfilGoogle,
      fecha = new Date(),
    ): Promise<CuentaGoogleVinculada | null> {
      const email = perfil.email.trim().toLowerCase();

      const cuenta = await db.$transaction(async (tx: any) => {
        const existingAccount = await tx.cuentaGoogleFlacso.findFirst({
          where: { email: { equals: email, mode: "insensitive" } },
          include: { user: true },
        });

        if (existingAccount) {
          const subjectOwner = await tx.cuentaGoogleFlacso.findUnique({
            where: { providerAccountId: perfil.subject },
            select: { id: true },
          });

          const decision = resolverVinculacionSubjectGoogle(
            existingAccount.providerAccountId,
            perfil.subject,
            Boolean(subjectOwner && subjectOwner.id !== existingAccount.id),
          );

          if (decision === "RECHAZAR") {
            console.warn(
              "Login Google rechazado: el identificador del proveedor pertenece a otra cuenta",
            );
            return null;
          }

          if (decision === "REVINCULAR") {
            if (!existingAccount.user.activo || existingAccount.user.fusionadoEnId) {
              return null;
            }

            const updated = await tx.cuentaGoogleFlacso.update({
              where: { id: existingAccount.id },
              data: {
                providerAccountId: perfil.subject,
                emailVerificadoAt: fecha,
              },
              include: { user: true },
            });

            await tx.auditoria.create({
              data: {
                actorUsuarioId: existingAccount.user.id,
                accion: "CUENTA_GOOGLE_REVALIDADA",
                entidadTipo: "CuentaGoogleFlacso",
                entidadId: existingAccount.id,
                valorAnterior: { providerAccountId: existingAccount.providerAccountId },
                valorNuevo: { providerAccountId: perfil.subject },
              },
            });

            return updated;
          }

          return existingAccount;
        }

        if (!esPerfilGoogleInstitucional(perfil)) {
          await tx.solicitudAccesoGoogle.upsert({
            where: { email },
            create: {
              email,
              providerAccountId: perfil.subject,
              nombres: nombresGoogle(perfil, email),
              apellidos: apellidosGoogle(perfil),
              imagenUrl: null,
            },
            update: {
              providerAccountId: perfil.subject,
              nombres: nombresGoogle(perfil, email),
              apellidos: apellidosGoogle(perfil),
              estado: "PENDIENTE",
              aprobadaPorUsuarioId: null,
              aprobadaAt: null,
            },
          });
          return null;
        }

        const existingUser = await tx.usuario.findFirst({
          where: { emailPrincipal: { equals: email, mode: "insensitive" } },
          include: { docente: { select: { id: true } } },
        });

        if (existingUser && (!existingUser.activo || existingUser.fusionadoEnId)) {
          return null;
        }

        const user =
          existingUser ??
          (await tx.usuario.create({
            data: {
              id: await idDisponible(tx, perfil),
              nombres: nombresGoogle(perfil, email),
              apellidos: apellidosGoogle(perfil),
              emailPrincipal: email,
              emailVerificadoAt: fecha,
              rol: "DOCENTE",
              activo: true,
              docente: { create: {} },
            },
            include: { docente: { select: { id: true } } },
          }));

        if (user.rol === "DOCENTE" && !user.docente) {
          await tx.docente.create({ data: { usuarioId: user.id } });
        }

        const createdAccount = await tx.cuentaGoogleFlacso.create({
          data: {
            userId: user.id,
            email,
            dominio: dominioEmail(email),
            providerAccountId: perfil.subject,
            emailVerificadoAt: fecha,
            ultimoAccesoAt: fecha,
          },
          include: { user: true },
        });

        await tx.auditoria.create({
          data: {
            actorUsuarioId: user.id,
            accion: existingUser ? "CUENTA_GOOGLE_AUTOVINCULADA" : "USUARIO_GOOGLE_AUTOREGISTRADO",
            entidadTipo: "Usuario",
            entidadId: user.id,
            valorNuevo: { email, proveedor: "google" },
          },
        });

        return createdAccount;
      });

      if (!cuenta) {
        return null;
      }

      return {
        id: cuenta.id,
        providerAccountId: cuenta.providerAccountId,
        email: cuenta.email,
        usuario: {
          id: cuenta.user.id,
          rol: cuenta.user.rol,
          debeCambiarPassword: cuenta.user.debeCambiarPassword,
          activo: cuenta.user.activo,
          fusionadoEnId: cuenta.user.fusionadoEnId,
          nombre: [cuenta.user.nombres, cuenta.user.apellidos].filter(Boolean).join(" "),
          email: cuenta.user.emailPrincipal,
        },
      };
    },

    async actualizarUltimoAccesoGoogle(
      cuentaId: string,
      subject: string,
      fecha = new Date(),
    ): Promise<void> {
      await db.cuentaGoogleFlacso.update({
        where: { id: cuentaId },
        data: {
          providerAccountId: subject,
          ultimoAccesoAt: fecha,
        },
      });
    },
  };
}

async function idDisponible(tx: any, perfil: PerfilGoogle): Promise<string> {
  const local =
    perfil.email
      .split("@")[0]
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
  if (perfil.apellidos?.trim()) {
    return perfil.apellidos.trim();
  }
  const parts = perfil.nombre?.trim().split(/\s+/) ?? [];
  return parts.length > 1 ? parts.slice(1).join(" ") : null;
}

function dominioEmail(email: string): string {
  return email.split("@")[1] ?? "";
}
