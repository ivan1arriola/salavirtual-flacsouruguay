"use client";

import { ArrowUpRight, CalendarClock, Clock3, Hash, Plus, Trash2, UserRound, Video } from "lucide-react";
import { PALETA_CUENTAS_ZOOM, colorCuentaZoom } from "@/src/modules/reuniones/lista-zoom-agrupacion.domain";
import "./reunion-zoom-encuentros.css";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
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
  zoomMeetingId?: string | null;
  cuentaAnfitrion?: string | null;
  puedeIniciar: boolean;
  estadoEnlace: EstadoEnlaceZoom;
  eventoProveedorId: string | null;
  operacion: ResumenEnlaceZoom["operacion"];
}>;

const ZONA = "America/Montevideo";
const fechaFmt = new Intl.DateTimeFormat("es-UY", {
  timeZone: ZONA,
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric"
});
const horaFmt = new Intl.DateTimeFormat("es-UY", {
  timeZone: ZONA,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23"
});
const partesFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONA,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23"
});
const diaFmt = new Intl.DateTimeFormat("es-UY", { timeZone: ZONA, day: "numeric" });
const mesFmt = new Intl.DateTimeFormat("es-UY", { timeZone: ZONA, month: "short", year: "numeric" });
const semanaFmt = new Intl.DateTimeFormat("es-UY", { timeZone: ZONA, weekday: "long" });
const contextoFechaFmt = new Intl.DateTimeFormat("es-UY", {
  timeZone: ZONA,
  weekday: "long",
  day: "numeric",
  month: "long"
});
const ESTADOS_ENCUENTRO: Record<string, Readonly<{ etiqueta: string; clase: string }>> = {
  PROGRAMADO: { etiqueta: "Programado", clase: "is-programado" },
  PROGRAMADA: { etiqueta: "Programado", clase: "is-programado" },
  CANCELADO: { etiqueta: "Cancelado", clase: "is-cancelado" },
  CANCELADA: { etiqueta: "Cancelado", clase: "is-cancelado" },
  REALIZADO: { etiqueta: "Realizado", clase: "is-realizado" },
  COMPLETADO: { etiqueta: "Realizado", clase: "is-realizado" },
  EN_CURSO: { etiqueta: "En curso", clase: "is-en-curso" },
  PENDIENTE: { etiqueta: "Pendiente", clase: "is-pendiente" }
};

