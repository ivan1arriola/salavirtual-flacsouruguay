type SolicitudDeSerie = Readonly<{
  docenteProgramaId: string;
  titulo: string;
  createdAt: Date;
}>;

export function claveSerieReunion(request: SolicitudDeSerie): string {
  return [
    request.docenteProgramaId,
    request.titulo,
    request.createdAt.toISOString()
  ].join("\u0000");
}
