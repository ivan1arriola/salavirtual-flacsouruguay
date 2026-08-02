import { createRequire } from "node:module";
import { compare } from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import type { PrismaClient as LegacyPrismaClientType } from "../../flacso-zoom-plataforma-web/node_modules/@prisma/client";

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
if (!process.env.MIGRATION_DEFAULT_PASSWORD) {
  throw new Error("MIGRATION_DEFAULT_PASSWORD es obligatoria.");
}

const source = new LegacyPrismaClient({ datasourceUrl: process.env.LEGACY_DATABASE_URL });
const target = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });

type RestorePlan = Readonly<{
  usuarioId: string;
  legacyZoomUserId: string;
  legacyPasswordHash: string;
}>;

async function main(): Promise<void> {
  try {
    const legacyUsers = await source.user.findMany({
      where: { passwordHash: { not: null } },
      select: { id: true, passwordHash: true }
    });
    const targetUsers = await target.usuario.findMany({
      where: { legacyZoomUserId: { in: legacyUsers.map(({ id }) => id) } },
      select: {
        id: true,
        legacyZoomUserId: true,
        passwordHash: true,
        fusionadoEnId: true
      }
    });
    const targetsByLegacyId = new Map(
      targetUsers.map((user) => [user.legacyZoomUserId, user] as const)
    );
    const candidates = legacyUsers.flatMap<RestorePlan>((legacy) => {
      const current = targetsByLegacyId.get(legacy.id);
      return current && legacy.passwordHash && !current.fusionadoEnId
        ? [{
            usuarioId: current.id,
            legacyZoomUserId: legacy.id,
            legacyPasswordHash: legacy.passwordHash
          }]
        : [];
    });
    const decisions = await Promise.all(
      candidates.map(async (candidate) => {
        const current = targetUsers.find(({ id }) => id === candidate.usuarioId);
        const alreadyRestored =
          current?.passwordHash === candidate.legacyPasswordHash;
        const hasTemporaryPassword = current?.passwordHash
          ? await passwordMatchesDefault(current.passwordHash)
          : true;
        return {
          candidate,
          alreadyRestored,
          restore: !alreadyRestored && hasTemporaryPassword
        };
      })
    );
    const plans = decisions.filter(({ restore }) => restore).map(({ candidate }) => candidate);

    console.log(JSON.stringify({
      mode: applyChanges ? "apply" : "dry-run",
      legacyUsersWithPassword: legacyUsers.length,
      matchedUsers: candidates.length,
      passwordsToRestore: plans.length,
      alreadyRestored: decisions.filter(({ alreadyRestored }) => alreadyRestored).length,
      currentPasswordsPreserved: decisions.filter(
        ({ restore, alreadyRestored }) => !restore && !alreadyRestored
      ).length,
      missingOrMergedUsers: legacyUsers.length - candidates.length
    }, null, 2));

    if (!applyChanges || plans.length === 0) return;
    await target.$transaction(
      plans.flatMap((plan) => [
        target.usuario.update({
          where: { id: plan.usuarioId },
          data: {
            passwordHash: plan.legacyPasswordHash,
            passwordInicialCifrada: null,
            debeCambiarPassword: false
          }
        }),
        target.auditoria.create({
          data: {
            accion: "PASSWORD_LEGACY_RESTAURADA",
            entidadTipo: "Usuario",
            entidadId: plan.usuarioId,
            valorNuevo: {
              legacyZoomUserId: plan.legacyZoomUserId,
              hashCopiadoSinExponer: true
            }
          }
        })
      ])
    );
    console.log(JSON.stringify({ restored: plans.length }, null, 2));
  } finally {
    await Promise.all([source.$disconnect(), target.$disconnect()]);
  }
}

async function passwordMatchesDefault(passwordHash: string): Promise<boolean> {
  try {
    return await compare(process.env.MIGRATION_DEFAULT_PASSWORD as string, passwordHash);
  } catch {
    return false;
  }
}

void main();
