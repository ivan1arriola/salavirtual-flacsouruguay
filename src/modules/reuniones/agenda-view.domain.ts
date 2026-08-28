export type VistaAgenda = "series" | "encuentros";

type EncuentroAgrupable = Readonly<{
  inicioProgramadoAt?: Date;
  finProgramadoAt?: Date;
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
  const grouped = Object.values(groups);
  const now = new Date();
  const esHistorial = meetings.length > 0 && meetings.every(
    (meeting) => meeting.finProgramadoAt instanceof Date && meeting.finProgramadoAt < now
  );

  if (!esHistorial) return grouped;

  return [...grouped].sort((a, b) => fechaMasReciente(b) - fechaMasReciente(a));
}

function fechaMasReciente<T extends EncuentroAgrupable>(meetings: readonly T[]): number {
  return Math.max(...meetings.map((meeting) => meeting.inicioProgramadoAt?.getTime() ?? 0));
}

import { claveSerieReunion } from "./serie-reunion.domain";
