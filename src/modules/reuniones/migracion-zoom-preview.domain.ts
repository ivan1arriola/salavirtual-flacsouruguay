import { elegirCuentaHostParaPeriodos } from "./encuentros.domain";

export type CandidatoMigracionZoom = Readonly<{
  id: string;
  inicio: Date;
  fin: Date;
  estado: string;
  proveedorActivo: "GOOGLE_MEET" | "ZOOM" | null;
  conservarGoogleMeet: boolean;
  meetPreparado: boolean;
  meetJoinUrl: string | null;
  cuentaZoomPreferidaId: string | null;
  zoomSincronizado: boolean;
  /** Encuentros futuros de la serie (incluido este). Más de uno bloquea la migración por encuentro. */
  encuentrosSerie?: number;
}>;

export type EstadoVistaPreviaZoom =
  | "MIGRABLE"
  | "EXCEPCION"
  | "SERIE"
  | "YA_ZOOM"
  | "SIN_SALA"
  | "CERCANO"
  | "NO_FUTURO"
  | "REVISAR";

export type FilaVistaPreviaZoom = Readonly<{
  id: string;
  estado: EstadoVistaPreviaZoom;
  hostId: string | null;
}>;

type HostZoom = Readonly<{ id: string; prioridad: number; limiteConcurrente: number | null }>;
type ReservaZoom = Readonly<{ cuentaProveedorId: string; inicio: Date; fin: Date }>;

/** CONFIGURAR_MEET deja un enlace y un evento Calendar operativos; solo faltan ajustes de Meet. */
export function meetPreparadoParaMigracion(evento: Readonly<{
  estadoIntegracion: string;
  operacionPendiente: string | null;
  joinUrl: string | null;
  externalEventId: string | null;
  emailOrganizador: string | null;
}> | null): boolean {
  if (!evento?.joinUrl || !evento.externalEventId || !evento.emailOrganizador) return false;
  return (evento.estadoIntegracion === "SINCRONIZADA" && !evento.operacionPendiente)
    || evento.operacionPendiente === "CONFIGURAR_MEET";
}

export function planificarMigracionZoom(input: Readonly<{
  ahora: Date;
  margenSeguridadHoras: number;
  candidatos: readonly CandidatoMigracionZoom[];
  hosts: readonly HostZoom[];
  reservasZoom: readonly ReservaZoom[];
}>): readonly FilaVistaPreviaZoom[] {
  const limiteCercano = input.ahora.getTime() + Math.max(0, input.margenSeguridadHoras) * 3_600_000;
  const candidatos = input.candidatos.reduce<CandidatoMigracionZoom[]>((ordenados, candidato) => {
    const posicion = ordenados.findIndex((actual) =>
      candidato.inicio.getTime() < actual.inicio.getTime() ||
      (candidato.inicio.getTime() === actual.inicio.getTime() && candidato.id.localeCompare(actual.id) < 0)
    );
    return posicion < 0
      ? [...ordenados, candidato]
      : [...ordenados.slice(0, posicion), candidato, ...ordenados.slice(posicion)];
  }, []);

  return candidatos.reduce<{ filas: FilaVistaPreviaZoom[]; reservas: ReservaZoom[] }>((acumulado, candidato) => {
    const base = { id: candidato.id, hostId: null };
    const agregar = (fila: FilaVistaPreviaZoom, reserva?: ReservaZoom) => ({
      filas: [...acumulado.filas, fila],
      reservas: reserva ? [...acumulado.reservas, reserva] : acumulado.reservas,
    });
    if (candidato.estado !== "PROGRAMADA" || candidato.inicio <= input.ahora || candidato.fin <= candidato.inicio) {
      return agregar({ ...base, estado: "NO_FUTURO" });
    }
    if (candidato.proveedorActivo === "ZOOM") return agregar({ ...base, estado: "YA_ZOOM" });
    if (candidato.conservarGoogleMeet) return agregar({ ...base, estado: "EXCEPCION" });
    // Una serie de Meet comparte un solo enlace: migrarla encuentro por encuentro daría enlaces distintos.
    if ((candidato.encuentrosSerie ?? 1) > 1) return agregar({ ...base, estado: "SERIE" });
    if (candidato.inicio.getTime() <= limiteCercano) return agregar({ ...base, estado: "CERCANO" });
    if (
      candidato.proveedorActivo !== "GOOGLE_MEET" ||
      !candidato.meetPreparado ||
      !candidato.meetJoinUrl ||
      candidato.zoomSincronizado
    ) {
      return agregar({ ...base, estado: "REVISAR" });
    }

    const hostId = elegirCuentaHostParaPeriodos(
      candidato.cuentaZoomPreferidaId,
      input.hosts.map((host) => ({ ...host, limiteConcurrente: 1 })),
      acumulado.reservas,
      [{ inicio: candidato.inicio, fin: candidato.fin }]
    );
    if (!hostId) return agregar({ ...base, estado: "SIN_SALA" });
    return agregar({ id: candidato.id, estado: "MIGRABLE", hostId }, { cuentaProveedorId: hostId, inicio: candidato.inicio, fin: candidato.fin });
  }, { filas: [], reservas: [...input.reservasZoom] }).filas;
}
