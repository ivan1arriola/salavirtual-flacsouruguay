"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Registro = Readonly<{
  id: string;
  version: number;
  nombre: string;
  emailObservado: string | null;
  minutos: number;
  porcentaje: number;
  sesiones: number;
  esHostOCohost: boolean;
  estadoConciliacion: "SIN_CONCILIAR" | "SUGERIDO" | "CONCILIADO" | "EXTERNO";
  invitadoReunionId: string | null;
  conexiones: ReadonlyArray<
    Readonly<{ entradaAt: string; salidaAt: string; email: string | null; status: string | null }>
  >;
}>;
type Invitado = Readonly<{ id: string; email: string; nombre: string | null }>;

const ETIQUETA: Record<Registro["estadoConciliacion"], string> = {
  SIN_CONCILIAR: "Sin identificar",
  SUGERIDO: "Posible coincidencia",
  CONCILIADO: "Identificada",
  EXTERNO: "No figura entre los invitados"
};

const hora = (iso: string) =>
  new Intl.DateTimeFormat("es-UY", {
    timeZone: "America/Montevideo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(new Date(iso));

/** Asistencia persistida de Zoom. Solo quien puede conciliar ve los controles; el resto solo lee. */
export function ZoomAsistenciaConciliacion({
  instanciaId,
  registros,
  invitados,
  puedeConciliar
}: Readonly<{
  instanciaId: string;
  registros: readonly Registro[];
  invitados: readonly Invitado[];
  puedeConciliar: boolean;
}>) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [mensaje, setMensaje] = useState<string | null>(null);

  function enviar(registro: Registro, invitadoReunionId: string | null, externo: boolean) {
    setMensaje(null);
    iniciar(async () => {
      const r = await fetch(
        `/api/v1/reuniones/instancias/${encodeURIComponent(instanciaId)}/asistencia/conciliar`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            registroId: registro.id,
            invitadoReunionId,
            externo,
            version: registro.version
          })
        }
      ).catch(() => null);
      if (r?.ok) {
        router.refresh();
        return;
      }
      setMensaje(
        r?.status === 409
          ? "Otra persona modificó este registro. Recargá la página."
          : "No se pudo guardar el cambio."
      );
    });
  }

  return (
    <div className="zoom-people">
      {mensaje ? <p role="alert">{mensaje}</p> : null}
      <ul className="zoom-people__list">
        {registros.map((r) => (
          <li key={r.id}>
            <details className="zoom-person">
              <summary>
                <span className="zoom-person__name">
                  <strong>{r.nombre}</strong>
                  {r.esHostOCohost ? <em> · anfitrión</em> : null}
                  <small className="zoom-attendance-email">
                    {r.emailObservado ?? "Sin correo informado por Zoom"}
                  </small>
                </span>
                <span className="zoom-person__metrics">
                  <span>
                    <b>{r.minutos}</b> min
                  </span>
                  <span>
                    <b>{r.porcentaje}</b>% del horario
                  </span>
                  <span>
                    <b>{r.sesiones}</b> {r.sesiones === 1 ? "conexión" : "conexiones"}
                  </span>
                </span>
                <span className="zoom-person__state" data-estado={r.estadoConciliacion}>
                  {ETIQUETA[r.estadoConciliacion]}
                </span>
              </summary>
              <div className="zoom-person__body">
                {r.conexiones.length > 0 ? (
                  <ul className="zoom-attendance-connections">
                    {r.conexiones.map((c, i) => (
                      <li key={`${c.entradaAt}-${i}`}>
                        {hora(c.entradaAt)} → {hora(c.salidaAt)}
                        {c.status === "in_waiting_room"
                          ? " · sala de espera (no cuenta como tiempo en reunión)"
                          : ""}
                        {c.email && c.email !== r.emailObservado ? ` · ${c.email}` : ""}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {puedeConciliar ? (
                  <div className="zoom-attendance-actions">
                    <label>
                      <span>Identificar persona</span>
                      <select
                        disabled={pendiente}
                        defaultValue=""
                        onChange={(e) => {
                          if (e.target.value) {
                            enviar(r, e.target.value, false);
                          }
                        }}
                      >
                        <option value="">Elegir entre los invitados…</option>
                        {invitados.map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.nombre ?? i.email}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button type="button" disabled={pendiente} onClick={() => enviar(r, null, true)}>
                      No figura entre los invitados
                    </button>
                    {r.estadoConciliacion !== "SIN_CONCILIAR" ? (
                      <button type="button" disabled={pendiente} onClick={() => enviar(r, null, false)}>
                        Quitar identificación
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}
