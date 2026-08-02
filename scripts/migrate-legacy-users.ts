import { createRequire } from "node:module";
import { hash } from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import type { PrismaClient as LegacyPrismaClientType } from "../../flacso-zoom-plataforma-web/node_modules/@prisma/client";
import { planificarMigracionUsuarios } from "../src/modules/migracion/usuarios-legacy.domain";

const legacyRequire = createRequire(
  new URL("../../flacso-zoom-plataforma-web/package.json", import.meta.url)
);
const { PrismaClient: LegacyPrismaClient } = legacyRequire("@prisma/client") as {
  PrismaClient: new (options: { datasourceUrl: string }) => LegacyPrismaClientType;
};
const applyChanges = process.argv.includes("--apply");

if (!process.env.DATABASE_URL || !process.env.LEGACY_DATABASE_URL) {
  throw new Error("DATABASE_URL y LEGACY_DATABASE_URL son obligatorias.");
}

function requireDefaultPassword(value: string | undefined): string {
  if (value && value.length >= 10) {
    return value;
  }
  throw new Error("MIGRATION_DEFAULT_PASSWORD debe tener al menos 10 caracteres.");
}

const defaultPassword = requireDefaultPassword(process.env.MIGRATION_DEFAULT_PASSWORD);
const source = new LegacyPrismaClient({
  datasourceUrl: process.env.LEGACY_DATABASE_URL
});
const target = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL
});

async function cargarPlanes() {
  const [legacyUsers, existingUsers] = await Promise.all([
    source.user.findMany({
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      include: {
        emailAliases: { select: { email: true } },
        accounts: {
          where: { provider: "google" },
          select: {
            providerAccountId: true,
            refresh_token: true,
            access_token: true,
            expires_at: true,
            token_type: true,
            scope: true,
            id_token: true,
            session_state: true
          }
        },
        docenteProfile: {
          select: {
            documentoIdentidad: true,
            observaciones: true
          }
        },
        asistenteProfile: {
          select: {
            aliasOperativo: true,
            disponibleGeneral: true,
            datosPago: true
          }
        }
      }
    }),
    target.usuario.findMany({
      select: {
        id: true,
        legacyZoomUserId: true
      }
    })
  ]);

  return planificarMigracionUsuarios(
    legacyUsers,
    new Set(existingUsers.map(({ id }) => id)),
    new Map(
      existingUsers
        .filter(({ legacyZoomUserId }) => Boolean(legacyZoomUserId))
        .map(({ id, legacyZoomUserId }) => [legacyZoomUserId as string, id])
    )
  );
}

