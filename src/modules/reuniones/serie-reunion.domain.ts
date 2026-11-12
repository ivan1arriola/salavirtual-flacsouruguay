export type SolicitudDeSerie = Readonly<{
  serieReunionId?: string | null;
  docenteProgramaId: string;
  titulo: string;
  createdAt: Date;
}>;

/**
 * Clave de una serie. Se guarda en Postgres (`ReunionProveedor.serieClave`, auditoría, avisos) y se
 * envía a Zoom, así que NO puede llevar NUL ni otros caracteres de control (Postgres: 22021).
 * Las series antiguas, sin `serieReunionId`, se identifican por `legacy:programa|creada|título`; el
 * título se codifica para que `|` y cualquier carácter no rompan el formato.
 */
export function claveSerieReunion(request: SolicitudDeSerie): string {
  if (request.serieReunionId) {
    return `serie:${request.serieReunionId}`;
  }
  return `legacy:${request.docenteProgramaId}|${request.createdAt.toISOString()}|${encodeURIComponent(request.titulo)}`;
}

export function construirFiltroSerieSolicitud(
  request: Readonly<{
    serieReunionId?: string | null;
    docenteProgramaId: string;
    titulo: string;
    createdAt: Date;
  }>
): { serieReunionId: string } | { docenteProgramaId: string; titulo: string; createdAt: Date } {
  if (request.serieReunionId) {
    return { serieReunionId: request.serieReunionId };
  }
  return {
    docenteProgramaId: request.docenteProgramaId,
    titulo: request.titulo,
    createdAt: request.createdAt
  };
}

/**
 * Inversa de `claveSerieReunion`: la condición de consulta sobre `SolicitudSala` que reúne a los
 * encuentros de una serie. Devuelve `null` si la clave no tiene la forma esperada.
 */
export function filtroSerieDesdeClave(
  clave: string
): { serieReunionId: string } | { docenteProgramaId: string; titulo: string; createdAt: Date } | null {
  if (clave.startsWith("serie:")) {
    const serieReunionId = clave.slice("serie:".length);
    return serieReunionId ? { serieReunionId } : null;
  }
  if (clave.startsWith("legacy:")) {
    const [docenteProgramaId, creada, tituloCodificado, ...resto] = clave.slice("legacy:".length).split("|");
    if (!docenteProgramaId || !creada || tituloCodificado === undefined || resto.length > 0) {
      return null;
    }
    const createdAt = new Date(creada);
    if (Number.isNaN(createdAt.getTime())) {
      return null;
    }
    try {
      return { docenteProgramaId, titulo: decodeURIComponent(tituloCodificado), createdAt };
    } catch {
      return null;
    }
  }
  // Formato anterior, con NUL como separador: puede seguir en una pantalla que ya estaba abierta.
  const [docenteProgramaId, titulo, creada, ...resto] = clave.split("\u0000");
  const createdAt = new Date(creada ?? "");
  if (!docenteProgramaId || titulo === undefined || resto.length > 0 || Number.isNaN(createdAt.getTime())) {
    return null;
  }
  return { docenteProgramaId, titulo, createdAt };
}

/** Lleva cualquier clave recibida (también la antigua con NUL) al formato actual, apto para la base. */
export function normalizarClaveSerie(clave: string): string {
  if (!clave.includes("\u0000")) {
    return clave;
  }
  const filtro = filtroSerieDesdeClave(clave);
  return filtro && "docenteProgramaId" in filtro
    ? claveSerieReunion({ ...filtro, serieReunionId: null })
    : clave;
}

/** Clave de bloqueo asesor de una serie: PostgreSQL no admite el carácter NUL en el texto que se le pasa a `hashtext`. */
export function claveBloqueoSerieMigracion(serieClave: string): string {
  return `flacso-meet:migracion-zoom-serie:${serieClave.replaceAll("\u0000", "|")}`;
}
