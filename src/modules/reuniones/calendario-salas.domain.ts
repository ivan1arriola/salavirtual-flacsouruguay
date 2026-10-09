export type EventoGoogleCalendarioSala = Readonly<{
  id: string;
  titulo: string;
  inicio: Date;
  fin: Date;
  enlaceMeet?: string;
}>;

export type EncuentroSalaVirtualCalendario = Readonly<{
  instanciaId: string;
  solicitudId: string;
  externalEventId: string | null;
  titulo: string;
  inicio: Date;
  fin: Date;
  estadoIntegracion: string;
  enlaceMeet?: string | null;
}>;

export type EventoCalendarioSala = Readonly<{
  id: string;
  titulo: string;
  inicio: Date;
  fin: Date;
  enlaceMeet?: string | null;
  estado: "ADMINISTRADA" | "EXTERNA" | "SIN_EVENTO_GOOGLE";
  instanciaId?: string;
  solicitudId?: string;
  estadoIntegracion?: string;
}>;

export function reconciliarEventosCalendarioSalas(
  eventosGoogle: readonly EventoGoogleCalendarioSala[],
  encuentrosSalaVirtual: readonly EncuentroSalaVirtualCalendario[]
): readonly EventoCalendarioSala[] {
  const encuentrosPorEvento = new Map(
    encuentrosSalaVirtual
      .filter((encuentro): encuentro is EncuentroSalaVirtualCalendario & { externalEventId: string } => Boolean(encuentro.externalEventId))
      .map((encuentro) => [encuentro.externalEventId, encuentro])
  );
  const reconciliados = eventosGoogle.map((evento) => {
    const encuentro = encuentrosPorEvento.get(evento.id);
    if (!encuentro) {
      return { ...evento, estado: "EXTERNA" as const };
    }
    return {
      id: evento.id,
      titulo: evento.titulo,
      inicio: evento.inicio,
      fin: evento.fin,
      enlaceMeet: evento.enlaceMeet ?? encuentro.enlaceMeet,
      estado: "ADMINISTRADA" as const,
      instanciaId: encuentro.instanciaId,
      solicitudId: encuentro.solicitudId,
      estadoIntegracion: encuentro.estadoIntegracion
    };
  });
  const encontrados = reconciliados.flatMap(({ instanciaId }) => instanciaId ? [instanciaId] : []);
  const sinEventoGoogle = encuentrosSalaVirtual
    .filter((encuentro) => !encontrados.includes(encuentro.instanciaId))
    .map((encuentro) => ({
      id: `local:${encuentro.instanciaId}`,
      titulo: encuentro.titulo,
      inicio: encuentro.inicio,
      fin: encuentro.fin,
      enlaceMeet: encuentro.enlaceMeet,
      estado: "SIN_EVENTO_GOOGLE" as const,
      instanciaId: encuentro.instanciaId,
      solicitudId: encuentro.solicitudId,
      estadoIntegracion: encuentro.estadoIntegracion
    }));

  return ordenarPorInicio([...reconciliados, ...sinEventoGoogle]);
}

function ordenarPorInicio(events: readonly EventoCalendarioSala[]): readonly EventoCalendarioSala[] {
  return events.reduce<readonly EventoCalendarioSala[]>((ordered, event) => {
    const index = ordered.findIndex(({ inicio }) => inicio.getTime() > event.inicio.getTime());
    return index === -1
      ? [...ordered, event]
      : [...ordered.slice(0, index), event, ...ordered.slice(index)];
  }, []);
}
