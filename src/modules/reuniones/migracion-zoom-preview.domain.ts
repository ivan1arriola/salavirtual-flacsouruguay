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
  "MIGRABLE" | "EXCEPCION" | "SERIE" | "YA_ZOOM" | "SIN_SALA" | "CERCANO" | "NO_FUTURO" | "REVISAR";

export type FilaVistaPreviaZoom = Readonly<{
  id: string;
  estado: EstadoVistaPreviaZoom;
  hostId: string | null;
}>;

type HostZoom = Readonly<{ id: string; prioridad: number; limiteConcurrente: number | null }>;
type ReservaZoom = Readonly<{ cuentaProveedorId: string; inicio: Date; fin: Date }>;

/** CONFIGURAR_MEET deja un enlace y un evento Calendar operativos; solo faltan ajustes de Meet. */
export function meetPreparadoParaMigracion(
  evento: Readonly<{
    estadoIntegracion: string;
    operacionPendiente: string | null;
    joinUrl: string | null;
    externalEventId: string | null;
    emailOrganizador: string | null;
  }> | null
): boolean {
  if (!evento?.joinUrl || !evento.externalEventId || !evento.emailOrganizador) {
    return false;
  }
  return (
    (evento.estadoIntegracion === "SINCRONIZADA" && !evento.operacionPendiente) ||
    evento.operacionPendiente === "CONFIGURAR_MEET"
  );
}

export function planificarMigracionZoom(
  input: Readonly<{
    ahora: Date;
    margenSeguridadHoras: number;
    candidatos: readonly CandidatoMigracionZoom[];
    hosts: readonly HostZoom[];
    reservasZoom: readonly ReservaZoom[];
  }>
): readonly FilaVistaPreviaZoom[] {
  const limiteCercano = input.ahora.getTime() + Math.max(0, input.margenSeguridadHoras) * 3_600_000;
  const candidatos = input.candidatos.reduce<CandidatoMigracionZoom[]>((ordenados, candidato) => {
    const posicion = ordenados.findIndex(
      (actual) =>
        candidato.inicio.getTime() < actual.inicio.getTime() ||
        (candidato.inicio.getTime() === actual.inicio.getTime() && candidato.id.localeCompare(actual.id) < 0)
    );
    return posicion < 0
      ? [...ordenados, candidato]
      : [...ordenados.slice(0, posicion), candidato, ...ordenados.slice(posicion)];
  }, []);

  return candidatos.reduce<{ filas: FilaVistaPreviaZoom[]; reservas: ReservaZoom[] }>(
    (acumulado, candidato) => {
      const base = { id: candidato.id, hostId: null };
      const agregar = (fila: FilaVistaPreviaZoom, reserva?: ReservaZoom) => ({
        filas: [...acumulado.filas, fila],
        reservas: reserva ? [...acumulado.reservas, reserva] : acumulado.reservas
      });
      if (
        candidato.estado !== "PROGRAMADA" ||
        candidato.inicio <= input.ahora ||
        candidato.fin <= candidato.inicio
      ) {
        return agregar({ ...base, estado: "NO_FUTURO" });
      }
      if (candidato.proveedorActivo === "ZOOM") {
        return agregar({ ...base, estado: "YA_ZOOM" });
      }
      if (candidato.conservarGoogleMeet) {
        return agregar({ ...base, estado: "EXCEPCION" });
      }
      // Una serie de Meet comparte un solo enlace: migrarla encuentro por encuentro daría enlaces distintos.
      if ((candidato.encuentrosSerie ?? 1) > 1) {
        return agregar({ ...base, estado: "SERIE" });
      }
      if (candidato.inicio.getTime() <= limiteCercano) {
        return agregar({ ...base, estado: "CERCANO" });
      }
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
      if (!hostId) {
        return agregar({ ...base, estado: "SIN_SALA" });
      }
      return agregar(
        { id: candidato.id, estado: "MIGRABLE", hostId },
        { cuentaProveedorId: hostId, inicio: candidato.inicio, fin: candidato.fin }
      );
    },
    { filas: [], reservas: [...input.reservasZoom] }
  ).filas;
}

// --- Migración por serie ----------------------------------------------------------
// Una serie de Meet comparte un solo enlace. La unidad de migración es la serie completa:
// un solo anfitrión Zoom con sala libre en TODOS los horarios y una sola reunión compartida.

export type EncuentroSerieMigracionZoom = Readonly<{
  id: string;
  inicio: Date;
  fin: Date;
  estado: string;
  proveedorActivo: "GOOGLE_MEET" | "ZOOM" | null;
  conservarGoogleMeet: boolean;
  meetPreparado: boolean;
  meetJoinUrl: string | null;
  zoomSincronizado: boolean;
  /** Reunión Zoom compartida a la que ya apunta un encuentro que está en Zoom. */
  reunionCompartidaId: string | null;
}>;

export type SerieMigracionZoom = Readonly<{
  serieClave: string;
  encuentros: readonly EncuentroSerieMigracionZoom[];
  /** Sala preferida; si hay encuentros ya en Zoom, es la sala de su reunión compartida (y la única elegible). */
  cuentaZoomPreferidaId: string | null;
}>;

