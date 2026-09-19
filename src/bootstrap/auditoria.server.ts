import "server-only";
import { db } from "@/src/lib/db";
import {
  crearPrismaAuditoriaAdapter,
  crearRegistrarAuditoriaUseCase,
  type RegistrarAuditoriaInput,
  type ResultadoAuditoria
} from "@/src/modules/auditoria/api";
import type { PrismaClient } from "@prisma/client";

export type ServicioAuditoria = Readonly<{
  registrar: (input: RegistrarAuditoriaInput) => Promise<ResultadoAuditoria>;
}>;

const defaultAdapter = crearPrismaAuditoriaAdapter(db);
const defaultUseCase = crearRegistrarAuditoriaUseCase(defaultAdapter);

export function obtenerServicioAuditoria(): ServicioAuditoria {
  return {
    registrar: defaultUseCase
  };
}

export function crearServicioAuditoriaTransaccional(
  tx: Pick<PrismaClient, "auditoria">
): ServicioAuditoria {
  const adapter = crearPrismaAuditoriaAdapter(tx);
  const useCase = crearRegistrarAuditoriaUseCase(adapter);
  return {
    registrar: useCase
  };
}
