export type EstadoConciliacionZoom = "SIN_CONCILIAR" | "SUGERIDO" | "CONCILIADO" | "EXTERNO";

export type ActorConciliacionZoom = Readonly<{ id: string; rol: "ADMINISTRACION" | "DOCENTE" | "ASISTENTE_TECNICO" }>;

/** Concilian solo administración y el docente titular de la serie; el resto (asistentes, otros docentes) solo lee. */
export function puedeConciliarAsistenciaZoom(
  actor: ActorConciliacionZoom,
  contexto: Readonly<{ titularUsuarioId: string | null }>
): boolean {
  if (actor.rol === "ADMINISTRACION") return true;
  return actor.rol === "DOCENTE" && contexto.titularUsuarioId !== null && contexto.titularUsuarioId === actor.id;
}

export type SolicitudConciliacionZoom = Readonly<{ invitadoReunionId: string | null; externo: boolean }>;

/** Vincular, marcar externo y quitar vínculo son operaciones explícitas; vincular y externo a la vez no existe. */
export function calcularCambioConciliacionZoom(solicitud: SolicitudConciliacionZoom): Readonly<{
  estadoConciliacion: EstadoConciliacionZoom;
  invitadoReunionId: string | null;
  esExterno: boolean | null;
}> | null {
  if (solicitud.invitadoReunionId && solicitud.externo) return null;
  if (solicitud.invitadoReunionId) {
    return { estadoConciliacion: "CONCILIADO", invitadoReunionId: solicitud.invitadoReunionId, esExterno: false };
  }
  if (solicitud.externo) return { estadoConciliacion: "EXTERNO", invitadoReunionId: null, esExterno: true };
  return { estadoConciliacion: "SIN_CONCILIAR", invitadoReunionId: null, esExterno: null };
}

const normalizarCorreo = (correo: string) => correo.trim().toLowerCase();

/**
 * Recuerda vínculos previos de la misma serie como SUGERIDO: solo con identificador fiable (`id:`), un único
 * correo previo inequívoco y un invitado de este encuentro con ese correo. Nunca por nombre, y un invitado
 * no se sugiere para dos registros.
 */
export function proponerSugerenciasConciliacionZoom(
  pendientes: ReadonlyArray<Readonly<{ registroId: string; claveParticipante: string }>>,
  vinculosPrevios: ReadonlyArray<Readonly<{ claveParticipante: string; email: string }>>,
  invitados: ReadonlyArray<Readonly<{ id: string; email: string }>>
): ReadonlyArray<Readonly<{ registroId: string; invitadoReunionId: string }>> {
  const candidatas = pendientes.flatMap(({ registroId, claveParticipante }) => {
    if (!claveParticipante.startsWith("id:")) return [];
    const correos = [
      ...new Set(vinculosPrevios.filter((v) => v.claveParticipante === claveParticipante).map((v) => normalizarCorreo(v.email)))
    ];
    if (correos.length !== 1) return [];
    const coincidentes = invitados.filter((i) => normalizarCorreo(i.email) === correos[0]);
    return coincidentes.length === 1 ? [{ registroId, invitadoReunionId: coincidentes[0]!.id }] : [];
  });
  const usos = candidatas.reduce<Readonly<Record<string, number>>>(
    (acc, c) => ({ ...acc, [c.invitadoReunionId]: (acc[c.invitadoReunionId] ?? 0) + 1 }),
    {}
  );
  return candidatas.filter((c) => usos[c.invitadoReunionId] === 1);
}
