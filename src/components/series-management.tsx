"use client";

import { BellRing, LoaderCircle, Save, UsersRound } from "lucide-react";
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

  return (
    <section className="content-section series-management-section">
      <div className="section-heading">
        <div>
          <h2>Gestión de la serie</h2>
          <p>Reenviá el aviso al programa o actualizá quiénes pueden coorganizar los próximos encuentros.</p>
        </div>
      </div>

      {message ? <p className="meeting-detail-feedback" aria-live="polite">{message}</p> : null}

      <div className="form-grid">
        <div className="field field-wide">
          <span>Notificar al programa</span>
          <div className="auto-room-note">
            <BellRing size={20} aria-hidden="true" />
            <div>
              <strong>Reenviar datos de la serie</strong>
              <span>Envía nuevamente fechas, sala, enlace y credenciales a {programPeopleCount} {programPeopleCount === 1 ? "persona activa" : "personas activas"} del programa.</span>
            </div>
            <button
              className="secondary-action"
              disabled={busy !== null || programPeopleCount === 0 || !hasManageableMeetings}
              onClick={notifyProgram}
              type="button"
            >
              {busy === "notify" ? <LoaderCircle className="button-spinner" size={17} /> : <BellRing size={17} />}
              {busy === "notify" ? "Enviando…" : "Reenviar aviso"}
            </button>
          </div>
        </div>

        <details className="cohost-disclosure field-wide">
          <summary>
            <div>
              <strong>Cohosts de la serie</strong>
              <small>Agregá o quitá cohosts en todos los encuentros activos y futuros.</small>
            </div>
            <span>{selectedIds.length + initialManualCohostEmails.length} configurados</span>
            <UsersRound size={18} aria-hidden="true" />
          </summary>
          <div className="cohost-disclosure-content">
            {cohostOptions.length > 0 ? (
              <fieldset className="field checkbox-list">
                <legend>Cuentas guardadas</legend>
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
              <span>Otros correos</span>
              <textarea
                value={manualEmails}
                disabled={busy !== null || !hasManageableMeetings}
                onChange={(event) => setManualEmails(event.target.value)}
                placeholder="correo@flacso.edu.uy, otro@flacso.edu.uy"
                rows={3}
              />
            </label>
            {!hasManageableMeetings ? (
              <p className="muted-text">No hay encuentros activos o futuros para actualizar.</p>
            ) : null}
            <button
              className="primary-action"
              disabled={busy !== null || !hasManageableMeetings}
              onClick={saveCohosts}
              type="button"
            >
              {busy === "cohosts" ? <LoaderCircle className="button-spinner" size={17} /> : <Save size={17} />}
              {busy === "cohosts" ? "Guardando…" : "Guardar cohosts"}
            </button>
          </div>
        </details>
      </div>
    </section>
  );
}
