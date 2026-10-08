"use client";

import { BellRing, CheckCircle2, ChevronDown, LoaderCircle, Plus, Save, Search, Trash2, UsersRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

type CohostOption = Readonly<{
  id: string;
  email: string;
  required: boolean;
  name?: string;
}>;

export function SeriesManagement({
  solicitudId,
  cohostOptions,
  initialCohostCuentaIds,
  initialManualCohostEmails,
  suggestedEmails,
  verificationByEmail,
  programPeopleCount,
  hasManageableMeetings,
}: Readonly<{
  solicitudId: string;
  cohostOptions: readonly CohostOption[];
  initialCohostCuentaIds: readonly string[];
  initialManualCohostEmails: readonly string[];
  suggestedEmails: readonly string[];
  verificationByEmail: readonly { email: string; confirmed: number; total: number; pending: number }[];
  programPeopleCount: number;
  hasManageableMeetings: boolean;
}>) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<readonly string[]>(initialCohostCuentaIds);
  const [manualEmails, setManualEmails] = useState<readonly string[]>(normalizeManualEmails(initialManualCohostEmails.join(",")));
  const [query, setQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
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

  const known = [...new Map([
    ...cohostOptions.map((option) => [option.email.toLowerCase(), { email: option.email.toLowerCase(), id: option.id, name: option.name ?? option.email, required: option.required, source: "Cuenta institucional" }]),
    ...suggestedEmails.map((email) => [email.toLowerCase(), { email: email.toLowerCase(), id: null, name: email, required: false, source: "Registro anterior" }])
  ]).values()];
  const selectedEmails = new Set([...cohostOptions.filter((option) => selectedIds.includes(option.id) || option.required).map((option) => option.email.toLowerCase()), ...manualEmails]);
  const options = query.trim()
    ? known.filter((option) => !selectedEmails.has(option.email) && (option.email.includes(query.trim().toLowerCase()) || option.name.toLowerCase().includes(query.trim().toLowerCase()))).slice(0, 7)
    : [];
  const validEmail = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(query.trim());
  const configuredCount = selectedEmails.size;

  function addCohost(email: string) {
    const normalized = email.trim().toLowerCase();
    if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(normalized) || selectedEmails.has(normalized) || configuredCount >= 50) return;
    const institutional = cohostOptions.find((option) => option.email.toLowerCase() === normalized);
    if (institutional) setSelectedIds((current) => [...new Set([...current, institutional.id])]);
    else setManualEmails((current) => [...current, normalized]);
    setQuery("");
    setShowSuggestions(false);
  }
  function removeCohost(email: string) {
    const institutional = cohostOptions.find((option) => option.email.toLowerCase() === email);
    if (institutional) {
      if (institutional.required) return;
      setSelectedIds((current) => current.filter((id) => id !== institutional.id));
    } else setManualEmails((current) => current.filter((value) => value !== email));
  }
  const verification = new Map(verificationByEmail.map((entry) => [entry.email.toLowerCase(), entry]));
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

          <div className="field">
            <label htmlFor="series-cohost-search">Agregar cohost</label>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <Search size={18} aria-hidden="true" />
              <input id="series-cohost-search" type="email" value={query}
                autoComplete="off" placeholder="Nombre o correo electrónico"
                disabled={busy !== null || !hasManageableMeetings || configuredCount >= 50}
                onFocus={() => setShowSuggestions(true)}
                onChange={(event) => { setQuery(event.target.value); setShowSuggestions(true); }}
                onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); if (options.length === 1) addCohost(options[0].email); else if (validEmail) addCohost(query); } }}
                style={{ flex: 1, minWidth: 0 }} />
              <button type="button" className="secondary-action" disabled={!validEmail || selectedEmails.has(query.trim().toLowerCase()) || busy !== null || !hasManageableMeetings} onClick={() => addCohost(query)}><Plus size={16} /> Agregar</button>
            </div>
            {showSuggestions && options.length > 0 && (
              <div role="listbox" aria-label="Sugerencias de cohosts" style={{ border: "1px solid var(--border-color, #d6dce5)", borderRadius: 8, marginTop: 6, maxHeight: 210, overflowY: "auto" }}>
                {options.map((option) => (
                  <button key={option.email} role="option" aria-selected={false} type="button" onClick={() => addCohost(option.email)}
                    style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", background: "transparent", border: 0, cursor: "pointer", textAlign: "left", gap: 10 }}>
                    <span><strong>{option.name}</strong><br /><small>{option.email}</small></span><small>{option.source}</small>
                  </button>
                ))}
              </div>
            )}
            <small>Seleccioná una sugerencia o ingresá un correo nuevo. Máximo 50 cohosts.</small>
          </div>
          <div className="field">
            <strong>Cohosts agregados ({configuredCount})</strong>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
              {[...selectedEmails].sort().map((email) => {
                const institutional = cohostOptions.find((option) => option.email.toLowerCase() === email);
                const status = verification.get(email);
                return <li key={email} style={{ display: "flex", gap: 10, justifyContent: "space-between", alignItems: "center", padding: "9px 10px", border: "1px solid #e0e5ed", borderRadius: 8, overflowWrap: "anywhere" }}>
                  <div><strong>{institutional?.name || email}</strong>{institutional?.name && institutional.name !== email ? <div><small>{email}</small></div> : null}
                    <div><small>{institutional?.required ? "Automático · no eliminable" : institutional ? "Institucional" : "Externo"}</small></div></div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {status?.total && status.confirmed === status.total
                      ? <span style={{ color: "#177245", display: "inline-flex", gap: 4, alignItems: "center" }} title="Confirmado por Google en todos los encuentros"><CheckCircle2 size={17} /> <small>Verificado</small></span>
                      : <small title="La verificación pendiente no equivale a un rechazo de Google">{status ? `${status.confirmed}/${status.total} verificados` : "Sin verificar"}</small>}
                    {!institutional?.required && <button type="button" aria-label={`Quitar ${email}`} title="Quitar" disabled={busy !== null || !hasManageableMeetings} onClick={() => removeCohost(email)} style={{ background: "transparent", border: 0, cursor: "pointer" }}><Trash2 size={16} /></button>}
                  </div>
                </li>;
              })}
            </ul>
            <small>Los estados corresponden a la última lectura registrada de Google Meet; los cambios sin guardar todavía no se verificaron.</small>
          </div>

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