function aInputs(iso: string): { fecha: string; hora: string } {
  const partes = Object.fromEntries(
    partesFmt.formatToParts(new Date(iso)).map(({ type, value }) => [type, value])
  );
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
  permiteCancelarSerie,
  solicitudIdParaAgregar,
  permiteAgregarCompartida
}: Readonly<{
  encuentros: readonly EncuentroZoomView[];
  solicitudIds: readonly string[];
  esAdmin: boolean;
  /** Solo el titular de la reunión y administración; el resto la ve sin poder cambiarla. */
  puedeModificar: boolean;
  /** Falso en una serie partida: cancelarla entera cancelaría también los encuentros del otro proveedor. */
  permiteCancelarSerie: boolean;
  solicitudIdParaAgregar?: string;
  permiteAgregarCompartida?: boolean;
}>) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editando, setEditando] = useState<string | null>(null);
  const [agregando, setAgregando] = useState(false);
  const [mensaje, setMensaje] = useState<{ texto: string; error: boolean } | null>(null);
  const fechaInputRef = useRef<HTMLInputElement>(null);
  const botonEditarRef = useRef<HTMLButtonElement>(null);
  const devolverFocoRef = useRef(false);
  useEffect(() => {
    if (editando) {
      fechaInputRef.current?.focus();
    } else if (devolverFocoRef.current) {
      devolverFocoRef.current = false;
      botonEditarRef.current?.focus();
    }
  }, [editando]);
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
    ejecutar(
      () =>
        enviarAccionEncuentro(
          fetch,
          `/api/v1/reuniones/${encuentro.solicitudId}/encuentros/${encuentro.id}`,
          {
            method: "PATCH",
            body: { accion: "EDITAR_FECHA", inicio: aIso(fecha, inicio), fin: aIso(fecha, fin) }
          }
        ),
      () => setEditando(null)
    );
  }

  function agregar(form: HTMLFormElement) {
    const datos = new FormData(form);
    const fecha = String(datos.get("fecha") ?? "");
    const inicio = String(datos.get("horaInicio") ?? "");
    const fin = String(datos.get("horaFin") ?? "");
    const descripcion = String(datos.get("descripcion") ?? "").trim();
    if (!fecha || !inicio || !fin || fin <= inicio) {
      setMensaje({ texto: "Revisá la fecha y las horas del nuevo encuentro.", error: true });
      return;
    }
    const inicioIso = aIso(fecha, inicio);
    const finIso = aIso(fecha, fin);
    if (new Date(inicioIso).getTime() <= Date.now()) {
      setMensaje({ texto: "El nuevo encuentro debe comenzar en el futuro.", error: true });
      return;
    }
    ejecutar(
      () =>
        enviarAccionEncuentro(fetch, `/api/v1/reuniones/${solicitudIdParaAgregar}/encuentros`, {
          method: "POST",
          body: {
            inicio: inicioIso,
            fin: finIso,
            descripcion,
            requiereAsistenciaTecnica: false,
            requiereGrabacion: false
          }
        }),
      () => setAgregando(false)
    );
  }

  function cancelarEncuentro(encuentro: EncuentroZoomView) {
    const fechaLarga = `${contextoFechaFmt.format(new Date(encuentro.inicioIso))}, ${horaFmt.format(new Date(encuentro.inicioIso))}`;
    if (!window.confirm(`¿Cancelar el encuentro del ${fechaLarga}?`)) {
      return;
    }
    ejecutar(() =>
      enviarAccionEncuentro(fetch, `/api/v1/reuniones/${encuentro.solicitudId}/encuentros/${encuentro.id}`, {
        method: "DELETE"
      })
    );
  }

  function cancelarSerie() {
    const cantidad = encuentros.filter(({ editable }) => editable).length;
    if (!window.confirm(`¿Cancelar toda la serie? Se cancelarán ${cantidad} encuentros.`)) {
      return;
    }
    ejecutar(() =>
      enviarAccionEncuentro(fetch, "/api/v1/reuniones/cancelar-serie", {
        method: "POST",
        body: { solicitudIds }
      })
    );
  }

  return (
    <section className="zoom-encuentros zoom-series-encounters" aria-label="Encuentros de la serie">
      <ul className="zoom-series-encounters__list">
        {encuentros.map((encuentro) => {
          const inicio = new Date(encuentro.inicioIso);
          const fin = new Date(encuentro.finIso);
          const valores = aInputs(encuentro.inicioIso);
          const finValor = aInputs(encuentro.finIso);
          const estado = ESTADOS_ENCUENTRO[encuentro.estado.toUpperCase()] ?? {
            etiqueta: encuentro.estado.toLowerCase().replaceAll("_", " "),
            clase: "is-desconocido"
          };
          const contexto = `${contextoFechaFmt.format(inicio)}, ${horaFmt.format(inicio)}`;
          return (
            <li key={encuentro.id} className="zoom-series-card">
              <div className="zoom-series-card__date" aria-label={fechaFmt.format(inicio)}>
                <span className="zoom-series-card__weekday">{semanaFmt.format(inicio)}</span>
                <strong className="zoom-series-card__day">{diaFmt.format(inicio)}</strong>
                <span className="zoom-series-card__month">{mesFmt.format(inicio)}</span>
                <span className="zoom-series-card__time">
                  <Clock3 size={16} aria-hidden="true" /> {horaFmt.format(inicio)} – {horaFmt.format(fin)}
                </span>
              </div>
              <div className="zoom-series-card__body">
                <div className="zoom-series-card__heading">
                  <h2>{encuentro.descripcion || "Encuentro por Zoom"}</h2>
                  <span className={`zoom-series-card__state ${estado.clase}`}>{estado.etiqueta}</span>
                </div>
                <div className="zoom-series-card__meta">
                  {encuentro.puedeUnirse ? (
                    <ZoomLinkStatus
                      estado={encuentro.estadoEnlace}
                      esAdmin={esAdmin}
                      eventoProveedorId={encuentro.eventoProveedorId}
                      operacion={encuentro.operacion}
                      contexto={contexto}
                    />
                  ) : null}
                  <span
                    className="zoom-series-card__host"
                    style={
                      {
                        "--cuenta":
                          PALETA_CUENTAS_ZOOM[colorCuentaZoom(encuentro.cuentaAnfitrion) ?? -1]?.fuerte ??
                          "#8093ae"
                      } as React.CSSProperties
                    }
                  >
                    <UserRound size={15} aria-hidden="true" /> Cuenta anfitriona:{" "}
                    <strong>{encuentro.cuentaAnfitrion ?? "Sin asignar"}</strong>
                  </span>
                  {encuentro.zoomMeetingId ? (
                    <span className="zoom-series-card__id">
                      <Hash size={15} aria-hidden="true" /> ID de reunión:{" "}
                      <strong>{encuentro.zoomMeetingId}</strong>
                    </span>
                  ) : (
                    <span className="zoom-series-card__id zoom-series-card__id--pending">
                      <Hash size={15} aria-hidden="true" /> ID de reunión pendiente
                    </span>
                  )}
                </div>
                <div className="zoom-series-card__main-actions">
                  <Link
                    className="secondary-action"
                    href={`/operacion/${encuentro.id}`}
                    aria-label={`Abrir ficha del encuentro del ${contexto}`}
                  >
                    <ArrowUpRight size={16} aria-hidden="true" /> Ver encuentro
                  </Link>
                </div>
                {encuentro.puedeUnirse ? (
                  <div className="zoom-series-card__main-actions">
                    {encuentro.joinUrl ? (
                      <ZoomJoinActions url={encuentro.joinUrl} contexto={contexto} />
                    ) : null}
                    {encuentro.puedeIniciar ? (
                      <a
                        className="secondary-action"
                        href={`/api/v1/reuniones/instancias/${encuentro.id}/iniciar-zoom`}
                        rel="noreferrer"
                        target="_blank"
                      >
                        <Video size={16} aria-hidden="true" /> Iniciar como anfitrión
                        <span className="sr-only"> (se abre en una pestaña nueva)</span>
                      </a>
                    ) : null}
                  </div>
                ) : null}
                {puedeModificar && encuentro.editable ? (
                  <div className="zoom-series-card__secondary-actions">
                    {editando === encuentro.id ? (
                      <form
                        className="zoom-encuentro__form zoom-series-card__form"
                        onSubmit={(event) => {
                          event.preventDefault();
                          guardar(encuentro, event.currentTarget);
                        }}
                      >
                        <label>
                          Fecha
                          <input
                            ref={fechaInputRef}
                            defaultValue={valores.fecha}
                            name="fecha"
                            required
                            type="date"
                          />
                        </label>
                        <label>
                          Inicio
                          <input defaultValue={valores.hora} name="horaInicio" required type="time" />
                        </label>
                        <label>
                          Fin
                          <input defaultValue={finValor.hora} name="horaFin" required type="time" />
                        </label>
                        <button className="primary-action" disabled={pending} type="submit">
                          Guardar
                        </button>
                        <button
                          className="secondary-action"
                          disabled={pending}
                          onClick={() => {
                            devolverFocoRef.current = true;
                            setEditando(null);
                          }}
                          type="button"
                        >
                          Cancelar edición
                        </button>
                      </form>
                    ) : (
                      <>
                        <button
                          ref={botonEditarRef}
                          className="zoom-series-card__text-action"
                          disabled={pending}
                          onClick={() => {
                            devolverFocoRef.current = false;
                            setEditando(encuentro.id);
                          }}
                          type="button"
                        >
                          <CalendarClock size={16} aria-hidden="true" /> Editar fecha y hora
                        </button>
                        {encuentro.puedeCancelar ? (
                          <button
                            className="zoom-series-card__text-action zoom-series-card__text-action--danger"
                            disabled={pending}
                            onClick={() => cancelarEncuentro(encuentro)}
                            type="button"
                          >
                            <Trash2 size={16} aria-hidden="true" /> Cancelar encuentro
                          </button>
                        ) : null}
                      </>
                    )}
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      {puedeModificar && permiteCancelarSerie && solicitudIdParaAgregar ? (
        <div className="zoom-series-add">
          {permiteAgregarCompartida ? (
            <>
              <button
                className="primary-action zoom-series-add__toggle"
                type="button"
                disabled={pending}
                aria-expanded={agregando}
                aria-controls="zoom-series-add-form"
                onClick={() => setAgregando((actual) => !actual)}
              >
                <Plus size={17} aria-hidden="true" /> Agregar encuentro a la serie
              </button>
              {agregando ? (
                <form
                  id="zoom-series-add-form"
                  className="zoom-series-add__form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    agregar(event.currentTarget);
                  }}
                >
                  <p>El nuevo encuentro utilizará la misma reunión e ID de Zoom. Horario de Uruguay.</p>
                  <label>
                    Fecha
                    <input type="date" name="fecha" required />
                  </label>
                  <label>
                    Inicio
                    <input type="time" name="horaInicio" required />
                  </label>
                  <label>
                    Fin
                    <input type="time" name="horaFin" required />
                  </label>
                  <label className="zoom-series-add__description">
                    Descripción (opcional)
                    <input type="text" name="descripcion" maxLength={4000} />
                  </label>
                  <div className="zoom-series-add__buttons">
                    <button className="primary-action" type="submit" disabled={pending}>
                      {pending ? "Guardando…" : "Crear encuentro"}
                    </button>
                    <button
                      className="secondary-action"
                      type="button"
                      disabled={pending}
                      onClick={() => setAgregando(false)}
                    >
                      Cerrar
                    </button>
                  </div>
                </form>
              ) : null}
            </>
          ) : (
            <p className="zoom-series-add__notice" role="note">
              Para agregar encuentros con el mismo ID de Zoom, primero hay que unificar los enlaces de esta
              serie. No se creará automáticamente otro enlace independiente.
            </p>
          )}
        </div>
      ) : null}
      {hayEditables ? (
        <div className="zoom-series-encounters__footer">
          <button
            className="secondary-action zoom-series-encounters__cancel"
            disabled={pending}
            onClick={cancelarSerie}
            type="button"
          >
            <Trash2 size={17} aria-hidden="true" /> Cancelar toda la serie
          </button>
        </div>
      ) : null}
      {mensaje ? <p role={mensaje.error ? "alert" : "status"}>{mensaje.texto}</p> : null}
    </section>
  );
}
