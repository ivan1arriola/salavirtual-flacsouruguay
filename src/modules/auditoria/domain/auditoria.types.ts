export type EventoAuditoria = Readonly<{
  accion: string;
  entidadTipo: string;
  entidadId: string;
  actorUsuarioId?: string | null;
  valorAnterior?: Readonly<Record<string, unknown>> | null;
  valorNuevo?: Readonly<Record<string, unknown>> | null;
  correlacionId?: string | null;
  timestamp: Date;
}>;

export type ValidarEventoAuditoriaInput = Readonly<{
  accion: string;
  entidadTipo: string;
  entidadId: string;
  actorUsuarioId?: string | null;
  valorAnterior?: Readonly<Record<string, unknown>> | null;
  valorNuevo?: Readonly<Record<string, unknown>> | null;
  correlacionId?: string | null;
  timestamp?: Date;
}>;

export type ResultadoValidacion<T> =
  Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; error: string }>;
