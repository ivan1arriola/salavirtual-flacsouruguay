"use client";

import { BellRing, ChevronDown, LoaderCircle, Save, UsersRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

type CohostOption = Readonly<{
  id: string;
  email: string;
  required: boolean;
}>;

export function SeriesManagement({
  solicitudId,
  cohostOptions,
  initialCohostCuentaIds,
  initialManualCohostEmails,
  programPeopleCount,
  hasManageableMeetings,
}: Readonly<{
  solicitudId: string;
  cohostOptions: readonly CohostOption[];
  initialCohostCuentaIds: readonly string[];
  initialManualCohostEmails: readonly string[];
  programPeopleCount: number;
  hasManageableMeetings: boolean;
}>) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<readonly string[]>(initialCohostCuentaIds);
  const [manualEmails, setManualEmails] = useState(initialManualCohostEmails.join(", "));
  const [busy, setBusy] = useState<"notify" | "cohosts" | null>(null);
  const [message, setMessage] = useState("");

  async function notifyProgram() {
    if (!window.confirm(`Se reenviará el aviso de esta serie a ${programPeopleCount} ${programPeopleCount === 1 ? "persona" : "personas"} del programa. ¿Continuar?`)) return;
    setBusy("notify");
    setMessage("");
    try {
      const response = await fetch(`/api/v1/reuniones/${solicitudId}/notificar`, { method: "POST" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "No se pudo reenviar la notificación.");
      setMessage(result.message ?? "Notificación reenviada.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo reenviar la notificación.");
    } finally {
      setBusy(null);
    }
  }

  async function saveCohosts() {
    setBusy("cohosts");
    setMessage("");
    try {
      const response = await fetch(`/api/v1/reuniones/${solicitudId}/cohosts`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cohostCuentaIds: selectedIds,
          cohostEmailsManual: manualEmails,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "No se pudieron actualizar los cohosts.");
      setMessage(result.message ?? "Cohosts actualizados.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudieron actualizar los cohosts.");
    } finally {
      setBusy(null);
    }
  }

  function toggleCohost(id: string, checked: boolean) {
    setSelectedIds((current) => checked
      ? [...new Set([...current, id])]
      : current.filter((value) => value !== id));
  }

  const manualCount = normalizeManualEmails(manualEmails).length;
  const configuredCount = selectedIds.length + manualCount;

  return (
    <details className="series-management-v2" id="administrar-serie">
      <summary>
        <span className="series-management-v2-icon"><UsersRound size={18} aria-hidden="true" /></span>
        <div>
          <strong>Administrar serie</strong>
          <small>Cohosts y notificaciones de los próximos encuentros</small>
        </div>
        <span className="series-management-v2-count">{configuredCount} {configuredCount === 1 ? "cohost" : "cohosts"}</span>
        <ChevronDown size={18} aria-hidden="true" />
      </summary>

      <div className="series-management-v2-content">
        {message ? <p className="meeting-detail-feedback" aria-live="polite">{message}</p> : null}

        <article className="series-tool-card">
          <header>
            <UsersRound size={19} aria-hidden="true" />
            <div>
              <h3>Cohosts de la serie</h3>
              <p>Se aplican a todos los encuentros activos y futuros.</p>
            </div>
          </header>

          {cohostOptions.length > 0 ? (
            <fieldset className="field checkbox-list series-cohost-list">
              <legend>Cuentas institucionales</legend>
              {cohostOptions.map((cohost) => (
                <label key={cohost.id}>
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(cohost.id) || cohost.required}
                    disabled={busy !== null || cohost.required || !hasManageableMeetings}
                    onChange={(event) => toggleCohost(cohost.id, event.target.checked)}
                  />
                  <span>{cohost.email}{cohost.required ? " · automático" : ""}</span>
                </label>
              ))}
            </fieldset>
          ) : null}

          <label className="field">
            <span>Otros correos Google</span>
            <textarea
              value={manualEmails}
              disabled={busy !== null || !hasManageableMeetings}
              onChange={(event) => setManualEmails(event.target.value)}
              placeholder="correo@gmail.com, persona@organizacion.edu"
              rows={3}
            />
          </label>

          {!hasManageableMeetings ? (
            <p className="muted-text">No hay encuentros activos o futuros para actualizar.</p>
          ) : null}

          <button
            className="primary-action series-tool-action"
            disabled={busy !== null || !hasManageableMeetings}
            onClick={saveCohosts}
            type="button"
          >
            {busy === "cohosts" ? <LoaderCircle className="button-spinner" size={17} /> : <Save size={17} />}
            {busy === "cohosts" ? "Guardando…" : "Guardar cohosts"}
          </button>
        </article>

        <article className="series-tool-card series-notify-card">
          <header>
            <BellRing size={19} aria-hidden="true" />
            <div>
              <h3>Reenviar aviso</h3>
              <p>Vuelve a enviar las fechas y enlaces de Meet a las personas activas del programa.</p>
            </div>
          </header>
          <div className="series-notify-summary">
            <strong>{programPeopleCount}</strong>
            <span>{programPeopleCount === 1 ? "persona recibirá el aviso" : "personas recibirán el aviso"}</span>
          </div>
          <button
            className="secondary-action series-tool-action"
            disabled={busy !== null || programPeopleCount === 0 || !hasManageableMeetings}
            onClick={notifyProgram}
            type="button"
          >
            {busy === "notify" ? <LoaderCircle className="button-spinner" size={17} /> : <BellRing size={17} />}
            {busy === "notify" ? "Enviando…" : "Reenviar aviso"}
          </button>
        </article>
      </div>
    </details>
  );
}

function normalizeManualEmails(value: string): readonly string[] {
  return [...new Set(
    value
      .split(/[\n,;]+/)
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  )];
}
