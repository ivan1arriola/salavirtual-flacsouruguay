import type { Prisma, PrismaClient } from "@prisma/client";
import type { SessionActor } from "@/src/lib/auth/session-actor.adapter";

type Db = PrismaClient | Prisma.TransactionClient;

export type DestinatarioDocentePrograma = Readonly<{
  usuarioId: string;
  email: string | null;
}>;

export async function puedeGestionarPrograma(
  db: Db,
  actor: SessionActor,
  programaId: string,
): Promise<boolean> {
  if (!actor.activo) {
    return false;
  }
  if (actor.rol === "ADMINISTRACION") {
    return true;
  }
  if (actor.rol !== "DOCENTE") {
    return false;
  }

  const association = await db.docentePrograma.findFirst({
    where: {
      programaId,
      activo: true,
      programa: { activo: true },
      docente: {
        usuarioId: actor.id,
        usuario: { activo: true, rol: "DOCENTE" },
      },
    },
    select: { id: true },
  });
  return Boolean(association);
}

export async function destinatariosDocentesPrograma(
  db: Db,
  programaId: string,
): Promise<readonly DestinatarioDocentePrograma[]> {
  const associations = await db.docentePrograma.findMany({
    where: {
      programaId,
      activo: true,
      programa: { activo: true },
      docente: { usuario: { activo: true, rol: "DOCENTE" } },
    },
    select: {
      docente: {
        select: {
          usuario: { select: { id: true, emailPrincipal: true } },
        },
      },
    },
  });

  return Array.from(
    new Map(
      associations.map(({ docente }) => [
        docente.usuario.id,
        { usuarioId: docente.usuario.id, email: docente.usuario.emailPrincipal },
      ]),
    ).values(),
  );
}