async function aplicarPlan(
  plan: Awaited<ReturnType<typeof cargarPlanes>>[number]
): Promise<void> {
  const requierePassword = plan.cuentasGoogle.length === 0;
  const passwordHash =
    plan.passwordHash ?? (requierePassword ? await hash(defaultPassword, 12) : null);
  const passwordTemporal = !plan.passwordHash && requierePassword;
  const passwordInicialCifrada = passwordTemporal
    ? await cifrarPasswordInicial(defaultPassword)
    : null;

  await target.$transaction(async (tx) => {
    const existing = await tx.usuario.findUnique({
      where: { legacyZoomUserId: plan.legacyZoomUserId },
      select: { id: true }
    });

    await tx.usuario.upsert({
      where: { legacyZoomUserId: plan.legacyZoomUserId },
      create: {
        id: plan.usuarioId,
        legacyZoomUserId: plan.legacyZoomUserId,
        nombres: plan.nombres,
        apellidos: plan.apellidos,
        emailPrincipal: plan.emailPrincipal,
        emailVerificadoAt: plan.emailVerificadoAt,
        imagenUrl: plan.imagenUrl,
        passwordHash,
        passwordInicialCifrada,
        debeCambiarPassword: passwordTemporal,
        rol: plan.rol,
        ultimoAccesoAt: plan.ultimoAccesoAt,
        ultimoAccesoIp: plan.ultimoAccesoIp,
        ultimoAccesoAgente: plan.ultimoAccesoAgente,
        ultimoProveedor: plan.ultimoProveedor,
        createdAt: plan.createdAt,
        updatedAt: plan.updatedAt
      },
      update: {
        nombres: plan.nombres,
        apellidos: plan.apellidos,
        emailPrincipal: plan.emailPrincipal,
        emailVerificadoAt: plan.emailVerificadoAt,
        imagenUrl: plan.imagenUrl,
        rol: plan.rol,
        ultimoAccesoAt: plan.ultimoAccesoAt,
        ultimoAccesoIp: plan.ultimoAccesoIp,
        ultimoAccesoAgente: plan.ultimoAccesoAgente,
        ultimoProveedor: plan.ultimoProveedor
      }
    });

    for (const email of plan.aliases) {
      await tx.usuarioEmailAlias.upsert({
        where: { email },
        create: { usuarioId: plan.usuarioId, email },
        update: { usuarioId: plan.usuarioId }
      });
    }

    const emailsGoogle = [plan.emailPrincipal, ...plan.aliases].filter((email) =>
      email.endsWith("@flacso.edu.uy")
    );
    for (const [index, account] of plan.cuentasGoogle.entries()) {
      const email = emailsGoogle[index];
      if (!email) continue;
      await tx.cuentaGoogleFlacso.upsert({
        where: { providerAccountId: account.providerAccountId },
        create: {
          userId: plan.usuarioId,
          email,
          dominio: "flacso.edu.uy",
          ...account,
          emailVerificadoAt: plan.emailVerificadoAt
        },
        update: {
          userId: plan.usuarioId,
          email,
          refresh_token: account.refresh_token,
          access_token: account.access_token,
          expires_at: account.expires_at,
          token_type: account.token_type,
          scope: account.scope,
          id_token: account.id_token,
          session_state: account.session_state,
          emailVerificadoAt: plan.emailVerificadoAt
        }
      });
    }

    if (plan.docente) {
      await tx.docente.upsert({
        where: { usuarioId: plan.usuarioId },
        create: {
          usuarioId: plan.usuarioId,
          documentoIdentidad: plan.docente.documentoIdentidad,
          observaciones: plan.docente.observaciones
        },
        update: {
          documentoIdentidad: plan.docente.documentoIdentidad,
          observaciones: plan.docente.observaciones
        }
      });
    }
    if (plan.asistente) {
      await tx.asistente.upsert({
        where: { usuarioId: plan.usuarioId },
        create: {
          usuarioId: plan.usuarioId,
          aliasOperativo: plan.asistente.aliasOperativo,
          disponibleGeneral: plan.asistente.disponibleGeneral,
          datosPago: plan.asistente.datosPago
        },
        update: {
          aliasOperativo: plan.asistente.aliasOperativo,
          disponibleGeneral: plan.asistente.disponibleGeneral,
          datosPago: plan.asistente.datosPago
        }
      });
    }

    await tx.auditoria.create({
      data: {
        accion: existing ? "USUARIO_LEGACY_ACTUALIZADO" : "USUARIO_LEGACY_IMPORTADO",
        entidadTipo: "Usuario",
        entidadId: plan.usuarioId,
        valorNuevo: {
          legacyZoomUserId: plan.legacyZoomUserId,
          rol: plan.rol,
          passwordTemporal,
          passwordInicialGuardada: passwordTemporal
        }
      }
    });
  });
}

async function cifrarPasswordInicial(password: string): Promise<string> {
  const { cifrarConfiguracion } = await import("../src/lib/config/encryption");
  const { guardarPasswordInicialCifrada } = await import(
    "../src/modules/usuarios/password-inicial.service"
  );
  return guardarPasswordInicialCifrada(password, { cifrar: cifrarConfiguracion });
}

async function main(): Promise<void> {
  try {
    const planes = await cargarPlanes();
    console.log(
      JSON.stringify(
        {
          mode: applyChanges ? "apply" : "dry-run",
          users: planes.length,
          docentes: planes.filter(({ docente }) => Boolean(docente)).length,
          asistentes: planes.filter(({ asistente }) => Boolean(asistente)).length,
          googleAccounts: planes.reduce(
            (total, { cuentasGoogle }) => total + cuentasGoogle.length,
            0
          ),
          skippedExternalGoogleAccounts: planes.reduce(
            (total, { cuentasGoogleOmitidas }) => total + cuentasGoogleOmitidas,
            0
          ),
          usersWithTemporaryPassword: planes.filter(
            ({ cuentasGoogle }) => cuentasGoogle.length === 0
          ).length
        },
        null,
        2
      )
    );

    if (applyChanges) {
      for (const plan of planes) {
        await aplicarPlan(plan);
      }
      console.log(JSON.stringify({ migrated: planes.length }, null, 2));
    }
  } finally {
    await Promise.all([source.$disconnect(), target.$disconnect()]);
  }
}

void main();
