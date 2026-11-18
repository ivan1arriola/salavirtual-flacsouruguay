import { ZoomHistoricoControl } from "@/src/components/zoom-historico-control";
import { ZoomPasadaAcciones } from "@/src/components/zoom-pasada-acciones";
import { formatDateTime } from "@/src/lib/ui/format";
import styles from "./zoom.module.css";

export function SinVincularLista({
  items
}: Readonly<{ items: readonly { id: string; inicioRealAt: Date; meetingId: string }[] }>) {
  return (
    <>
      <h2>Sin vincular ({items.length})</h2>
      {items.length === 0 ? <p>No hay ejecuciones sin vincular en este período.</p> : null}
      {items.map((o) => (
        <article className={styles.card} key={o.id}>
          <small>
            {formatDateTime(o.inicioRealAt)} · Zoom {o.meetingId}
          </small>
          <div className={styles.control}>
            <ZoomHistoricoControl ocurrenciaId={o.id} />
          </div>
        </article>
      ))}
    </>
  );
}

export function AccionesPasada(
  props: Readonly<{ ocurrenciaId: string; eventoId: string | null; instanciaId?: string }>
) {
  if (!props.eventoId || !props.instanciaId) {
    return null;
  }
  return (
    <div className={styles.control}>
      <ZoomPasadaAcciones
        ocurrenciaId={props.ocurrenciaId}
        eventoId={props.eventoId}
        instanciaId={props.instanciaId}
      />
    </div>
  );
}
