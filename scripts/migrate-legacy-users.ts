import { createRequire } from "node:module";
import { PrismaClient } from "@prisma/client";
import type { UsuarioLegacy } from "../src/modules/migracion/usuarios-legacy.domain";
type LegacyPrismaClientType = Readonly<{
  user: { findMany: (args: unknown) => Promise<UsuarioLegacy[]> };
  $disconnect: () => Promise<void>;
}>;
import { planificarMigracionUsuarios } from "../src/modules/migracion/usuarios-legacy.domain";
import { crearSlugAsistenteDisponible } from "../src/modules/asistencia/asistente-slug.adapter";

const legacyRequire = createRequire(
  new URL("../../flacso-zoom-plataforma-web/package.json", import.meta.url),
);
const { PrismaClient: LegacyPrismaClient } = legacyRequire("@prisma/client") as {
  PrismaClient: new (options: { datasourceUrl: string }) => LegacyPrismaClientType;
};
const applyChanges = process.argv.includes("--apply");

if (!process.env["DATABASE_URL"] || !process.env["LEGACY_DATABASE_URL"]) {
  throw new Error("DATABASE_URL y LEGACY_DATABASE_URL son obligatorias.");
}

const source = new LegacyPrismaClient({
  datasourceUrl: process.env["LEGACY_DATABASE_URL"],
});
const target = new PrismaClient({
  datasourceUrl: process.env["DATABASE_URL"],
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
            // OAuth tokens are not migrated: only the stable Google subject is required.
          },
        },
        docenteProfile: {
          select: {
            documentoIdentidad: true,
            observaciones: true,
          },
        },
        asistenteProfile: {
          select: {
            aliasOperativo: true,
            disponibleGeneral: true,
            datosPago: true,
          },
        },
      },
    }),
    target.usuario.findMany({
      select: {
        id: true,
        legacyZoomUserId: true,
      },
    }),
  ]);

  return planificarMigracionUsuarios(
    legacyUsers,
    new Set(existingUsers.map(({ id }) => id)),
    new Map(
      existingUsers
        .filter(({ legacyZoomUserId }) => Boolean(legacyZoomUserId))
        .map(({ id, legacyZoomUserId }) => [legacyZoomUserId as string, id]),
    ),
  );
}

async function aplicarPlan(plan: Awaited<ReturnType<typeof cargarPlanes>>[number]): Promise<void> {
  // No asignar una credencial compartida a cuentas nuevas sin contraseña legacy.
  // Podrán crear una propia mediante /recuperar-contrasena, si tienen correo válido.
  const requiereActivacion = !plan.passwordHash && plan.cuentasGoogle.length === 0;
  if (requiereActivacion && !plan.emailPrincipal?.trim()) {
    throw new Error(
      `El usuario legacy ${plan.legacyZoomUserId} no tiene correo para activar su cuenta de forma segura.`,
    );
  }
  const passwordHash = plan.passwordHash ?? null;

  await target.$transaction(async (tx) => {
    const existing = await tx.usuario.findUnique({
      where: { legacyZoomUserId: plan.legacyZoomUserId },
      select: { id: true },
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
        passwordInicialCifrada: null,
        debeCambiarPassword: false,
        rol: plan.rol,
        ultimoAccesoAt: plan.ultimoAccesoAt,
        ultimoAccesoIp: plan.ultimoAccesoIp,
        ultimoAccesoAgente: plan.ultimoAccesoAgente,
        ultimoProveedor: plan.ultimoProveedor,
        createdAt: plan.createdAt,
        updatedAt: plan.updatedAt,
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
        ultimoProveedor: plan.ultimoProveedor,
      },
    });

    for (const email of plan.aliases) {
      await tx.usuarioEmailAlias.upsert({
        where: { email },
        create: { usuarioId: plan.usuarioId, email },
        update: { usuarioId: plan.usuarioId },
      });
    }

    const emailsGoogle = [plan.emailPrincipal, ...plan.aliases].filter((email) =>
      email.endsWith("@flacso.edu.uy"),
    );
    for (const [index, account] of plan.cuentasGoogle.entries()) {
      const email = emailsGoogle[index];
      if (!email) {
        continue;
      }
      const ownership = await tx.cuentaGoogleFlacso.findUnique({
        where: { providerAccountId: account.providerAccountId },
        select: { userId: true },
      });
      if (ownership && ownership.userId !== plan.usuarioId) {
        throw new Error(
          `Cuenta Google ${account.providerAccountId} ya vinculada a otro usuario: migración bloqueada.`,
        );
      }
      await tx.cuentaGoogleFlacso.upsert({
        where: { providerAccountId: account.providerAccountId },
        create: {
          userId: plan.usuarioId,
          email,
          dominio: "flacso.edu.uy",
          ...account,
          emailVerificadoAt: plan.emailVerificadoAt,
        },
        update: {
          userId: plan.usuarioId,
          email,
          emailVerificadoAt: plan.emailVerificadoAt,
        },
      });
    }

    if (plan.docente) {
      await tx.docente.upsert({
        where: { usuarioId: plan.usuarioId },
        create: {
          usuarioId: plan.usuarioId,
          documentoIdentidad: plan.docente.documentoIdentidad,
          observaciones: plan.docente.observaciones,
        },
        update: {
          documentoIdentidad: plan.docente.documentoIdentidad,
          observaciones: plan.docente.observaciones,
        },
      });
    }
    if (plan.asistenteTecnico) {
      const assistantSlug = await crearSlugAsistenteDisponible(
        tx,
        [plan.nombres, plan.apellidos].filter(Boolean).join(" "),
        plan.usuarioId,
      );
      await tx.asistenteTecnico.upsert({
        where: { usuarioId: plan.usuarioId },
        create: {
          usuarioId: plan.usuarioId,
          slug: assistantSlug,
          aliasOperativo: plan.asistenteTecnico.aliasOperativo,
          disponibleGeneral: plan.asistenteTecnico.disponibleGeneral,
          datosPago: plan.asistenteTecnico.datosPago,
        },
        update: {
          slug: assistantSlug,
          aliasOperativo: plan.asistenteTecnico.aliasOperativo,
          disponibleGeneral: plan.asistenteTecnico.disponibleGeneral,
          datosPago: plan.asistenteTecnico.datosPago,
        },
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
          requiereActivacion,
          passwordInicialGuardada: false,
        },
      },
    });
  });
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
          asistentes: planes.filter(({ asistenteTecnico }) => Boolean(asistenteTecnico)).length,
          googleAccounts: planes.reduce(
            (total, { cuentasGoogle }) => total + cuentasGoogle.length,
            0,
          ),
          skippedExternalGoogleAccounts: planes.reduce(
            (total, { cuentasGoogleOmitidas }) => total + cuentasGoogleOmitidas,
            0,
          ),
          usersRequiringActivation: planes.filter(
            ({ cuentasGoogle, passwordHash }) => cuentasGoogle.length === 0 && !passwordHash,
          ).length,
          activationWithoutEmail: planes.filter(
            ({ cuentasGoogle, passwordHash, emailPrincipal }) =>
              cuentasGoogle.length === 0 && !passwordHash && !emailPrincipal?.trim(),
          ).length,
        },
        null,
        2,
      ),
    );

    if (applyChanges) {
      const invalid = planes.filter(
        ({ cuentasGoogle, passwordHash, emailPrincipal }) =>
          cuentasGoogle.length === 0 && !passwordHash && !emailPrincipal?.trim(),
      );
      if (invalid.length) {
        throw new Error(
          `Migración bloqueada: ${invalid.length} cuentas sin contraseña ni correo de activación.`,
        );
      }
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
