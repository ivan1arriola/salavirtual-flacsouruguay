import { etiquetaEventoZoom } from "@/src/integrations/zoom/zoom-eventos-catalogo";

type Evento = Readonly<{ tipo: string; ocurridoAt: string }>;
type Encuentro = Readonly<{
  id: string;
  fecha: string;
  eventos: readonly Evento[];
  /** Sin ocurrencia de Zoom vinculada: no se puede saber si hubo actividad. */
  sinAsociar?: boolean;
  /** Asociados por número de reunión y horario (el encuentro aún no tiene ejecución vinculada). */
  porHorario?: boolean;
}>;

const fecha = new Intl.DateTimeFormat("es-UY", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Montevideo"
});

export function ZoomEventosPanel({ encuentros }: Readonly<{ encuentros: readonly Encuentro[] }>) {
  return (
    <section aria-label="Actividad de Zoom">
      <h2>Actividad de Zoom</h2>
      <p>Se muestran los avisos asociados con certeza a cada encuentro.</p>
      {encuentros.map((encuentro) => (
        <details key={encuentro.id}>
          <summary>Encuentro del {fecha.format(new Date(encuentro.fecha))}</summary>
          {encuentro.sinAsociar && encuentro.eventos.length === 0 ? (
            <p>Todavía no se puede asociar actividad de Zoom a este encuentro.</p>
          ) : encuentro.eventos.length ? (
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
          ) : (
            <p>Sin actividad registrada</p>
          )}
        </details>
      ))}
    </section>
  );
}
