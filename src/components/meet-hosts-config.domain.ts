type SearchableMeetHost = Readonly<{
  nombre: string;
  emailOrganizador: string | null;
}>;

export function filterMeetHosts<T extends SearchableMeetHost>(hosts: readonly T[], query: string): T[] {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return [...hosts];

  return hosts.filter((host) =>
    normalize(host.nombre).includes(normalizedQuery)
    || normalize(host.emailOrganizador ?? "").includes(normalizedQuery)
  );
}

export function formatoLimiteConcurrente(limite: number | null | undefined): string {
  if (limite && limite > 1) {
    return `Hasta ${limite} simultáneas`;
  }
  return "1 reunión simultánea (predeterminado)";
}

function normalize(value: string) {
  return value.trim().toLocaleLowerCase("es");
}
