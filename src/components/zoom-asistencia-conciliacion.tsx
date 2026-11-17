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
  SIN_CONCILIAR: "Sin conciliar",
  SUGERIDO: "Sugerido (confirmar)",
  CONCILIADO: "Conciliado",
  EXTERNO: "Externo"
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
    <div className="attendance-table-scroll">
      {mensaje ? <p role="alert">{mensaje}</p> : null}
      <table className="attendance-table">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Minutos</th>
            <th>%</th>
            <th>Estado</th>
            {puedeConciliar ? <th>Acción</th> : null}
          </tr>
        </thead>
        <tbody>
          {registros.map((r) => (
            <tr key={r.id}>
              <td>
                {r.nombre}
                {r.esHostOCohost ? " (anfitrión)" : ""}
                <br />
                <small className="zoom-attendance-email">
                  {r.emailObservado ?? "Sin correo informado por Zoom"}
                </small>
                {r.conexiones.length > 0 ? (
                  <details className="zoom-attendance-connections">
                    <summary>
                      {r.conexiones.length === 1 ? "1 conexión" : `${r.conexiones.length} conexiones`}
                    </summary>
                    <ul>
                      {r.conexiones.map((c, i) => (
                        <li key={`${c.entradaAt}-${i}`}>
                          {hora(c.entradaAt)} → {hora(c.salidaAt)}
                          {c.status === "in_waiting_room" ? " · sala de espera" : ""}
                          {c.email && c.email !== r.emailObservado ? ` · ${c.email}` : ""}
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </td>
              <td>{r.minutos}</td>
              <td>{r.porcentaje}</td>
              <td>{ETIQUETA[r.estadoConciliacion]}</td>
              {puedeConciliar ? (
                <td>
                  <select
                    aria-label={`Vincular a ${r.nombre}`}
                    disabled={pendiente}
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value) {
                        enviar(r, e.target.value, false);
                      }
                    }}
                  >
                    <option value="">Vincular con invitado…</option>
                    {invitados.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.nombre ?? i.email}
                      </option>
                    ))}
                  </select>
                  <button type="button" disabled={pendiente} onClick={() => enviar(r, null, true)}>
                    Marcar externo
                  </button>
                  {r.estadoConciliacion !== "SIN_CONCILIAR" ? (
                    <button type="button" disabled={pendiente} onClick={() => enviar(r, null, false)}>
                      Quitar vínculo
                    </button>
                  ) : null}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
