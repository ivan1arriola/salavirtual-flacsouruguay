export type TipoArtefactoMeet =
  | "GRABACION"
  | "LISTA_ASISTENCIA"
  | "TRANSCRIPCION"
  | "NOTAS"
  | "OTRO";

export const TIPOS_ARTEFACTO_SINCRONIZABLES = Object.freeze([
  "GRABACION",
  "TRANSCRIPCION",
  "LISTA_ASISTENCIA",
  "NOTAS"
] as const);

export type DatosCarpetaReunion = Readonly<{
  titulo: string;
  inicio: Date;
  timezone: string;
}>;

export type DatosNombreArtefacto = DatosCarpetaReunion & Readonly<{
  codigoReunion: string;
  tipo: TipoArtefactoMeet;
  indice: number;
  extension?: string;
}>;

export type FilaAsistenciaMeet = Readonly<{
  nombre: string;
  tipo: "CUENTA_GOOGLE" | "ANONIMO" | "TELEFONO";
  inicio: string;
  fin: string;
  conferencia?: string;
  participanteId?: string;
  sesionId?: string;
  /** Correo atribuido por coincidencia exacta de ingreso/egreso con Reports (nunca por nombre). */
  correoVerificado?: string;
}>;

export type RegistroConferenciaMeet = Readonly<{
  name: string;
  startTime: string;
  endTime?: string;
}>;

export type SesionParticipanteMeet = Readonly<{
  startTime: string;
  endTime?: string;
}>;

const ETIQUETAS: Readonly<Record<TipoArtefactoMeet, string>> = {
  GRABACION: "video",
  LISTA_ASISTENCIA: "lista-asistencia",
  TRANSCRIPCION: "transcripcion",
  NOTAS: "notas",
  OTRO: "archivo"
};

const ETIQUETAS_UI: Readonly<Record<TipoArtefactoMeet, string>> = {
  GRABACION: "Grabación",
  LISTA_ASISTENCIA: "Asistencia",
  TRANSCRIPCION: "Transcripción",
  NOTAS: "Notas de Meet",
  OTRO: "Archivo"
};

export function etiquetaTipoArtefactoMeet(tipo: TipoArtefactoMeet): string {
  return ETIQUETAS_UI[tipo];
}

export function nombreCarpetaReunion(datos: DatosCarpetaReunion): string {
  return `${fechaLocalToken(datos.inicio, datos.timezone)} - ${textoSeguro(datos.titulo)}`;
}

export function nombreArchivoReunion(datos: DatosNombreArtefacto): string {
  const fecha = fechaLocalToken(datos.inicio, datos.timezone);
  const codigo = textoSeguro(datos.codigoReunion).replaceAll(" ", "-");
  const titulo = textoSeguro(datos.titulo).replaceAll(" ", "-").slice(0, 48);
  const indice = String(datos.indice).padStart(2, "0");
  const extension = extensionSegura(datos.extension);
  return `${fecha}_${codigo}_${ETIQUETAS[datos.tipo]}_${indice}_${titulo}${extension}`;
}

export function elegirConferenciaMeet(
  records: readonly RegistroConferenciaMeet[],
  inicio: Date,
  fin: Date
): RegistroConferenciaMeet | null {
  if (records.length === 0) return null;
  const inicioMs = inicio.getTime();
  const finMs = fin.getTime();
  const superpuestas = records.filter((record) => {
    const recordStart = Date.parse(record.startTime);
    const recordEnd = record.endTime ? Date.parse(record.endTime) : Number.POSITIVE_INFINITY;
    return recordStart <= finMs && recordEnd >= inicioMs;
  });
  const candidates = superpuestas.length > 0 ? superpuestas : records;

  if (superpuestas.length > 0) {
    return superpuestas.reduce<RegistroConferenciaMeet | null>((selected, current) => {
      if (!selected) return current;
      const currentStart = Date.parse(current.startTime);
      const currentEnd = current.endTime ? Date.parse(current.endTime) : finMs;
      const currentOverlap = Math.max(0, Math.min(currentEnd, finMs) - Math.max(currentStart, inicioMs));

      const selectedStart = Date.parse(selected.startTime);
      const selectedEnd = selected.endTime ? Date.parse(selected.endTime) : finMs;
      const selectedOverlap = Math.max(0, Math.min(selectedEnd, finMs) - Math.max(selectedStart, inicioMs));

      if (currentOverlap !== selectedOverlap) {
        return currentOverlap > selectedOverlap ? current : selected;
      }

      const currentDuration = Math.max(0, currentEnd - currentStart);
      const selectedDuration = Math.max(0, selectedEnd - selectedStart);
      if (currentDuration !== selectedDuration) {
        return currentDuration > selectedDuration ? current : selected;
      }

      const currentDistance = Math.abs(currentStart - inicioMs);
      const selectedDistance = Math.abs(selectedStart - inicioMs);
      return currentDistance < selectedDistance ? current : selected;
    }, null);
  }

  return candidates.reduce<RegistroConferenciaMeet | null>((selected, current) => {
    if (!selected) return current;
    const currentDistance = Math.abs(Date.parse(current.startTime) - inicioMs);
    const selectedDistance = Math.abs(Date.parse(selected.startTime) - inicioMs);
    return currentDistance < selectedDistance ? current : selected;
  }, null);
}

export function asistenciaMeetCompleta(
  sesionesPorParticipante: readonly (readonly SesionParticipanteMeet[])[],
  conferenciaFinalizada = false
): boolean {
  if (sesionesPorParticipante.length === 0) return false;
  if (conferenciaFinalizada) {
    return sesionesPorParticipante.some((sesiones) => sesiones.length > 0);
  }
  return sesionesPorParticipante.every(
    (sesiones) => sesiones.length > 0 && sesiones.every(({ endTime }) => Boolean(endTime))
  );
}

export function crearHtmlAsistencia(filas: readonly FilaAsistenciaMeet[]): string {
  const rows = filas.map((fila) => `
    <tr>
      <td>${escaparHtml(fila.nombre)}</td>
      <td>${escaparHtml(fila.tipo)}</td>
      <td>${escaparHtml(fila.inicio)}</td>
      <td>${escaparHtml(fila.fin)}</td>
      <td>${minutosEntre(fila.inicio, fila.fin)}</td>
    </tr>`).join("");
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Lista de asistencia</title>
  <style>
    body { font-family: Arial, sans-serif; color: #18212f; }
    h1 { color: #163970; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #cfd7e2; padding: 8px; text-align: left; }
    th { background: #eaf1f8; }
  </style>
</head>
<body>
  <h1>Lista de asistencia</h1>
  <p>Total de registros: ${filas.length}</p>
  <table>
    <thead><tr><th>Nombre</th><th>Tipo</th><th>Ingreso</th><th>Salida</th><th>Minutos</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;
}

function fechaLocalToken(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const value = (type: "year" | "month" | "day") =>
    parts.find((part) => part.type === type)?.value ?? "00";
  return `${value("year")}${value("month")}${value("day")}`;
}

function textoSeguro(value: string): string {
  const normalized = value.trim().replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ");
  return normalized.replaceAll("/", "-").replaceAll("\\", "-") || "sin nombre";
}

function extensionSegura(extension: string | undefined): string {
  const clean = (extension ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  return clean ? `.${clean}` : "";
}

function minutosEntre(inicio: string, fin: string): number {
  const milliseconds = Date.parse(fin) - Date.parse(inicio);
  return Math.max(0, Math.round(milliseconds / 60_000));
}

function escaparHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

