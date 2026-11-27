import { etiquetaEventoZoom } from "@/src/integrations/zoom/zoom-eventos-catalogo";

export type ActividadEncuentroZoom = Readonly<{
  eventos: readonly Evento[];
  /** Sin ocurrencia de Zoom vinculada: no se puede saber si hubo actividad. */
  sinAsociar?: boolean;
  /** Asociados por número de reunión y horario (el encuentro aún no tiene ejecución vinculada). */
  porHorario?: boolean;
}>;

type Evento = Readonly<{ tipo: string; ocurridoAt: string }>;

const fecha = new Intl.DateTimeFormat("es-UY", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Montevideo",
});

function Contenido({ encuentro }: Readonly<{ encuentro: ActividadEncuentroZoom }>) {
  if (encuentro.eventos.length === 0) {
    return encuentro.sinAsociar ? (
      <p>Todavía no se puede asociar actividad de Zoom a este encuentro.</p>
    ) : (
      <p>Sin actividad registrada</p>
    );
  }
  return (
    <>
      {encuentro.porHorario ? <p>Asociados por número de reunión y horario.</p> : null}
      <ul>
        {encuentro.eventos.map((evento, indice) => (
          <li key={`${evento.tipo}-${evento.ocurridoAt}-${indice}`}>
            {etiquetaEventoZoom(evento.tipo)} · {fecha.format(new Date(evento.ocurridoAt))}
          </li>
        ))}
      </ul>
    </>
  );
}

/** Actividad de Zoom de un solo encuentro: va dentro de su tarjeta, no a nivel de serie. */
export function ZoomActividadEncuentro({
  actividad,
}: Readonly<{ actividad: ActividadEncuentroZoom }>) {
  return (
    <details className="zoom-series-card__activity" aria-label="Actividad de Zoom">
      <summary>
        Actividad de Zoom
        {actividad.eventos.length ? ` (${actividad.eventos.length})` : ""}
      </summary>
      <Contenido encuentro={actividad} />
    </details>
  );
}
