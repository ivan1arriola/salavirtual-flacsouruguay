export type VentanaEventosOperativos = "CALIENTE" | "INTERMEDIA" | "CIERRE";

export type ListarEventosOperativosInput = Readonly<{
  ventana: VentanaEventosOperativos;
  desde: Date;
  hasta: Date;
  limite: number;
}>;

export type EventosOperativosRepositoryPort = Readonly<{
  listarEventosOperativos(input: ListarEventosOperativosInput): Promise<readonly string[]>;
}>;

export type LoteEventosOperativos = Readonly<{
  eventoProveedorIds: readonly string[];
  ventanas: Readonly<{ caliente: number; intermedia: number; cierre: number }>;
}>;

export async function seleccionarLoteEventosOperativosUseCase(
  repository: EventosOperativosRepositoryPort,
  ahora: Date,
  limite = 25
): Promise<LoteEventosOperativos> {
  const cuatroHoras = new Date(ahora.getTime() - 4 * 60 * 60 * 1000);
  const cuarentaYOchoHoras = new Date(ahora.getTime() - 48 * 60 * 60 * 1000);
  const treintaDias = new Date(ahora.getTime() - 30 * 24 * 60 * 60 * 1000);
  const ventanas: readonly Omit<ListarEventosOperativosInput, "limite">[] = [
    { ventana: "CALIENTE", desde: cuatroHoras, hasta: ahora },
    { ventana: "INTERMEDIA", desde: cuarentaYOchoHoras, hasta: cuatroHoras },
    { ventana: "CIERRE", desde: treintaDias, hasta: cuarentaYOchoHoras }
  ];
  const seleccionados: string[] = [];
  const vistos = new Set<string>();
  const conteos = { caliente: 0, intermedia: 0, cierre: 0 };

  for (const ventana of ventanas) {
    const restantes = Math.max(0, limite - seleccionados.length);
    const ids = await repository.listarEventosOperativos({ ...ventana, limite: restantes });
    if (ventana.ventana === "CALIENTE") {
      conteos.caliente = ids.length;
    }
    if (ventana.ventana === "INTERMEDIA") {
      conteos.intermedia = ids.length;
    }
    if (ventana.ventana === "CIERRE") {
      conteos.cierre = ids.length;
    }
    for (const id of ids) {
      if (seleccionados.length >= limite || vistos.has(id)) {
        continue;
      }
      vistos.add(id);
      seleccionados.push(id);
    }
  }

  return { eventoProveedorIds: seleccionados, ventanas: conteos };
}

export async function seleccionarEventosOperativosUseCase(
  repository: EventosOperativosRepositoryPort,
  ahora: Date,
  limite = 25
): Promise<readonly string[]> {
  return (await seleccionarLoteEventosOperativosUseCase(repository, ahora, limite)).eventoProveedorIds;
}
