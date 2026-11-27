/** UUID identifica una ejecución, por lo que un encuentro puede tener varios. */
export function uuidsDeOcurrenciasZoom(
  ocurrencias: readonly Readonly<{ uuid: string }>[],
  uuidAnterior: string | null,
): string[] {
  return [
    ...new Set([...ocurrencias.map(({ uuid }) => uuid), ...(uuidAnterior ? [uuidAnterior] : [])]),
  ];
}

type OcurrenciaDeEncuentro = Readonly<{
  eventoProveedorId: string | null;
  cuentaZoomId: string;
  uuid: string;
}>;
type AvisoZoomAdicional = Readonly<{
  tipo: string;
  cuentaZoomId: string;
  uuid: string | null;
  uuids: readonly string[];
  ocurridoAt: Date;
}>;
type ActividadZoom = Readonly<{ tipo: string; ocurridoAt: Date }>;

/**
 * Reparte avisos ya consultados (en una sola consulta) entre los encuentros, solo cuando el UUID de la
 * ejecución coincide dentro de la misma cuenta. Conserva el orden recibido (más recientes primero) y
 * limita por encuentro, para que la actividad de unos no desplace la de otros.
 */
export function agruparActividadPorEncuentro(
  ocurrencias: readonly OcurrenciaDeEncuentro[],
  avisos: readonly AvisoZoomAdicional[],
  limitePorEncuentro: number,
): Map<string, ActividadZoom[]> {
  const idsEncuentros = [
    ...new Set(
      ocurrencias.flatMap(({ eventoProveedorId }) =>
        eventoProveedorId ? [eventoProveedorId] : [],
      ),
    ),
  ];
  const pertenece = (aviso: AvisoZoomAdicional, encuentroId: string) =>
    [...(aviso.uuid ? [aviso.uuid] : []), ...aviso.uuids].some((uuid) =>
      ocurrencias.some(
        (o) =>
          o.eventoProveedorId === encuentroId &&
          o.cuentaZoomId === aviso.cuentaZoomId &&
          o.uuid === uuid,
      ),
    );
  return new Map(
    idsEncuentros
      .map(
        (id) =>
          [
            id,
            avisos
              .filter((aviso) => pertenece(aviso, id))
              .slice(0, limitePorEncuentro)
              .map(({ tipo, ocurridoAt }) => ({ tipo, ocurridoAt })),
          ] as const,
      )
      .filter(([, actividad]) => actividad.length > 0),
  );
}

const ANTICIPO_MS = 45 * 60_000;
const COLA_MS = 6 * 60 * 60_000;

/**
 * Para encuentros que aún no tienen ejecución (UUID) vinculada: asocia avisos por número de reunión y horario,
 * el mismo criterio del vínculo automático. La ventana de cada encuentro llega hasta el comienzo anticipado del
 * siguiente con el mismo número, así que un aviso nunca cae en dos encuentros de una serie.
 */
export function agruparAvisosPorReunionYHorario(
  encuentros: readonly Readonly<{
    eventoProveedorId: string;
    meetingId: string;
    inicio: Date;
    fin: Date;
  }>[],
  avisos: readonly Readonly<{ tipo: string; recursoId: string | null; ocurridoAt: Date }>[],
  limitePorEncuentro: number,
): Map<string, ActividadZoom[]> {
  return new Map(
    encuentros
      .map((e) => {
        const desde = e.inicio.getTime() - ANTICIPO_MS;
        const hasta = Math.min(
          e.fin.getTime() + COLA_MS,
          ...encuentros
            .filter((o) => o.meetingId === e.meetingId && o.inicio.getTime() > e.inicio.getTime())
            .map((o) => o.inicio.getTime() - ANTICIPO_MS),
        );
        return [
          e.eventoProveedorId,
          avisos
            .filter(
              (a) =>
                a.recursoId === e.meetingId &&
                a.ocurridoAt.getTime() >= desde &&
                a.ocurridoAt.getTime() < hasta,
            )
            .slice(0, limitePorEncuentro)
            .map(({ tipo, ocurridoAt }) => ({ tipo, ocurridoAt })),
        ] as const;
      })
      .filter(([, actividad]) => actividad.length > 0),
  );
}
