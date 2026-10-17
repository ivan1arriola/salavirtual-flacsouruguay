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
