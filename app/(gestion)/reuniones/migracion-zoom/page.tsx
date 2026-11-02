import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ExcepcionMeetControl } from "@/src/components/excepcion-meet-control";
import { MigracionZoomAplicarControl } from "@/src/components/migracion-zoom-aplicar-control";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { formatDateTime } from "@/src/lib/ui/format";
import { obtenerVistaPreviaMigracionZoom } from "@/src/modules/reuniones/migracion-zoom.service";

export const dynamic = "force-dynamic";

const ETIQUETAS = {
  MIGRABLE: "Migrable",
  EXCEPCION: "Conservar en Meet",
  YA_ZOOM: "Ya está en Zoom",
  SIN_SALA: "Sin sala Zoom libre",
  CERCANO: "Comienza pronto",
  NO_FUTURO: "No futuro",
  REVISAR: "Revisar",
} as const;

export default async function MigracionZoomPage() {
  const session = await auth();
  if (session?.user?.role !== "ADMINISTRACION") redirect("/");
  const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
  if (!actor?.activo || actor.rol !== "ADMINISTRACION") redirect("/");

  const vistaPrevia = await obtenerVistaPreviaMigracionZoom(db, { id: actor.id, rol: actor.rol });

  return (
    <main>
      <h1>Migración a Zoom: vista previa</h1>
      <p>
        Vista de solo lectura generada el {formatDateTime(new Date(vistaPrevia.generadaAt))}. No se modificó ningún encuentro.
        Los encuentros que comienzan dentro de {vistaPrevia.margenSeguridadHoras} horas no se migran.
      </p>
      <ul>
        {Object.entries(vistaPrevia.conteos).map(([estado, cantidad]) => (
          <li key={estado}>{ETIQUETAS[estado as keyof typeof ETIQUETAS]}: {cantidad}</li>
        ))}
      </ul>
      <MigracionZoomAplicarControl filas={vistaPrevia.filas.filter((fila) => fila.estado === "MIGRABLE").map((fila) => ({
        id: fila.id,
        titulo: fila.titulo,
        inicio: fila.inicio,
        host: fila.hostZoom?.nombre ?? "Sin sala",
      }))} filasEnZoom={vistaPrevia.filas.filter((fila) => fila.estado === "YA_ZOOM" && fila.tieneMeetHistorico).map((fila) => ({
        id: fila.id,
        titulo: fila.titulo,
        inicio: fila.inicio,
        host: fila.hostZoom?.nombre ?? "—",
      }))} />
      <table>
        <thead>
          <tr>
            <th>Encuentro</th>
            <th>Programa</th>
            <th>Inicio</th>
            <th>Estado</th>
            <th>Enlace vigente</th>
            <th>Sala Zoom propuesta</th>
            <th>Cambio de enlace</th>
            <th>Destinatarios</th>
            <th>Excepción</th>
          </tr>
        </thead>
        <tbody>
          {vistaPrevia.filas.map((fila) => {
            const editable = fila.estado === "MIGRABLE" || fila.estado === "EXCEPCION" || fila.estado === "CERCANO" || fila.estado === "SIN_SALA";
            return (
              <tr key={fila.id}>
                <td>{fila.titulo}</td>
                <td>{fila.programa}</td>
                <td>{formatDateTime(new Date(fila.inicio))}</td>
                <td>{ETIQUETAS[fila.estado]}</td>
                <td><code>{fila.enlaceActual ?? "—"}</code></td>
                <td>{fila.hostZoom ? `${fila.hostZoom.nombre} (${fila.hostZoom.email ?? "sin correo"})` : "—"}</td>
                <td>{fila.cambioEnlace ? "Meet → Zoom" : "Sin cambio"}</td>
                <td>{fila.destinatarios.length > 0 ? fila.destinatarios.join(", ") : "—"}</td>
                <td>
                  {editable ? (
                    <ExcepcionMeetControl
                      instanciaId={fila.id}
                      conservar={fila.estado === "EXCEPCION"}
                      motivoActual={fila.motivoExcepcion}
                    />
                  ) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </main>
  );
}
