import type { HashZoom, ReferenciaOcurrenciaZoom } from "../domain";
import type { ArchivoReclamadoZoom, ArchivoStoragePort } from "../ports";

const ZONA_NEGOCIO = "America/Montevideo";
const LARGO_TITULO_MAXIMO = 100;

function partesFechaLocal(fecha: Date): Readonly<{ anio: string; mes: string; dia: string }> {
  const partes = new Intl.DateTimeFormat("en-CA", { timeZone: ZONA_NEGOCIO, year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(fecha);
  const valor = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "00";
  return { anio: valor("year"), mes: valor("month"), dia: valor("day") };
}

/** Nombre legible y seguro para Drive: sin separadores ni controles, con fecha local y sufijo estable del UUID. */
export function nombreCarpetaOcurrenciaZoom(
  ocurrencia: Pick<ReferenciaOcurrenciaZoom, "titulo" | "uuid" | "inicioRealAt">
): string {
  const { anio, mes, dia } = partesFechaLocal(ocurrencia.inicioRealAt);
  const titulo = ocurrencia.titulo
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f/\\]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, LARGO_TITULO_MAXIMO)
    .trim();
  const sufijo = ocurrencia.uuid.replace(/[^A-Za-z0-9]/g, "").slice(-8).padStart(8, "0");
  return `${titulo === "" ? "Reunión Zoom" : titulo} ${anio}-${mes}-${dia} [${sufijo}]`;
}

/** Carpeta AAAA/MM bajo `raiz`, creada de forma idempotente; no crea la carpeta de la ocurrencia. */
export async function resolverCarpetaMesZoom(
  storage: Pick<ArchivoStoragePort, "asegurarCarpeta">,
  hash: HashZoom,
  inicioRealAt: Date,
  raiz: string
): Promise<string> {
  const { anio, mes } = partesFechaLocal(inicioRealAt);
  const porAnio = await storage.asegurarCarpeta(hash(`zoom-carpeta|${raiz}|${anio}`), anio, raiz);
  return storage.asegurarCarpeta(hash(`zoom-carpeta|${porAnio}|${mes}`), mes, porAnio);
}

/**
 * Resuelve AAAA/MM/ocurrencia bajo la raíz que corresponda. Los encuentros vinculados heredan los
 * permisos de la carpeta de grabaciones; los históricos sin vincular van SOLO a la carpeta de
 * administración, y sin ella no hay destino (jamás se usa la raíz legible por docentes).
 */
export async function resolverCarpetaDestinoZoom(
  storage: Pick<ArchivoStoragePort, "asegurarCarpeta">,
  hash: HashZoom,
  archivo: Pick<ArchivoReclamadoZoom, "eventoProveedorId" | "ocurrencia">,
  raices: Readonly<{ raizVinculados: string | null; raizHistorico: string | null }>
): Promise<string | null> {
  const raiz = archivo.eventoProveedorId !== null ? raices.raizVinculados : raices.raizHistorico;
  if (!raiz) return null;
  const porMes = await resolverCarpetaMesZoom(storage, hash, archivo.ocurrencia.inicioRealAt, raiz);
  return storage.asegurarCarpeta(
    hash(`zoom-carpeta|ocurrencia|${archivo.ocurrencia.cuentaZoomId}|${archivo.ocurrencia.uuid}|${raiz}`),
    nombreCarpetaOcurrenciaZoom(archivo.ocurrencia),
    porMes
  );
}
