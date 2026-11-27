import { CircleAlert, CircleCheck } from "lucide-react";
import Link from "next/link";
import { AccionAgendaZoomBoton } from "@/src/components/accion-agenda-zoom-boton";
import { SincronizarAgendaZoomBoton } from "@/src/components/sincronizar-agenda-zoom-boton";
import { formatDateTime } from "@/src/lib/ui/format";
import type { leerInconsistenciasAgendaZoom } from "@/src/modules/operaciones/zoom-agenda-observada.service";
import styles from "./zoom.module.css";

/** Diferencias entre la agenda de Zoom (webhooks + sincronización) y la de Sala Virtual. */
export function AgendaZoomSeccion({
  agenda,
  total,
}: Readonly<{ agenda: Awaited<ReturnType<typeof leerInconsistenciasAgendaZoom>>; total: number }>) {
  const totalAgenda = total;
  return (
    <section aria-label="Agenda de Zoom" className={styles["list"]}>
      <p>
        Los webhooks de Zoom (reunión creada, actualizada o eliminada) registran los cambios hechos
        directamente en Zoom. «Sincronizar con Zoom» consulta la agenda completa de cada cuenta y
        reconcilia lo registrado.{" "}
        {agenda.ultimaObservacion
          ? `Último dato recibido: ${formatDateTime(agenda.ultimaObservacion)}.`
          : "Todavía no se recibió ningún dato: sincronizá o revisá que el webhook incluya los eventos de reunión."}
      </p>
      <SincronizarAgendaZoomBoton />
      {totalAgenda === 0 ? (
        <div className={styles["empty"]}>
          <CircleCheck size={24} /> No hay diferencias entre Zoom y Sala Virtual.
        </div>
      ) : null}
      {agenda.externas.length ? (
        <>
          <h2>Reuniones creadas en Zoom ({agenda.externas.length})</h2>
          <p>
            Ocupan la sala de su anfitrión: Sala Virtual no creará reuniones que se superpongan con
            ellas.
          </p>
          {agenda.externas.map(({ observada, choques }) => (
            <article className={styles["card"]} key={observada.id}>
              <div className={styles["cardHead"]}>
                <div>
                  <small>
                    {formatDateTime(observada.inicio)} · Zoom {observada.meetingId}
                  </small>
                  <h2>{observada.tema}</h2>
                </div>
                {choques.length ? <CircleAlert size={21} aria-label="Se superpone" /> : null}
              </div>
              {choques.length ? (
                <ul className={styles["warnings"]}>
                  {choques.map((reunion) => (
                    <li key={reunion.instanciaId}>
                      <CircleAlert size={15} /> Se superpone con{" "}
                      <Link href={`/reuniones/${reunion.solicitudId}`}>
                        {reunion.titulo} · {formatDateTime(reunion.inicio)}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>Sin superposición con encuentros de Sala Virtual.</p>
              )}
              <AccionAgendaZoomBoton
                accion="IGNORAR"
                observadaId={observada.id}
                etiqueta="Ignorar"
                confirmacion={`¿Ignorar la reunión «${observada.tema}»? Solo se oculta de este diagnóstico: Zoom sigue ocupado en ese horario y Sala Virtual no asignará esa sala a otra reunión. Podés dejar de ignorarla después.`}
              />
            </article>
          ))}
        </>
      ) : null}
      {agenda.ignoradas.length ? (
        <>
          <h2>Reuniones de Zoom ignoradas ({agenda.ignoradas.length})</h2>
          <ul className={styles["warnings"]}>
            {agenda.ignoradas.map((observada) => (
              <li key={observada.id}>
                {observada.tema} · {formatDateTime(observada.inicio)} · Zoom {observada.meetingId}{" "}
                <AccionAgendaZoomBoton
                  accion="DEJAR_DE_IGNORAR"
                  observadaId={observada.id}
                  etiqueta="Dejar de ignorar"
                  confirmacion="¿Volver a considerar esta reunión de Zoom como ocupada?"
                />
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {agenda.eliminadasEnZoom.length ? (
        <>
          <h2>Eliminadas en Zoom ({agenda.eliminadasEnZoom.length})</h2>
          <ul className={styles["warnings"]}>
            {agenda.eliminadasEnZoom.map((reunion) => (
              <li key={reunion.instanciaId}>
                <CircleAlert size={15} />{" "}
                <Link href={`/reuniones/${reunion.solicitudId}`}>
                  {reunion.titulo} · {formatDateTime(reunion.inicio)}
                </Link>{" "}
                ya no existe en Zoom.{" "}
                <AccionAgendaZoomBoton
                  accion="RECREAR_EN_ZOOM"
                  instanciaId={reunion.instanciaId}
                  etiqueta="Recrear en Zoom"
                  confirmacion={`¿Crear de nuevo en Zoom la reunión «${reunion.titulo}» (${formatDateTime(reunion.inicio)})? El enlace de acceso cambiará y quien tenga el anterior deberá recibir el nuevo.`}
                />{" "}
                <AccionAgendaZoomBoton
                  accion="CANCELAR_ENCUENTRO"
                  instanciaId={reunion.instanciaId}
                  etiqueta="Cancelar encuentro"
                  confirmacion={`¿Cancelar el encuentro «${reunion.titulo}» (${formatDateTime(reunion.inicio)}) en Sala Virtual? Una reunión debe conservar al menos un encuentro.`}
                />
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {agenda.horarioDistinto.length ? (
        <>
          <h2>Horario distinto en Zoom ({agenda.horarioDistinto.length})</h2>
          <ul className={styles["warnings"]}>
            {agenda.horarioDistinto.map(({ reunion, enZoom }) => (
              <li key={reunion.instanciaId}>
                <CircleAlert size={15} />{" "}
                <Link href={`/reuniones/${reunion.solicitudId}`}>{reunion.titulo}</Link>: en Sala
                Virtual {formatDateTime(reunion.inicio)}; en Zoom{" "}
                {enZoom.map(({ inicio }) => formatDateTime(inicio)).join(", ")} (hora de
                Montevideo).{" "}
                <AccionAgendaZoomBoton
                  accion="CORREGIR_EN_ZOOM"
                  instanciaId={reunion.instanciaId}
                  etiqueta="Corregir en Zoom"
                  confirmacion={`¿Cambiar en Zoom el horario a ${formatDateTime(reunion.inicio)} (hora de Montevideo), el de Sala Virtual?`}
                />{" "}
                <AccionAgendaZoomBoton
                  accion="ADOPTAR_DE_ZOOM"
                  instanciaId={reunion.instanciaId}
                  etiqueta="Adoptar horario de Zoom"
                  confirmacion={`¿Cambiar el encuentro en Sala Virtual al horario de Zoom (${enZoom.map(({ inicio }) => formatDateTime(inicio)).join(", ")}, hora de Montevideo)?`}
                />
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
