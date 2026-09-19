import type { PrismaClient } from "@prisma/client";
import type { SessionActor } from "@/src/lib/auth/session-actor.adapter";
import {
  crearPrismaArchivosRepositoryAdapter,
  listarArchivosVisiblesUseCase,
  listarGrabacionesNoRealizadasVisiblesUseCase,
  listarGrabacionesPendientesVisiblesUseCase
} from "@/src/modules/archivos/api";

export function listarArchivosMeetVisibles(
  db: PrismaClient,
  actor: SessionActor
) {
  const repo = crearPrismaArchivosRepositoryAdapter(db);
  return repo.listarArchivosVisibles(actor);
}

export function listarGrabacionesPendientesVisibles(
  db: PrismaClient,
  actor: SessionActor,
  desde: Date,
  hasta: Date
) {
  const repo = crearPrismaArchivosRepositoryAdapter(db);
  return repo.listarGrabacionesPendientesVisibles(actor, desde, hasta);
}

export function listarGrabacionesNoRealizadasVisibles(
  db: PrismaClient,
  actor: SessionActor,
  desde: Date,
  hasta: Date
) {
  const repo = crearPrismaArchivosRepositoryAdapter(db);
  return repo.listarGrabacionesNoRealizadasVisibles(actor, desde, hasta);
}
