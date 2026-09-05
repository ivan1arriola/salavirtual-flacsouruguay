import { createHash } from "node:crypto";

export type CuentaCalendarioAsistente = Readonly<{
  id: string;
  email: string;
  dominio: string;
  providerAccountId: string | null;
  emailVerificadoAt: Date | null;
}>;

type UsuarioAsignado = Readonly<{
  rol: string;
  activo: boolean;
  fusionadoEnId: string | null;
  cuentasGoogle: readonly CuentaCalendarioAsistente[];
}>;

export type AsignacionCalendarioAsistente = Readonly<{
  id: string;
  estado: string;
  asistenteTecnico: Readonly<{
    usuario: UsuarioAsignado;
  }>;
}>;

export type SnapshotCalendarioAsistente = Readonly<{
  estado: string;
  requiereAsistenciaTecnica: boolean;
  asignaciones: readonly AsignacionCalendarioAsistente[];
}>;

export type PlanCalendarioAsistente = Readonly<{
  publicar: readonly Readonly<{ cuenta: CuentaCalendarioAsistente; eventId: string }>[];
  eliminar: readonly Readonly<{ cuenta: CuentaCalendarioAsistente; eventId: string }>[];
}>;

const ACTIVE_ASSIGNMENTS = new Set(["ASIGNADO", "ACEPTADO"]);

export function idEventoCalendarioAsistente(instanciaId: string, cuentaGoogleId: string): string {
  return createHash("sha256")
    .update(`flacso-asistencia:${instanciaId}:${cuentaGoogleId}`)
    .digest("hex");
}

export function cuentasCalendarioDeseadas(snapshot: SnapshotCalendarioAsistente): readonly CuentaCalendarioAsistente[] {
  if (snapshot.estado !== "PROGRAMADA" || !snapshot.requiereAsistenciaTecnica) return [];

  const cuentas = new Map<string, CuentaCalendarioAsistente>();
  for (const asignacion of snapshot.asignaciones) {
    if (!ACTIVE_ASSIGNMENTS.has(asignacion.estado)) continue;
    const usuario = asignacion.asistenteTecnico.usuario;
    if (usuario.rol !== "ASISTENTE_TECNICO" || !usuario.activo || usuario.fusionadoEnId) continue;

    for (const cuenta of usuario.cuentasGoogle) {
      if (!cuenta.providerAccountId || !cuenta.emailVerificadoAt) continue;
      cuentas.set(cuenta.id, cuenta);
    }
  }
  return [...cuentas.values()];
}

export function planificarSincronizacionCalendarioAsistente(
  snapshot: SnapshotCalendarioAsistente & Readonly<{ instanciaId: string }>,
): PlanCalendarioAsistente {
  const desired = new Map(cuentasCalendarioDeseadas(snapshot).map((cuenta) => [cuenta.id, cuenta]));
  const historical = new Map<string, CuentaCalendarioAsistente>();

  for (const asignacion of snapshot.asignaciones) {
    const usuario = asignacion.asistenteTecnico.usuario;
    if (usuario.rol !== "ASISTENTE_TECNICO") continue;
    for (const cuenta of usuario.cuentasGoogle) {
      if (!cuenta.providerAccountId || !cuenta.emailVerificadoAt) continue;
      historical.set(cuenta.id, cuenta);
    }
  }

  return {
    publicar: [...desired.values()].map((cuenta) => ({
      cuenta,
      eventId: idEventoCalendarioAsistente(snapshot.instanciaId, cuenta.id),
    })),
    eliminar: [...historical.values()]
      .filter((cuenta) => !desired.has(cuenta.id))
      .map((cuenta) => ({
        cuenta,
        eventId: idEventoCalendarioAsistente(snapshot.instanciaId, cuenta.id),
      })),
  };
}
