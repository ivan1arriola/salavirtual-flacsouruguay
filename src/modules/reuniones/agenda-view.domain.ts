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

export function normalizarCodigoReunionBuscado(value: string): string {
  const query = value.trim();
  const meetCode = query.match(/meet\.google\.com\/(?:lookup\/)?([a-z]{3}-[a-z]{4}-[a-z]{3})/i)?.[1];
  return (meetCode ?? query).toLowerCase();
}

export function agruparEncuentrosPorSerie<T extends EncuentroAgrupable>(
  meetings: readonly T[]
): readonly (readonly T[])[] {
  const groups = meetings.reduce<Readonly<Record<string, readonly T[]>>>((result, meeting) => {
    const key = claveSerieReunion(meeting.solicitud);
    return { ...result, [key]: [...(result[key] ?? []), meeting] };
  }, {});
  return Object.values(groups);
}
import { claveSerieReunion } from "./serie-reunion.domain";
