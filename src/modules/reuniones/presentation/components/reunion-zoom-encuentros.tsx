"use client";

import { Pencil, Trash2, Video } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ZoomJoinActions } from "@/src/components/zoom-join-actions";
import { ZoomLinkStatus } from "@/src/components/zoom-link-status";
import type { EstadoEnlaceZoom, ResumenEnlaceZoom } from "@/src/modules/reuniones/estado-enlace-zoom.domain";
import { enviarAccionEncuentro } from "@/src/modules/reuniones/reunion-zoom-acciones";

export type EncuentroZoomView = Readonly<{
  id: string;
  solicitudId: string;
  inicioIso: string;
  finIso: string;
  descripcion: string | null;
  estado: string;
  editable: boolean;
  puedeCancelar: boolean;
  puedeUnirse: boolean;
  joinUrl: string | null;
  puedeIniciar: boolean;
  estadoEnlace: EstadoEnlaceZoom;
  eventoProveedorId: string | null;
  operacion: ResumenEnlaceZoom["operacion"];
}>;

const ZONA = "America/Montevideo";
const fechaFmt = new Intl.DateTimeFormat("es-UY", { timeZone: ZONA, weekday: "long", day: "numeric", month: "long", year: "numeric" });
const horaFmt = new Intl.DateTimeFormat("es-UY", { timeZone: ZONA, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const partesFmt = new Intl.DateTimeFormat("en-CA", { timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

function aInputs(iso: string): { fecha: string; hora: string } {
  const partes = Object.fromEntries(partesFmt.formatToParts(new Date(iso)).map(({ type, value }) => [type, value]));
  return { fecha: `${partes.year}-${partes.month}-${partes.day}`, hora: `${partes.hour}:${partes.minute}` };
}

function aIso(fecha: string, hora: string): string {
  return new Date(`${fecha}T${hora}:00-03:00`).toISOString();
}

export function ReunionZoomEncuentros({
  encuentros,
  solicitudIds,
  esAdmin,
  puedeModificar,
  permiteCancelarSerie
}: Readonly<{
  encuentros: readonly EncuentroZoomView[];
  solicitudIds: readonly string[];
  esAdmin: boolean;
  /** Solo el titular de la reunión y administración; el resto la ve sin poder cambiarla. */
  puedeModificar: boolean;
  /** Falso en una serie partida: cancelarla entera cancelaría también los encuentros del otro proveedor. */
  permiteCancelarSerie: boolean;
}>) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editando, setEditando] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<{ texto: string; error: boolean } | null>(null);
  const hayEditables = puedeModificar && permiteCancelarSerie && encuentros.some(({ editable }) => editable);

  function ejecutar(accion: () => ReturnType<typeof enviarAccionEncuentro>, alTerminar?: () => void) {
    setMensaje(null);
    startTransition(async () => {
      const resultado = await accion();
      setMensaje({ texto: resultado.mensaje, error: !resultado.ok });
      if (resultado.ok) {
        alTerminar?.();
        router.refresh();
      }
    });
  }

  function guardar(encuentro: EncuentroZoomView, form: HTMLFormElement) {
    const datos = new FormData(form);
    const fecha = String(datos.get("fecha") ?? "");
    const inicio = String(datos.get("horaInicio") ?? "");
    const fin = String(datos.get("horaFin") ?? "");
    if (!fecha || !inicio || !fin || fin <= inicio) {
      setMensaje({ texto: "Revisá la fecha y que la hora de fin sea posterior al inicio.", error: true });
      return;
    }
    ejecutar(() => enviarAccionEncuentro(fetch, `/api/v1/reuniones/${encuentro.solicitudId}/encuentros/${encuentro.id}`, {
      method: "PATCH",
      body: { accion: "EDITAR_FECHA", inicio: aIso(fecha, inicio), fin: aIso(fecha, fin) }
    }), () => setEditando(null));
  }

  function cancelarEncuentro(encuentro: EncuentroZoomView) {
    if (!window.confirm("¿Cancelar este encuentro?")) return;
    ejecutar(() => enviarAccionEncuentro(fetch, `/api/v1/reuniones/${encuentro.solicitudId}/encuentros/${encuentro.id}`, { method: "DELETE" }));
  }

  function cancelarSerie() {
    if (!window.confirm("¿Cancelar toda la serie de encuentros?")) return;
    ejecutar(() => enviarAccionEncuentro(fetch, "/api/v1/reuniones/cancelar-serie", { method: "POST", body: { solicitudIds } }));
  }

  return (
    <section className="zoom-encuentros" aria-label="Encuentros">
      <ul>
        {encuentros.map((encuentro) => {
          const inicio = new Date(encuentro.inicioIso);
          const fin = new Date(encuentro.finIso);
          const valores = aInputs(encuentro.inicioIso);
          const finValor = aInputs(encuentro.finIso);
          return (
            <li key={encuentro.id}>
              <div>
                <strong>{fechaFmt.format(inicio)}</strong>
                <span>{horaFmt.format(inicio)} – {horaFmt.format(fin)}</span>
                <span className="status">{encuentro.estado.toLowerCase().replaceAll("_", " ")}</span>
                {encuentro.descripcion ? <p>{encuentro.descripcion}</p> : null}
              </div>
              {encuentro.puedeUnirse ? (
                <div>
                  <ZoomLinkStatus
                    estado={encuentro.estadoEnlace}
                    esAdmin={esAdmin}
                    eventoProveedorId={encuentro.eventoProveedorId}
                    operacion={encuentro.operacion}
                  />
                  {encuentro.joinUrl ? <ZoomJoinActions url={encuentro.joinUrl} /> : null}
                  {encuentro.puedeIniciar ? (
                    <a className="secondary-action" href={`/api/v1/reuniones/instancias/${encuentro.id}/iniciar-zoom`} rel="noreferrer" target="_blank">
                      <Video size={16} aria-hidden="true" />
                      Iniciar como anfitrión
                    </a>
                  ) : null}
                </div>
              ) : null}
              {puedeModificar && encuentro.editable ? (
                <div>
                  {editando === encuentro.id ? (
                    <form onSubmit={(event) => { event.preventDefault(); guardar(encuentro, event.currentTarget); }}>
                      <label>Fecha<input defaultValue={valores.fecha} name="fecha" required type="date" /></label>
                      <label>Inicio<input defaultValue={valores.hora} name="horaInicio" required type="time" /></label>
                      <label>Fin<input defaultValue={finValor.hora} name="horaFin" required type="time" /></label>
                      <button className="primary-action" disabled={pending} type="submit">Guardar</button>
                      <button className="secondary-action" onClick={() => setEditando(null)} type="button">Cancelar edición</button>
                    </form>
                  ) : (
                    <>
                      <button className="secondary-action" onClick={() => setEditando(encuentro.id)} type="button">
                        <Pencil size={16} aria-hidden="true" />
                        Editar fecha y hora
                      </button>
                      {encuentro.puedeCancelar ? (
                        <button className="secondary-action" disabled={pending} onClick={() => cancelarEncuentro(encuentro)} type="button">
                          <Trash2 size={16} aria-hidden="true" />
                          Cancelar encuentro
                        </button>
                      ) : null}
                    </>
                  )}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {hayEditables ? (
        <button className="secondary-action" disabled={pending} onClick={cancelarSerie} type="button">
          Cancelar toda la serie
        </button>
      ) : null}
      {mensaje ? <p role={mensaje.error ? "alert" : "status"}>{mensaje.texto}</p> : null}
    </section>
  );
}
