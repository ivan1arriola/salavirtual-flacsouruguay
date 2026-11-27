import { normalizeMeetLink } from "@/src/modules/conferencias/api";

export type VistaAgenda = "series" | "encuentros";

type EncuentroAgrupable = Readonly<{
  inicioProgramadoAt?: Date;
  finProgramadoAt?: Date;
  solicitud: Readonly<{
    id: string;
    serieReunionId?: string | null;
    docenteProgramaId: string;
    titulo: string;
    createdAt: Date;
  }>;
}>;

export function resolverVistaAgenda(value?: string): VistaAgenda {
  return value === "encuentros" ? "encuentros" : "series";
}

export type PeriodoAgendaValor = "proximas" | "anteriores";

export function resolverPeriodoAgenda(value?: string): PeriodoAgendaValor {
  return value === "anteriores" ? "anteriores" : "proximas";
}

export function normalizarCodigoReunionBuscado(value: string): string {
  return normalizeMeetLink(value)?.code ?? value.trim().toLowerCase();
}

export function agruparEncuentrosPorSerie<T extends EncuentroAgrupable>(
  meetings: readonly T[],
  esHistorial = false,
): readonly (readonly T[])[] {
  const groups = meetings.reduce<Readonly<Record<string, readonly T[]>>>((result, meeting) => {
    const key = claveSerieReunion(meeting.solicitud);
    return { ...result, [key]: [...(result[key] ?? []), meeting] };
  }, {});
  const grouped = Object.values(groups);

  if (!esHistorial) {
    return grouped;
  }

  return ordenarPorRecencia(grouped);
}

function ordenarPorRecencia<T extends EncuentroAgrupable>(
  groups: readonly (readonly T[])[],
): readonly (readonly T[])[] {
  return groups.reduce<readonly (readonly T[])[]>((ordered, group) => {
    const timestamp = fechaMasReciente(group);
    const insertionIndex = ordered.findIndex(
      (candidate) => fechaMasReciente(candidate) < timestamp,
    );

    return insertionIndex < 0
      ? [...ordered, group]
      : [...ordered.slice(0, insertionIndex), group, ...ordered.slice(insertionIndex)];
  }, []);
}

function fechaMasReciente<T extends EncuentroAgrupable>(meetings: readonly T[]): number {
  return Math.max(...meetings.map((meeting) => meeting.inicioProgramadoAt?.getTime() ?? 0));
}

import { claveSerieReunion } from "./serie-reunion.domain";

export type InfoPaginacionAgenda = Readonly<{
  paginaActual: number;
  totalPaginas: number;
  tamanoPagina: number;
  totalElementos: number;
  desdeElemento: number;
  hastaElemento: number;
  tieneAnterior: boolean;
  tieneSiguiente: boolean;
}>;

export function resolverPaginacionAgenda(
  pageParam: string | undefined,
  pageSize = 50,
): Readonly<{ page: number; pageSize: number; skip: number }> {
  const parsed = Number.parseInt(pageParam ?? "1", 10);
  const page = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
  };
}

export function calcularInfoPaginacion(
  totalElementos: number,
  paginaActual: number,
  tamanoPagina = 50,
): InfoPaginacionAgenda {
  const totalPaginas = Math.max(1, Math.ceil(totalElementos / tamanoPagina));
  const page = Math.min(Math.max(1, paginaActual), totalPaginas);
  const desdeElemento = totalElementos === 0 ? 0 : (page - 1) * tamanoPagina + 1;
  const hastaElemento = Math.min(page * tamanoPagina, totalElementos);

  return {
    paginaActual: page,
    totalPaginas,
    tamanoPagina,
    totalElementos,
    desdeElemento,
    hastaElemento,
    tieneAnterior: page > 1,
    tieneSiguiente: page < totalPaginas,
  };
}

export function parsearFechaFiltro(
  dateString: string | undefined,
  isEnd = false,
): string | undefined {
  if (!dateString) {
    return undefined;
  }
  const trimmed = dateString.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return undefined;
  }
  return isEnd ? `${trimmed}T23:59:59.999-03:00` : `${trimmed}T00:00:00.000-03:00`;
}
