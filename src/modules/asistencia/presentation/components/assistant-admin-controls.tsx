"use client";

import {
  CalendarClock,
  LogIn,
  PauseCircle,
  PlayCircle,
  ShieldAlert,
  UserRoundCheck,
  UserRoundX,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = Readonly<{
  usuarioId: string;
  usuarioActivo: boolean;
  disponibleGeneral: boolean;
  cesadoHastaProximoInicioSesion: boolean;
  ultimoAcceso: string | null;
  cuentasGoogle: number;
  asignacionesFuturas: number;
}>;

export function AssistantAdminControls(props: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState<"availability" | "cease" | null>(null);
  const [message, setMessage] = useState("");

  async function update(
    kind: "availability" | "cease",
    body: Readonly<{
      disponibleGeneral?: boolean;
      cesadoHastaProximoInicioSesion?: boolean;
    }>,
  ) {
    if (
      kind === "cease" &&
      body.cesadoHastaProximoInicioSesion === true &&
      props.asignacionesFuturas > 0 &&
      !window.confirm(
        `Este asistente tiene ${props.asignacionesFuturas} asignación(es) futura(s). El cese no las cancela. ¿Continuar?`,
      )
    ) {
      return;
    }

    setSaving(kind);
    setMessage("");
    try {
      const response = await fetch(
        `/api/v1/asistencia/asistentes/${encodeURIComponent(props.usuarioId)}/estado`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setMessage(result.error ?? "No se pudo actualizar el asistente.");
        return;
      }
      setMessage("Estado actualizado.");
      router.refresh();
    } catch {
      setMessage("No se pudo comunicar el cambio al servidor.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <section className="content-section assistant-admin-controls">
      <div className="section-heading">
        <div>
          <h2>Control operativo</h2>
          <p>
            Administrá si puede recibir nuevas coberturas y si queda temporalmente fuera de
            operación.
          </p>
        </div>
      </div>

      <div className="assistant-admin-status-grid">
        <article>
          <ShieldAlert size={18} aria-hidden="true" />
          <div>
            <span>Cuenta</span>
            <strong>{props.usuarioActivo ? "Activa" : "Inactiva"}</strong>
          </div>
        </article>
        <article>
          <CalendarClock size={18} aria-hidden="true" />
          <div>
            <span>Asignaciones futuras</span>
            <strong>{props.asignacionesFuturas}</strong>
          </div>
        </article>
        <article>
          <LogIn size={18} aria-hidden="true" />
          <div>
            <span>Último acceso</span>
            <strong>{props.ultimoAcceso ?? "Sin registro"}</strong>
          </div>
        </article>
        <article>
          <UserRoundCheck size={18} aria-hidden="true" />
          <div>
            <span>Cuentas Google</span>
            <strong>{props.cuentasGoogle}</strong>
          </div>
        </article>
      </div>

      <div className="assistant-admin-control-rows">
        <div>
          <div>
            <strong>Nuevas asignaciones</strong>
            <span>
              {props.disponibleGeneral
                ? "Puede aparecer como candidato para nuevas coberturas."
                : "No aparecerá como candidato para nuevas coberturas."}
            </span>
          </div>
          <button
            className="secondary-action"
            disabled={saving !== null || !props.usuarioActivo}
            type="button"
            onClick={() =>
              update("availability", {
                disponibleGeneral: !props.disponibleGeneral,
              })
            }
          >
            {props.disponibleGeneral ? (
              <>
                <PauseCircle size={17} />
                Pausar asignaciones
              </>
            ) : (
              <>
                <PlayCircle size={17} />
                Habilitar asignaciones
              </>
            )}
          </button>
        </div>

        <div>
          <div>
            <strong>Estado temporal</strong>
            <span>
              {props.cesadoHastaProximoInicioSesion
                ? "No recibe notificaciones ni postulaciones hasta reactivarse."
                : "El asistente está habilitado para operar normalmente."}
            </span>
          </div>
          <button
            className={props.cesadoHastaProximoInicioSesion ? "primary-action" : "secondary-action"}
            disabled={saving !== null || !props.usuarioActivo}
            type="button"
            onClick={() =>
              update("cease", {
                cesadoHastaProximoInicioSesion: !props.cesadoHastaProximoInicioSesion,
              })
            }
          >
            {props.cesadoHastaProximoInicioSesion ? (
              <>
                <UserRoundCheck size={17} />
                Reactivar ahora
              </>
            ) : (
              <>
                <UserRoundX size={17} />
                Cesar hasta próximo acceso
              </>
            )}
          </button>
        </div>
      </div>

      {message ? (
        <p className="assistant-admin-control-message" role="status">
          {message}
        </p>
      ) : null}
    </section>
  );
}
