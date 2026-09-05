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
  vigente?: boolean;
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
  if (snapshot.estado !== "PROGRAMADA" || !snapshot.requiereAsistenciaTecnica || snapshot.vigente === false) return [];

  return cuentasUnicas(
    snapshot.asignaciones
      .filter(({ estado }) => ACTIVE_ASSIGNMENTS.has(estado))
      .filter(({ asistenteTecnico }) => {
        const usuario = asistenteTecnico.usuario;
        return usuario.rol === "ASISTENTE_TECNICO" && usuario.activo && !usuario.fusionadoEnId;
      })
      .flatMap(({ asistenteTecnico }) => asistenteTecnico.usuario.cuentasGoogle)
      .filter(esCuentaGoogleVinculada),
  );
}

export function planificarSincronizacionCalendarioAsistente(
  snapshot: SnapshotCalendarioAsistente & Readonly<{ instanciaId: string }>,
): PlanCalendarioAsistente {
  const desired = cuentasCalendarioDeseadas(snapshot);
  const desiredIds = desired.map(({ id }) => id);
  const historical = cuentasUnicas(
    snapshot.asignaciones
      .filter(({ asistenteTecnico }) => asistenteTecnico.usuario.rol === "ASISTENTE_TECNICO")
      .flatMap(({ asistenteTecnico }) => asistenteTecnico.usuario.cuentasGoogle)
      .filter(esCuentaGoogleVinculada),
  );

  return {
    publicar: desired.map((cuenta) => ({
      cuenta,
      eventId: idEventoCalendarioAsistente(snapshot.instanciaId, cuenta.id),
    })),
    eliminar: historical
      .filter(({ id }) => !desiredIds.includes(id))
      .map((cuenta) => ({
        cuenta,
        eventId: idEventoCalendarioAsistente(snapshot.instanciaId, cuenta.id),
      })),
  };
}

function esCuentaGoogleVinculada(cuenta: CuentaCalendarioAsistente): boolean {
  return Boolean(cuenta.providerAccountId && cuenta.emailVerificadoAt);
}

function cuentasUnicas(
  cuentas: readonly CuentaCalendarioAsistente[],
): readonly CuentaCalendarioAsistente[] {
  return cuentas.filter(
    (cuenta, index, all) => all.findIndex(({ id }) => id === cuenta.id) === index,
  );
}
