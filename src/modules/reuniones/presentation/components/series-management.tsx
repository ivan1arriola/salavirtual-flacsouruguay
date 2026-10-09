"use client";

import { BellRing, CheckCircle2, ChevronDown, CircleHelp, CircleX, Eye, LoaderCircle, Plus, RefreshCw, Save, Search, Settings2, Trash2, UsersRound, X } from "lucide-react";
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
  suggestedPeople,
  seriesInfo,
  verificationByEmail,
  programPeopleCount,
  hasManageableMeetings,
}: Readonly<{
  solicitudId: string;
  cohostOptions: readonly CohostOption[];
  initialCohostCuentaIds: readonly string[];
  initialManualCohostEmails: readonly string[];
  suggestedPeople: readonly { email: string; name: string; source: string }[];
  seriesInfo: readonly { titulo: string; modalidad: string; encuentros: number; siguientes: number };
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
  const [tab, setTab] = useState<"cohosts" | "settings" | "notify">("cohosts");
  const [checking, setChecking] = useState(false);
  const [verifiedAt, setVerifiedAt] = useState("");
  const [verificationError, setVerificationError] = useState("");
  const [liveVerification, setLiveVerification] = useState<readonly {
    email: string; confirmed: number; rejected: number; unknown: number; total: number;
    meetings: readonly { id: string; fecha: string; result: "confirmed" | "rejected" | "unknown" }[];
  }[] | null>(null);
  const [preview, setPreview] = useState<{ asunto: string; texto: string; destinatarios: number; encuentros: number } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  async function verifyCohosts(): Promise<void> {
    setChecking(true);
    setVerificationError("");
    try {
      const response = await fetch("/api/v1/reuniones/" + solicitudId + "/cohosts/verificar", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "No fue posible consultar los permisos en Google Meet.");
      setLiveVerification(result.entries);
      setVerifiedAt(result.verifiedAt);
    } catch (error) {
      setLiveVerification(null);
      setVerificationError(error instanceof Error ? error.message : "No se pudo verificar.");
    } finally {
      setChecking(false);
    }
  }

  async function previewNotice(): Promise<void> {
    setLoadingPreview(true);
    setMessage("");
    try {
      const response = await fetch("/api/v1/reuniones/" + solicitudId + "/notificar", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "No fue posible preparar el correo.");
      setPreview({ asunto: result.asunto, texto: result.texto, destinatarios: result.destinatarios, encuentros: result.encuentros });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo mostrar la vista previa.");
    } finally {
      setLoadingPreview(false);
    }
  }

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
      await verifyCohosts();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudieron actualizar los cohosts.");
    } finally {
      setBusy(null);
    }
  }

  type KnownCohost = { email: string; id: string | null; name: string; required: boolean; source: string };
  const knownEntries: Array<readonly [string, KnownCohost]> = [
    ...suggestedPeople.map((person) => [person.email.toLowerCase(), { email: person.email.toLowerCase(), id: null, name: person.name, required: false, source: person.source }] as const),
    ...cohostOptions.map((option) => [option.email.toLowerCase(), { email: option.email.toLowerCase(), id: option.id, name: option.name || option.email, required: option.required, source: "Cuenta institucional" }] as const)
  ];
  const known = [...new Map<string, KnownCohost>(knownEntries).values()];
  const selectedEmails = new Set([...cohostOptions.filter((option) => selectedIds.includes(option.id) || option.required).map((option) => option.email.toLowerCase()), ...manualEmails]);
  const options = query.trim()
    ? known.filter((option) => !selectedEmails.has(option.email) && (option.email.includes(query.trim().toLowerCase()) || option.name.toLowerCase().includes(query.trim().toLowerCase()))).slice(0, 7)
    : [];
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(query.trim());
  const configuredCount = selectedEmails.size;

  function addCohost(email: string) {
    const normalized = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) || selectedEmails.has(normalized) || configuredCount >= 50) return;
    const institutional = cohostOptions.find((option) => option.email.toLowerCase() === normalized);
    if (institutional) setSelectedIds((current) => [...new Set([...current, institutional.id])]);
    else setManualEmails((current) => [...current, normalized]);
    setQuery("");
    setShowSuggestions(false);
    setLiveVerification(null);
  }
  function removeCohost(email: string) {
    setLiveVerification(null);
    const institutional = cohostOptions.find((option) => option.email.toLowerCase() === email);
    if (institutional) {
      if (institutional.required) return;
      setSelectedIds((current) => current.filter((id) => id !== institutional.id));
    } else setManualEmails((current) => current.filter((value) => value !== email));
  }
  const verification = new Map(verificationByEmail.map((entry) => [entry.email.toLowerCase(), entry]));
  const live = new Map((liveVerification ?? []).map((entry) => [entry.email.toLowerCase(), entry]));
  return (
    <details className="series-management-v2" id="administrar-serie" open>
      <summary>
        <span className="series-management-v2-icon"><UsersRound size={18} aria-hidden="true" /></span>
        <div>
          <strong>Administrar serie</strong>
          <small>Cohosts y notificaciones de los próximos encuentros</small>
        </div>
        <span className="series-management-v2-count">{configuredCount} {configuredCount === 1 ? "cohost" : "cohosts"}</span>
        <ChevronDown size={18} aria-hidden="true" />
      </summary>

      <div className="series-management-tabs" role="tablist" aria-label="Secciones de administración">
        <button type="button" role="tab" aria-selected={tab === "cohosts"} className={tab === "cohosts" ? "active" : ""} onClick={() => setTab("cohosts")}><UsersRound size={16}/> Cohosts</button>
        <button type="button" role="tab" aria-selected={tab === "settings"} className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}><Settings2 size={16}/> Configuración</button>
        <button type="button" role="tab" aria-selected={tab === "notify"} className={tab === "notify" ? "active" : ""} onClick={() => setTab("notify")}><BellRing size={16}/> Notificaciones</button>
      </div>
      <div className={"series-management-v2-content" + (tab !== "cohosts" ? " is-single" : "")}>
        {message ? <p className="meeting-detail-feedback" aria-live="polite">{message}</p> : null}

        {tab === "cohosts" ? <article className="series-tool-card series-cohost-manager">
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
            <div className="series-cohost-toolbar">
              <strong>Cohosts agregados ({configuredCount})</strong>
              <button type="button" className="secondary-action" onClick={verifyCohosts} disabled={checking || busy !== null || !hasManageableMeetings}>
                {checking ? <LoaderCircle className="button-spinner" size={16} /> : <RefreshCw size={16} />}
                {checking ? "Consultando Google…" : "Verificar en Google"}
              </button>
            </div>
            {verificationError ? <p role="alert" className="series-verification-error">{verificationError}</p> : null}
            {verifiedAt ? <small className="series-verification-note">Consultado: {new Date(verifiedAt).toLocaleString("es-UY")}</small> : null}
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
              {[...selectedEmails].sort().map((email) => {
                const institutional = cohostOptions.find((option) => option.email.toLowerCase() === email);
                const status = verification.get(email);
                const liveStatus = live.get(email);
                const person = known.find((item) => item.email === email);
                return <li key={email} style={{ display: "flex", gap: 10, justifyContent: "space-between", alignItems: "center", padding: "9px 10px", border: "1px solid #e0e5ed", borderRadius: 8, overflowWrap: "anywhere" }}>
                  <div className="series-person"><strong>{person?.name || email}</strong>{person?.name && person.name !== email ? <div><small>{email}</small></div> : null}
                    <div><small>{institutional?.required ? "Automático · no eliminable" : person?.source || "Correo externo"}</small></div></div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {liveStatus?.total && liveStatus.confirmed === liveStatus.total
                      ? <span className="series-verification-status is-verified"><CheckCircle2 size={17} /> <small>Verificado en Google</small></span>
                      : liveStatus?.rejected
                      ? <span className="series-verification-status is-rejected"><CircleX size={17} /> <small>No confirmado ({liveStatus.rejected})</small></span>
                      : liveStatus
                      ? <span className="series-verification-status"><CircleHelp size={17} /> <small>{liveStatus.confirmed}/{liveStatus.total} confirmados · {liveStatus.unknown} sin respuesta</small></span>
                      : status?.total && status.confirmed === status.total
                      ? <span className="series-verification-status is-cached"><CheckCircle2 size={17} /> <small>Último registro: verificado</small></span>
                      : <span className="series-verification-status"><CircleHelp size={17} /> <small>Sin verificar</small></span>}
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
        </article> : null}

        {tab !== "settings" ? <article className="series-tool-card series-notify-card">
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
          <button type="button" className="secondary-action series-preview-trigger" disabled={loadingPreview || busy !== null} onClick={previewNotice}>{loadingPreview ? <LoaderCircle className="button-spinner" size={16}/> : <Eye size={16}/>} Vista previa real</button>
          <button
            className="secondary-action series-tool-action"
            disabled={busy !== null || programPeopleCount === 0 || !hasManageableMeetings}
            onClick={notifyProgram}
            type="button"
          >
            {busy === "notify" ? <LoaderCircle className="button-spinner" size={17} /> : <BellRing size={17} />}
            {busy === "notify" ? "Enviando…" : "Reenviar aviso"}
          </button>
        </article> : null}
        {tab === "settings" ? <article className="series-tool-card series-settings-card">
          <header><Settings2 size={19}/><div><h3>Configuración general</h3><p>Información actual de la serie de reuniones.</p></div></header>
          <dl>
            <div><dt>Título</dt><dd>{seriesInfo.titulo}</dd></div>
            <div><dt>Modalidad</dt><dd>{seriesInfo.modalidad}</dd></div>
            <div><dt>Encuentros totales</dt><dd>{seriesInfo.encuentros}</dd></div>
            <div><dt>Activos y futuros</dt><dd>{seriesInfo.siguientes}</dd></div>
          </dl>
          <p>Los cambios de horario, modalidad y asistencia se realizan desde el cronograma, sin modificar los encuentros ya ocurridos.</p>
          <a className="secondary-action" href="#encuentros">Ir al cronograma</a>
        </article> : null}
      </div>
      {preview ? <div className="series-preview" role="dialog" aria-label="Vista previa del aviso">
        <div className="series-preview-heading">
          <div><strong>Vista previa del correo</strong><small>{preview.destinatarios} destinatarios · {preview.encuentros} encuentros</small></div>
          <button type="button" aria-label="Cerrar" className="secondary-action" onClick={() => setPreview(null)}><X size={17}/></button>
        </div>
        <p><strong>Asunto:</strong> {preview.asunto}</p>
        <pre>{preview.texto}</pre>
        <button type="button" className="secondary-action" onClick={() => setPreview(null)}>Cerrar vista previa</button>
      </div> : null}
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
