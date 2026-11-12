import { createHash } from "node:crypto";
import type {
  CuentaCalendarioAsistente,
  PlanCalendarioAsistente,
  ResultadoSincronizacionCalendarioAsistente,
  SnapshotCalendarioAsistente
} from "./calendario-asistente.types";

const ACTIVE_ASSIGNMENTS = new Set(["ASIGNADO", "ACEPTADO"]);

export function idEventoCalendarioAsistente(instanciaId: string, cuentaGoogleId: string): string {
  return createHash("sha256").update(`flacso-asistencia:${instanciaId}:${cuentaGoogleId}`).digest("hex");
}

export type SegmentoCalendarioAsistente = "PREPARACION" | "CIERRE";

export function idEventoCalendarioAsistenteSegmento(
  instanciaId: string,
  cuentaGoogleId: string,
  segmento: SegmentoCalendarioAsistente
): string {
  return createHash("sha256")
    .update(`flacso-asistencia:${instanciaId}:${cuentaGoogleId}:${segmento.toLowerCase()}`)
    .digest("hex");
}

export function cuentasCalendarioDeseadas(
  snapshot: SnapshotCalendarioAsistente
): readonly CuentaCalendarioAsistente[] {
  if (snapshot.estado !== "PROGRAMADA" || !snapshot.requiereAsistenciaTecnica || snapshot.vigente === false) {
    return [];
  }

  return cuentasUnicas(
    snapshot.asignaciones
      .filter(({ estado }) => ACTIVE_ASSIGNMENTS.has(estado))
      .filter(({ asistenteTecnico }) => {
        const usuario = asistenteTecnico.usuario;
        return usuario.rol === "ASISTENTE_TECNICO" && usuario.activo && !usuario.fusionadoEnId;
      })
      .flatMap(({ asistenteTecnico }) => asistenteTecnico.usuario.cuentasGoogle)
      .filter(esCuentaGoogleVinculada)
  );
}

export function planificarSincronizacionCalendarioAsistente(
  snapshot: SnapshotCalendarioAsistente & Readonly<{ instanciaId: string }>
): PlanCalendarioAsistente {
  const desired = cuentasCalendarioDeseadas(snapshot);
  const desiredIds = desired.map(({ id }) => id);
  const historical = cuentasUnicas(
    snapshot.asignaciones
      .filter(({ asistenteTecnico }) => asistenteTecnico.usuario.rol === "ASISTENTE_TECNICO")
      .flatMap(({ asistenteTecnico }) => asistenteTecnico.usuario.cuentasGoogle)
      .filter(esCuentaGoogleVinculada)
  );

  return {
    publicar: desired.map((cuenta) => ({
      cuenta,
      eventId: idEventoCalendarioAsistente(snapshot.instanciaId, cuenta.id)
    })),
    eliminar: historical
      .filter(({ id }) => !desiredIds.includes(id))
      .map((cuenta) => ({
        cuenta,
        eventId: idEventoCalendarioAsistente(snapshot.instanciaId, cuenta.id)
      }))
  };
}

export function hayErroresSincronizacionCalendarioAsistente(
  results: readonly ResultadoSincronizacionCalendarioAsistente[]
): boolean {
  return results.some(({ estado }) => estado === "ERROR");
}

function esCuentaGoogleVinculada(cuenta: CuentaCalendarioAsistente): boolean {
  return Boolean(cuenta.providerAccountId && cuenta.emailVerificadoAt);
}

function cuentasUnicas(cuentas: readonly CuentaCalendarioAsistente[]): readonly CuentaCalendarioAsistente[] {
  return cuentas.filter((cuenta, index, all) => all.findIndex(({ id }) => id === cuenta.id) === index);
}
