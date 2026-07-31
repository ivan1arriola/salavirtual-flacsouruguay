export type TipoArtefactoMeet =
  | "GRABACION"
  | "LISTA_ASISTENCIA"
  | "TRANSCRIPCION"
  | "NOTAS"
  | "OTRO";

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
}>;

const ETIQUETAS: Readonly<Record<TipoArtefactoMeet, string>> = {
  GRABACION: "video",
  LISTA_ASISTENCIA: "lista-asistencia",
  TRANSCRIPCION: "transcripcion",
  NOTAS: "notas",
  OTRO: "archivo"
};

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

export function escaparCsv(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

export function crearCsvAsistencia(filas: readonly FilaAsistenciaMeet[]): string {
  const header = ["Nombre", "Tipo", "Ingreso", "Salida", "Minutos"];
  const body = filas.map((fila) => [
    fila.nombre,
    fila.tipo,
    fila.inicio,
    fila.fin,
    minutosEntre(fila.inicio, fila.fin)
  ]);
  return [header, ...body]
    .map((row) => row.map((value) => escaparCsv(String(value))).join(","))
    .join("\r\n");
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