export type FilaSerieMigracionZoom = Readonly<{
  serieClave: string;
  /** Encuentros que se migrarán: los futuros que hoy están en Meet. */
  encuentroIds: readonly string[];
  estado: EstadoVistaPreviaZoom;
  hostId: string | null;
}>;

type ReservaZoomSerie = ReservaZoom & Readonly<{ instanciaId?: string }>;

export function planificarMigracionZoomPorSerie(
  input: Readonly<{
    ahora: Date;
    margenSeguridadHoras: number;
    series: readonly SerieMigracionZoom[];
    hosts: readonly HostZoom[];
    reservasZoom: readonly ReservaZoomSerie[];
  }>
): readonly FilaSerieMigracionZoom[] {
  const limiteCercano = input.ahora.getTime() + Math.max(0, input.margenSeguridadHoras) * 3_600_000;
  const inicioMasTemprano = (serie: SerieMigracionZoom) =>
    serie.encuentros.reduce(
      (menor, { inicio }) => Math.min(menor, inicio.getTime()),
      Number.POSITIVE_INFINITY
    );

  const ordenadas = input.series.reduce<SerieMigracionZoom[]>((acumuladas, serie) => {
    const posicion = acumuladas.findIndex(
      (actual) =>
        inicioMasTemprano(serie) < inicioMasTemprano(actual) ||
        (inicioMasTemprano(serie) === inicioMasTemprano(actual) &&
          serie.serieClave.localeCompare(actual.serieClave) < 0)
    );
    return posicion < 0
      ? [...acumuladas, serie]
      : [...acumuladas.slice(0, posicion), serie, ...acumuladas.slice(posicion)];
  }, []);

  return ordenadas.reduce<{ filas: FilaSerieMigracionZoom[]; reservas: ReservaZoomSerie[] }>(
    (acumulado, serie) => {
      const agregar = (fila: FilaSerieMigracionZoom, reservas: readonly ReservaZoomSerie[] = []) => ({
        filas: [...acumulado.filas, fila],
        reservas: [...acumulado.reservas, ...reservas]
      });
      const propios = new Set(serie.encuentros.map(({ id }) => id));
      const futuros = serie.encuentros.filter(
        (encuentro) =>
          encuentro.estado === "PROGRAMADA" &&
          encuentro.inicio > input.ahora &&
          encuentro.fin > encuentro.inicio
      );
      const aMigrar = futuros.filter(({ proveedorActivo }) => proveedorActivo !== "ZOOM");
      const enZoom = futuros.filter(({ proveedorActivo }) => proveedorActivo === "ZOOM");
      const base = { serieClave: serie.serieClave, hostId: null };
      const sinEncuentros = { ...base, encuentroIds: [] as readonly string[] };
      const conEncuentros = { ...base, encuentroIds: aMigrar.map(({ id }) => id) };

      if (futuros.length === 0) {
        return agregar({ ...sinEncuentros, estado: "NO_FUTURO" });
      }
      if (aMigrar.length === 0) {
        return agregar({ ...sinEncuentros, estado: "YA_ZOOM" });
      }

      const conExcepcion = aMigrar.filter(({ conservarGoogleMeet }) => conservarGoogleMeet).length;
      if (conExcepcion === aMigrar.length) {
        return agregar({ ...conEncuentros, estado: "EXCEPCION" });
      }
      if (conExcepcion > 0) {
        return agregar({ ...conEncuentros, estado: "REVISAR" });
      }

      if (futuros.some(({ inicio }) => inicio.getTime() <= limiteCercano)) {
        return agregar({ ...conEncuentros, estado: "CERCANO" });
      }

      const compartida =
        enZoom.length === 0 ||
        (Boolean(enZoom[0].reunionCompartidaId) &&
          enZoom.every(({ reunionCompartidaId }) => reunionCompartidaId === enZoom[0].reunionCompartidaId));
      const sinPreparar = aMigrar.some(
        (encuentro) => !encuentro.meetPreparado || !encuentro.meetJoinUrl || encuentro.zoomSincronizado
      );
      if (!compartida || sinPreparar) {
        return agregar({ ...conEncuentros, estado: "REVISAR" });
      }

      const hostsElegibles =
        enZoom.length > 0 ? input.hosts.filter(({ id }) => id === serie.cuentaZoomPreferidaId) : input.hosts;
      const periodos = aMigrar.map(({ inicio, fin }) => ({ inicio, fin }));
      const reservasAjenas = acumulado.reservas.filter(
        ({ instanciaId }) => !instanciaId || !propios.has(instanciaId)
      );
      const hostId = elegirCuentaHostParaPeriodos(
        serie.cuentaZoomPreferidaId,
        hostsElegibles.map((host) => ({ ...host, limiteConcurrente: 1 })),
        reservasAjenas,
        periodos
      );
      if (!hostId) {
        return agregar({ ...conEncuentros, estado: "SIN_SALA" });
      }
      return agregar(
        { ...conEncuentros, estado: "MIGRABLE", hostId },
        periodos.map((periodo) => ({ cuentaProveedorId: hostId, ...periodo }))
      );
    },
    { filas: [], reservas: [...input.reservasZoom] }
  ).filas;
}
