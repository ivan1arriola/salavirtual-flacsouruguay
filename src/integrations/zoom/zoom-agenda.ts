import { createHash } from "node:crypto";

type Objeto = Record<string, unknown>;
const objeto = (valor: unknown): Objeto | null =>
  valor !== null && typeof valor === "object" && !Array.isArray(valor) ? (valor as Objeto) : null;
const texto = (valor: unknown): string | null =>
  typeof valor === "string" && valor.trim() ? valor.trim() : null;
const identificador = (valor: unknown): string | null =>
  typeof valor === "number" && Number.isSafeInteger(valor) ? String(valor) : texto(valor);
const fecha = (valor: unknown): Date | null => {
  const date = typeof valor === "string" ? new Date(valor) : null;
  return date && Number.isFinite(date.getTime()) ? date : null;
};
const minutos = (valor: unknown): number | null =>
  typeof valor === "number" && Number.isFinite(valor) && valor > 0 && valor <= 24 * 60
    ? valor
    : null;

/** Ocurrencia de una reunión tal como la informa Zoom; la duración puede faltar en avisos parciales. */
export type OcurrenciaZoomInformada = Readonly<{
  ocurrenciaZoomId: string;
  inicio: Date;
  duracionMin: number | null;
}>;

export type MovimientoReunionZoom = Readonly<{
  huella: string;
  tipo: "created" | "updated" | "deleted";
  cuentaZoomId: string;
  meetingId: string;
  anfitrionZoomId: string;
  tema: string | null;
  /** Reuniones instantáneas (1) y sin horario fijo (3) nunca ocupan la agenda. */
  sinHorarioFijo: boolean;
  /** Duración informada aunque no venga el inicio (una actualización solo de duración). */
  duracionMin: number | null;
  /** Vacío cuando el aviso no trae horario (p. ej. una actualización de otro campo). */
  ocurrencias: readonly OcurrenciaZoomInformada[];
  /** En un borrado parcial, solo estas ocurrencias; vacío = toda la reunión. */
  ocurrenciasEliminadas: readonly string[];
}>;

/** Horario(s) de un objeto de reunión de Zoom: `occurrences` si es recurrente; si no, su start_time. */
export function ocurrenciasDeObjetoZoom(reunion: Objeto): readonly OcurrenciaZoomInformada[] {
  const lista = Array.isArray(reunion["occurrences"]) ? reunion["occurrences"] : null;
  if (lista) {
    return lista.flatMap((valor): OcurrenciaZoomInformada[] => {
      const o = objeto(valor);
      const inicio = fecha(o?.["start_time"]);
      const id = identificador(o?.["occurrence_id"]);
      // Una ocurrencia ya borrada no ocupa la agenda.
      return o && inicio && id && o["status"] !== "deleted"
        ? [
            {
              ocurrenciaZoomId: id,
              inicio,
              duracionMin: minutos(o["duration"]) ?? minutos(reunion["duration"]),
            },
          ]
        : [];
    });
  }
  const inicio = fecha(reunion["start_time"]);
  return inicio
    ? [{ ocurrenciaZoomId: "", inicio, duracionMin: minutos(reunion["duration"]) }]
    : [];
}

const TIPOS_MOVIMIENTO: Readonly<Record<string, MovimientoReunionZoom["tipo"]>> = {
  "meeting.created": "created",
  "meeting.updated": "updated",
  "meeting.deleted": "deleted",
};

/** Solo identificadores, tema y horarios: nunca participantes, enlaces ni contraseñas. */
export function interpretarMovimientoReunionZoom(cuerpo: string): MovimientoReunionZoom | null {
  const raiz = objeto(JSON.parse(cuerpo) as unknown);
  const evento = texto(raiz?.["event"]);
  const tipo = TIPOS_MOVIMIENTO[evento ?? ""] ?? null;
  const payload = objeto(raiz?.["payload"]);
  const reunion = objeto(payload?.["object"]);
  const cuentaZoomId = texto(payload?.["account_id"]);
  const meetingId = identificador(reunion?.["id"]);
  const anfitrionZoomId = texto(reunion?.["host_id"]);
  if (!tipo || !reunion || !cuentaZoomId || !meetingId || !anfitrionZoomId) {
    return null;
  }
  const tipoReunion = typeof reunion["type"] === "number" ? reunion["type"] : null;
  const ocurrencias = ocurrenciasDeObjetoZoom(reunion);
  return {
    huella: createHash("sha256").update(cuerpo).digest("hex"),
    tipo,
    cuentaZoomId,
    meetingId,
    anfitrionZoomId,
    tema: texto(reunion["topic"])?.slice(0, 250) ?? null,
    duracionMin: minutos(reunion["duration"]),
    sinHorarioFijo: tipoReunion === 1 || tipoReunion === 3,
    ocurrencias: tipo === "deleted" ? [] : ocurrencias,
    ocurrenciasEliminadas:
      tipo === "deleted" && Array.isArray(reunion["occurrences"])
        ? (reunion["occurrences"] as unknown[]).flatMap((valor) => {
            const id = identificador(objeto(valor)?.["occurrence_id"]);
            return id ? [id] : [];
          })
        : [],
  };
}
