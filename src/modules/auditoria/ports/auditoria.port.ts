import type { EventoAuditoria } from "../domain/auditoria.types";

export type AuditoriaRepository = Readonly<{
  registrar: (evento: EventoAuditoria) => Promise<void>;
}>;
