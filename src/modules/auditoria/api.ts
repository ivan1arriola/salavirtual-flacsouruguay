export type {
  EventoAuditoria,
  ResultadoValidacion,
  ValidarEventoAuditoriaInput
} from "./domain/auditoria.types";
export { validarEventoAuditoria } from "./domain/auditoria.domain";
export type { AuditoriaRepository } from "./ports/auditoria.port";
export {
  crearRegistrarAuditoriaUseCase,
  type RegistrarAuditoriaInput,
  type ResultadoAuditoria
} from "./application/registrar-auditoria.use-case";
export { crearPrismaAuditoriaAdapter } from "./infrastructure/prisma-auditoria.adapter";

