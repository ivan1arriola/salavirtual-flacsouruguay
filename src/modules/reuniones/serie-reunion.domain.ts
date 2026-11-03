export type SolicitudDeSerie = Readonly<{
  serieReunionId?: string | null;
  docenteProgramaId: string;
  titulo: string;
  createdAt: Date;
}>;

export function claveSerieReunion(request: SolicitudDeSerie): string {
  if (request.serieReunionId) {
    return `serie:${request.serieReunionId}`;
  }
  return [
    request.docenteProgramaId,
    request.titulo,
    request.createdAt.toISOString()
  ].join("\u0000");
}

export function construirFiltroSerieSolicitud(request: Readonly<{
  serieReunionId?: string | null;
  docenteProgramaId: string;
  titulo: string;
  createdAt: Date;
}>): { serieReunionId: string } | { docenteProgramaId: string; titulo: string; createdAt: Date } {
  if (request.serieReunionId) {
    return { serieReunionId: request.serieReunionId };
  }
  return {
    docenteProgramaId: request.docenteProgramaId,
    titulo: request.titulo,
    createdAt: request.createdAt,
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
  const [docenteProgramaId, titulo, creada, ...resto] = clave.split("\u0000");
  const createdAt = new Date(creada ?? "");
  if (!docenteProgramaId || titulo === undefined || resto.length > 0 || Number.isNaN(createdAt.getTime())) return null;
  return { docenteProgramaId, titulo, createdAt };
}

/** Clave de bloqueo asesor de una serie: PostgreSQL no admite el carácter NUL en el texto que se le pasa a `hashtext`. */
export function claveBloqueoSerieMigracion(serieClave: string): string {
  return `flacso-meet:migracion-zoom-serie:${serieClave.replaceAll("\u0000", "|")}`;
}
