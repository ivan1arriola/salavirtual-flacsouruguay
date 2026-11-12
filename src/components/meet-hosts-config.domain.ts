type SearchableMeetHost = Readonly<{
  nombre: string;
  emailOrganizador: string | null;
}>;

export function filterMeetHosts<T extends SearchableMeetHost>(hosts: readonly T[], query: string): T[] {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) {
    return [...hosts];
  }

  return hosts.filter(
    (host) =>
      normalize(host.nombre).includes(normalizedQuery) ||
      normalize(host.emailOrganizador ?? "").includes(normalizedQuery)
  );
}

export function formatoLimiteConcurrente(limite: number | null | undefined): string {
  if (limite && limite > 1) {
    return `Hasta ${limite} simultáneas`;
  }
  return "1 reunión simultánea (predeterminado)";
}

/** «Fuera del grupo (N reuniones futuras)» para una cuenta Zoom que salió del grupo; `null` si pertenece. */
export function avisoFueraDelGrupo(
  host: Readonly<{
    fueraDelGrupoAt?: string | null;
    reunionesFuturas?: number;
  }>
): string | null {
  if (!host.fueraDelGrupoAt) {
    return null;
  }
  const cantidad = host.reunionesFuturas ?? 0;
  if (cantidad <= 0) {
    return "Fuera del grupo";
  }
  return `Fuera del grupo (${cantidad} ${cantidad === 1 ? "reunión futura" : "reuniones futuras"})`;
}

function normalize(value: string) {
  return value.trim().toLocaleLowerCase("es");
}
