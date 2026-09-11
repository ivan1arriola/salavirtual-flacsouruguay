export type ProgramFilterState = "todos" | "activos" | "inactivos";

type SearchableProgram = Readonly<{
  nombre: string;
  codigo: string | null;
  activo: boolean;
  unidadAcademica: Readonly<{ nombre: string }> | null;
}>;

export function filterPrograms<T extends SearchableProgram>(
  programs: readonly T[],
  filters: Readonly<{ query: string; state: ProgramFilterState }>
): T[] {
  const query = normalize(filters.query);

  return programs.filter((program) => {
    const matchesState = filters.state === "todos"
      || (filters.state === "activos" && program.activo)
      || (filters.state === "inactivos" && !program.activo);
    if (!matchesState) return false;
    if (!query) return true;

    return [program.nombre, program.codigo ?? "", program.unidadAcademica?.nombre ?? ""]
      .some((value) => normalize(value).includes(query));
  });
}

function normalize(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}
