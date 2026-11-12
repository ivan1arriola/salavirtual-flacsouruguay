import { validarEventoAuditoria } from "../domain/auditoria.domain";
import type { EventoAuditoria, ValidarEventoAuditoriaInput } from "../domain/auditoria.types";
import type { AuditoriaRepository } from "../ports/auditoria.port";

export type RegistrarAuditoriaInput = ValidarEventoAuditoriaInput;

export type ResultadoAuditoria =
  Readonly<{ ok: true; evento: EventoAuditoria }> | Readonly<{ ok: false; error: string }>;

export function crearRegistrarAuditoriaUseCase(repository: AuditoriaRepository) {
  return async function registrarAuditoria(input: RegistrarAuditoriaInput): Promise<ResultadoAuditoria> {
    const validacion = validarEventoAuditoria(input);
    if (!validacion.ok) {
      return { ok: false, error: validacion.error };
    }

    await repository.registrar(validacion.value);
    return { ok: true, evento: validacion.value };
  };
}
