export type VistaAgenda = "series" | "encuentros";

type EncuentroAgrupable = Readonly<{
  solicitud: Readonly<{
    id: string;
    docenteProgramaId: string;
    titulo: string;
    createdAt: Date;
  }>;
}>;

export function resolverVistaAgenda(value?: string): VistaAgenda {
  return value === "encuentros" ? "encuentros" : "series";
}

export function agruparEncuentrosPorSerie<T extends EncuentroAgrupable>(
  meetings: readonly T[]
): readonly (readonly T[])[] {
  const groups = meetings.reduce<Readonly<Record<string, readonly T[]>>>((result, meeting) => {
    const request = meeting.solicitud;
    const key = [
      request.docenteProgramaId,
      request.titulo,
      request.createdAt.toISOString()
    ].join("\u0000");
    return { ...result, [key]: [...(result[key] ?? []), meeting] };
  }, {});
  return Object.values(groups);
}
