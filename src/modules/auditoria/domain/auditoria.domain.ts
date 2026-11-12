import type { EventoAuditoria, ResultadoValidacion, ValidarEventoAuditoriaInput } from "./auditoria.types";

export function validarEventoAuditoria(
  input: ValidarEventoAuditoriaInput
): ResultadoValidacion<EventoAuditoria> {
  const accion = input.accion?.trim();
  const entidadTipo = input.entidadTipo?.trim();
  const entidadId = input.entidadId?.trim();

  if (!accion) {
    return { ok: false, error: "La accion de auditoria no puede estar vacia" };
  }

  if (!entidadTipo) {
    return { ok: false, error: "La entidadTipo de auditoria no puede estar vacia" };
  }

  if (!entidadId) {
    return { ok: false, error: "La entidadId de auditoria no puede estar vacia" };
  }

  if (!input.timestamp || !(input.timestamp instanceof Date) || isNaN(input.timestamp.getTime())) {
    return { ok: false, error: "El timestamp de auditoria debe ser una fecha valida" };
  }

  return {
    ok: true,
    value: {
      accion,
      entidadTipo,
      entidadId,
      actorUsuarioId: input.actorUsuarioId ?? null,
      valorAnterior: input.valorAnterior ?? null,
      valorNuevo: input.valorNuevo ?? null,
      correlacionId: input.correlacionId ?? null,
      timestamp: input.timestamp
    }
  };
}
