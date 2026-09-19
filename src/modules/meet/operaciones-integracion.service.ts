import type { PrismaClient } from "@prisma/client";
import {
  crearPrismaConferenciasRepository,
  descartarOperacionesNoBloqueantesLoteUseCase,
  descartarOperacionPendienteUseCase,
  type DescartarLoteResult,
  type DescartarOperacionResult,
  type ReclasificarLoteResult,
} from "@/src/modules/conferencias/api";

export type { DescartarOperacionResult, DescartarLoteResult, ReclasificarLoteResult };

export async function descartarOperacionPendiente(
  db: PrismaClient,
  eventoProveedorId: string
): Promise<DescartarOperacionResult> {
  const repo = crearPrismaConferenciasRepository({
    db,
    descifrarConfiguracion: (v) => v,
  });
  return descartarOperacionPendienteUseCase(repo, eventoProveedorId);
}

export async function descartarOperacionesNoBloqueantesLote(
  db: PrismaClient
): Promise<DescartarLoteResult> {
  const repo = crearPrismaConferenciasRepository({
    db,
    descifrarConfiguracion: (v) => v,
  });
  return descartarOperacionesNoBloqueantesLoteUseCase(repo);
}

export async function reclasificarOperacionesPendientes(
  db: PrismaClient
): Promise<ReclasificarLoteResult> {
  const repo = crearPrismaConferenciasRepository({
    db,
    descifrarConfiguracion: (v) => v,
  });
  if (repo.reclasificarOperacionesPendientesLote) {
    return repo.reclasificarOperacionesPendientesLote();
  }
  return { totalReclasificadas: 0 };
}

export const reclasificarOperacionesPendientesLote = reclasificarOperacionesPendientes;
