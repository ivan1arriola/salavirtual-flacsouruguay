import { SincronizarAgendaZoomBoton } from "./sincronizar-agenda-zoom-boton";

export function ZoomAgendaBlock() {
  return (
    <>
      <p>
        Se sincroniza sola cada 30 minutos y con los avisos de Zoom. Forzá una sincronización
        completa si creaste o cambiaste reuniones en Zoom y necesitás verlas ya. No modifica
        reuniones en curso ni transcurridas.
      </p>
      <SincronizarAgendaZoomBoton />
    </>
  );
}
