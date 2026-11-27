"use client";

import {
  BellRing,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  CircleX,
  Eye,
  LoaderCircle,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings2,
  Trash2,
  UsersRound,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { CohostSuggestions } from "./cohost-suggestions";

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
  initialGuestEmails,
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
  initialGuestEmails: readonly string[];
  suggestedPeople: readonly { email: string; name: string; source: string }[];
  seriesInfo: Readonly<{
    titulo: string;
    modalidad: string;
    encuentros: number;
    siguientes: number;
  }>;
  verificationByEmail: readonly {
    email: string;
    confirmed: number;
    total: number;
    pending: number;
  }[];
  programPeopleCount: number;
  hasManageableMeetings: boolean;
}>) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<readonly string[]>(initialCohostCuentaIds);
  const [manualEmails, setManualEmails] = useState<readonly string[]>(
    normalizeManualEmails(initialManualCohostEmails.join(",")),
  );
  const [query, setQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const cohostSearchRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"notify" | "cohosts" | "guests" | "link" | null>(null);
  const [guestEmails, setGuestEmails] = useState<readonly string[]>(initialGuestEmails);
  const [guestInput, setGuestInput] = useState("");
  const [failedCohostChecks, setFailedCohostChecks] = useState(0);
  const [recoveryVisible, setRecoveryVisible] = useState(false);
  const [replacementMeetUrl, setReplacementMeetUrl] = useState("");
  const [message, setMessage] = useState("");

  const [checking, setChecking] = useState(false);
  const [verifiedAt, setVerifiedAt] = useState("");
  const [verificationError, setVerificationError] = useState("");
  const [liveVerification, setLiveVerification] = useState<
    | readonly {
        email: string;
        confirmed: number;
        rejected: number;
        unknown: number;
        total: number;
        meetings: readonly {
          id: string;
          fecha: string;
          result: "confirmed" | "rejected" | "unknown";
        }[];
      }[]
    | null
  >(null);
  const [preview, setPreview] = useState<{
    asunto: string;
    texto: string;
    destinatarios: number;
    encuentros: number;
  } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  async function verifyCohosts(): Promise<void> {
    setChecking(true);
    setVerificationError("");
    try {
      const response = await fetch("/api/v1/reuniones/" + solicitudId + "/cohosts/verificar", {
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "No fue posible consultar los permisos en Google Meet.");
      }
      setLiveVerification(result.entries);
      if (result.entries?.some((item: { rejected: number }) => item.rejected > 0)) {
        setFailedCohostChecks((count) => count + 1);
      }
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
      const response = await fetch("/api/v1/reuniones/" + solicitudId + "/notificar", {
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "No fue posible preparar el correo.");
      }
      setPreview({
        asunto: result.asunto,
        texto: result.texto,
        destinatarios: result.destinatarios,
        encuentros: result.encuentros,
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo mostrar la vista previa.");
    } finally {
      setLoadingPreview(false);
    }
  }

  async function notifyProgram() {
    if (
      !window.confirm(
        `Se reenviará el aviso de esta serie a ${programPeopleCount} ${programPeopleCount === 1 ? "persona" : "personas"} del programa. ¿Continuar?`,
      )
    ) {
      return;
    }
    setBusy("notify");
    setMessage("");
    try {
      const response = await fetch(`/api/v1/reuniones/${solicitudId}/notificar`, {
        method: "POST",
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error ?? "No se pudo reenviar la notificación.");
      }
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
    // Never display stale green checks after a write attempt, including one
    // that Google rejects or only partially applies to a multi-meeting series.
    setLiveVerification(null);
    setVerifiedAt("");
    setVerificationError("");
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
      if (!response.ok) {
        throw new Error(result.error ?? "No se pudieron actualizar los cohosts.");
      }
      setMessage(result.message ?? "Cohosts actualizados.");
      router.refresh();
      await verifyCohosts();
    } catch (error) {
      setFailedCohostChecks((count) => count + 1);
      setMessage(error instanceof Error ? error.message : "No se pudieron actualizar los cohosts.");
    } finally {
      setBusy(null);
    }
  }

  const guestValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestInput.trim());
  const guestCount = guestEmails.length;
  const canRecoverLink =
    failedCohostChecks >= 2 ||
    (liveVerification ?? []).some((item) => item.rejected >= 2) ||
    verificationByEmail.some((item) => item.pending >= 2 && item.total >= 2);

  function addGuest() {
    const email = guestInput.trim().toLowerCase();
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      guestEmails.includes(email) ||
      selectedEmails.has(email) ||
      guestEmails.length >= 100
    ) {
      return;
    }
    setGuestEmails((list) => [...list, email]);
    setGuestInput("");
  }

  async function saveGuests() {
    setBusy("guests");
    setMessage("");
    try {
      const response = await fetch(`/api/v1/reuniones/${solicitudId}/invitados`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails: guestEmails }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error ?? "No se pudo actualizar la lista de invitados.");
      }
      setMessage(
        `Invitados actualizados en ${result.encuentros} encuentros. Correos aceptados: ${result.correosEnviados}.` +
          (result.erroresCorreo
            ? ` ${result.erroresCorreo} correos sin confirmar; revisá el proveedor.`
            : ""),
      );
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "No se pudo actualizar la lista de invitados.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function changeSeriesLink() {
    const url = replacementMeetUrl.trim();
    if (!/^https:\/\/meet\.google\.com\/[a-zA-Z0-9-]+\/?$/.test(url)) {
      setMessage("Ingresá un enlace válido de Google Meet.");
      return;
    }
    if (
      !window.confirm(
        "Se reemplazará el enlace de los encuentros futuros y se enviará un correo individual a todos los cohosts e invitados. Los encuentros pasados no cambiarán. ¿Continuar?",
      )
    ) {
      return;
    }
    setBusy("link");
    setMessage("");
    try {
      const response = await fetch(`/api/v1/reuniones/${solicitudId}/enlace-recuperacion`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetUrl: url }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error ?? "No se pudo sustituir el enlace.");
      }
      setMessage(
        `Enlace actualizado en ${result.encuentros} encuentros futuros. Avisos a cohosts: ${result.cohostsNotificados}; invitados: ${result.invitadosNotificados}.` +
          (result.erroresCorreo
            ? ` ${result.erroresCorreo} correos sin confirmar; revisá el proveedor.`
            : ""),
      );
      setRecoveryVisible(false);
      setReplacementMeetUrl("");
      setLiveVerification(null);
      setVerifiedAt("");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo cambiar el enlace.");
    } finally {
      setBusy(null);
    }
  }

  type KnownCohost = {
    email: string;
    id: string | null;
    name: string;
    required: boolean;
    source: string;
  };
  const knownEntries: Array<readonly [string, KnownCohost]> = [
    ...suggestedPeople.map(
      (person) =>
        [
          person.email.toLowerCase(),
          {
            email: person.email.toLowerCase(),
            id: null,
            name: person.name,
            required: false,
            source: person.source,
          },
        ] as const,
    ),
    ...cohostOptions.map(
      (option) =>
        [
          option.email.toLowerCase(),
          {
            email: option.email.toLowerCase(),
            id: option.id,
            name: option.name || option.email,
            required: option.required,
            source: "Cuenta institucional",
          },
        ] as const,
    ),
  ];
  const known = [...new Map<string, KnownCohost>(knownEntries).values()];
  const selectedEmails = new Set([
    ...cohostOptions
      .filter((option) => selectedIds.includes(option.id) || option.required)
      .map((option) => option.email.toLowerCase()),
    ...manualEmails,
  ]);
  const options = query.trim()
    ? known
        .filter(
          (option) =>
            !selectedEmails.has(option.email) &&
            (option.email.includes(query.trim().toLowerCase()) ||
              option.name.toLowerCase().includes(query.trim().toLowerCase())),
        )
        .slice(0, 7)
    : [];
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(query.trim());
  const configuredCount = selectedEmails.size;

  function addCohost(email: string) {
    const normalized = email.trim().toLowerCase();
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ||
      selectedEmails.has(normalized) ||
      configuredCount >= 50
    ) {
      return;
    }
    const institutional = cohostOptions.find((option) => option.email.toLowerCase() === normalized);
    if (institutional) {
      setSelectedIds((current) => [...new Set([...current, institutional.id])]);
    } else {
      setManualEmails((current) => [...current, normalized]);
    }
    setQuery("");
    setShowSuggestions(false);
    setLiveVerification(null);
  }
  function removeCohost(email: string) {
    setLiveVerification(null);
    const institutional = cohostOptions.find((option) => option.email.toLowerCase() === email);
    if (institutional) {
      if (institutional.required) {
        return;
      }
      setSelectedIds((current) => current.filter((id) => id !== institutional.id));
    } else {
      setManualEmails((current) => current.filter((value) => value !== email));
    }
  }
  const verification = new Map(
    verificationByEmail.map((entry) => [entry.email.toLowerCase(), entry]),
  );
  const live = new Map((liveVerification ?? []).map((entry) => [entry.email.toLowerCase(), entry]));
  return (
    <details className="series-management-v2" id="administrar-serie" open>
      <summary>
        <span className="series-management-v2-icon">
          <UsersRound size={18} aria-hidden="true" />
        </span>
        <div>
          <strong>Administrar serie</strong>
          <small>Cohosts y notificaciones de los próximos encuentros</small>
        </div>
        <span className="series-management-v2-count">
          {configuredCount} {configuredCount === 1 ? "cohost" : "cohosts"}
        </span>
        <ChevronDown size={18} aria-hidden="true" />
      </summary>

      <div className="series-management-v2-content is-single">
        {message ? (
          <p className="meeting-detail-feedback" aria-live="polite">
            {message}
          </p>
        ) : null}

        <details className="series-management-tool-disclosure" open>
          <summary>
            <UsersRound size={17} aria-hidden="true" /> Cohosts{" "}
            <ChevronDown size={16} aria-hidden="true" />
          </summary>
          <article className="series-tool-card series-cohost-manager">
            <header>
              <UsersRound size={19} aria-hidden="true" />
              <div>
                <h3>Cohosts de la serie</h3>
                <p>Se aplican a todos los encuentros activos y futuros.</p>
              </div>
            </header>

            <div className="field">
              <label htmlFor="series-cohost-search">Agregar cohost</label>
              <div className="series-cohost-entry">
                <div className="series-cohost-search-control">
                  <Search size={18} aria-hidden="true" />
                  <input
                    id="series-cohost-search"
                    ref={cohostSearchRef}
                    aria-describedby="series-cohost-search-help"
                    type="email"
                    value={query}
                    autoComplete="off"
                    placeholder="Nombre o correo electrónico"
                    disabled={busy !== null || !hasManageableMeetings || configuredCount >= 50}
                    onFocus={() => setShowSuggestions(true)}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setShowSuggestions(true);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        if (options.length === 1) {
                          addCohost(options[0].email);
                        } else if (validEmail) {
                          addCohost(query);
                        }
                      }
                    }}
                  />
                </div>
                <button
                  type="button"
                  className="secondary-action series-cohost-add"
                  disabled={
                    !validEmail ||
                    selectedEmails.has(query.trim().toLowerCase()) ||
                    busy !== null ||
                    !hasManageableMeetings
                  }
                  onClick={() => addCohost(query)}
                >
                  <Plus size={16} /> Agregar
                </button>
              </div>
              {showSuggestions && options.length > 0 && (
                <CohostSuggestions
                  options={options}
                  onSelect={(email) => {
                    addCohost(email);
                    cohostSearchRef.current?.focus();
                  }}
                />
              )}
              <small id="series-cohost-search-help">
                Seleccioná una sugerencia con Tab y Enter o ingresá un correo nuevo. Máximo 50
                cohosts.
              </small>
            </div>
            <div className="field">
              <div className="series-cohost-toolbar">
                <strong>Cohosts agregados ({configuredCount})</strong>
                <button
                  type="button"
                  className="secondary-action"
                  onClick={saveCohosts}
                  disabled={checking || busy !== null || !hasManageableMeetings}
                  title="Guarda los cohosts seleccionados y vuelve a intentar asignar sus permisos reales en Google Meet"
                >
                  {busy === "cohosts" ? (
                    <LoaderCircle className="button-spinner" size={16} />
                  ) : (
                    <UsersRound size={16} />
                  )}
                  {busy === "cohosts" ? "Asignando…" : "Asignar en Google"}
                </button>
                <button
                  type="button"
                  className="secondary-action"
                  onClick={verifyCohosts}
                  disabled={checking || busy !== null || !hasManageableMeetings}
                >
                  {checking ? (
                    <LoaderCircle className="button-spinner" size={16} />
                  ) : (
                    <RefreshCw size={16} />
                  )}
                  {checking ? "Consultando Google…" : "Verificar en Google"}
                </button>
              </div>
              {verificationError ? (
                <p role="alert" className="series-verification-error">
                  {verificationError}
                </p>
              ) : null}
              {verifiedAt ? (
                <small className="series-verification-note">
                  Consultado: {new Date(verifiedAt).toLocaleString("es-UY")}
                </small>
              ) : null}
              <ul className="series-cohost-items">
                {[...selectedEmails].sort().map((email) => {
                  const institutional = cohostOptions.find(
                    (option) => option.email.toLowerCase() === email,
                  );
                  const status = verification.get(email);
                  const liveStatus = live.get(email);
                  const person = known.find((item) => item.email === email);
                  return (
                    <li key={email} className="series-cohost-item">
                      <div className="series-person">
                        <strong>{person?.name || email}</strong>
                        {person?.name && person.name !== email ? (
                          <div>
                            <small>{email}</small>
                          </div>
                        ) : null}
                        <div>
                          <small>
                            {institutional?.required
                              ? "Automático · no eliminable"
                              : person?.source || "Correo externo"}
                          </small>
                        </div>
                      </div>
                      <div className="series-cohost-status-actions">
                        {liveStatus?.total && liveStatus.confirmed === liveStatus.total ? (
                          <span className="series-verification-status is-verified">
                            <CheckCircle2 size={17} /> <small>Verificado en Google</small>
                          </span>
                        ) : liveStatus?.rejected ? (
                          <span className="series-verification-status is-rejected">
                            <CircleX size={17} />{" "}
                            <small>No confirmado ({liveStatus.rejected})</small>
                          </span>
                        ) : liveStatus ? (
                          <span className="series-verification-status">
                            <CircleHelp size={17} />{" "}
                            <small>
                              {liveStatus.confirmed}/{liveStatus.total} confirmados ·{" "}
                              {liveStatus.unknown} sin respuesta
                            </small>
                          </span>
                        ) : status?.total && status.confirmed === status.total ? (
                          <span className="series-verification-status is-cached">
                            <CheckCircle2 size={17} /> <small>Último registro: verificado</small>
                          </span>
                        ) : (
                          <span className="series-verification-status">
                            <CircleHelp size={17} /> <small>Sin verificar</small>
                          </span>
                        )}
                        {!institutional?.required && (
                          <button
                            type="button"
                            aria-label={`Quitar ${email}`}
                            title="Quitar"
                            disabled={busy !== null || !hasManageableMeetings}
                            onClick={() => removeCohost(email)}
                            className="series-cohost-remove"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
              <small>
                Los estados corresponden a la última lectura registrada de Google Meet; los cambios
                sin guardar todavía no se verificaron.
              </small>
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
              {busy === "cohosts" ? (
                <LoaderCircle className="button-spinner" size={17} />
              ) : (
                <Save size={17} />
              )}
              {busy === "cohosts" ? "Asignando en Google…" : "Guardar y asignar en Google"}
            </button>
            {canRecoverLink && hasManageableMeetings ? (
              <div className="series-link-recovery">
                <div>
                  <strong>¿La asignación de coanfitriones sigue fallando?</strong>
                  <p>
                    Podés sustituir el enlace de los encuentros futuros por otro espacio Meet. Se
                    avisará a todos los coanfitriones e invitados por correo.
                  </p>
                </div>
                {!recoveryVisible ? (
                  <button
                    className="secondary-action"
                    type="button"
                    disabled={busy !== null}
                    onClick={() => setRecoveryVisible(true)}
                  >
                    Cambiar enlace de la serie
                  </button>
                ) : (
                  <div className="series-link-recovery-form">
                    <label htmlFor="series-meet-replacement">Nuevo enlace Google Meet</label>
                    <input
                      id="series-meet-replacement"
                      type="url"
                      inputMode="url"
                      placeholder="https://meet.google.com/abc-defg-hij"
                      value={replacementMeetUrl}
                      onChange={(e) => setReplacementMeetUrl(e.target.value)}
                      disabled={busy !== null}
                    />
                    <small>
                      Solo se modificarán los encuentros programados que aún no comenzaron. Los
                      permisos del nuevo espacio deberán verificarse después del cambio.
                    </small>
                    <div className="series-link-recovery-actions">
                      <button
                        className="primary-action"
                        type="button"
                        disabled={busy !== null || !replacementMeetUrl.trim()}
                        onClick={changeSeriesLink}
                      >
                        {busy === "link" ? "Actualizando…" : "Confirmar nuevo enlace y avisar"}
                      </button>
                      <button
                        className="secondary-action"
                        type="button"
                        disabled={busy !== null}
                        onClick={() => setRecoveryVisible(false)}
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </article>
        </details>

        <details className="series-management-tool-disclosure">
          <summary>
            <UsersRound size={17} aria-hidden="true" /> Invitados{" "}
            <ChevronDown size={16} aria-hidden="true" />
          </summary>
          <article className="series-tool-card series-invited-manager">
            <header>
              <UsersRound size={19} aria-hidden="true" />
              <div>
                <h3>Invitados a la serie</h3>
                <p>
                  Participan de los encuentros futuros sin permisos de coanfitrión. Recibirán un
                  correo con los datos y enlace de Meet.
                </p>
              </div>
            </header>
            <div className="field">
              <label htmlFor="series-guest-email">Agregar invitado</label>
              <div className="series-cohost-entry">
                <input
                  id="series-guest-email"
                  type="email"
                  placeholder="persona@ejemplo.com"
                  value={guestInput}
                  autoComplete="email"
                  disabled={busy !== null || !hasManageableMeetings || guestCount >= 100}
                  onChange={(e) => setGuestInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addGuest();
                    }
                  }}
                />
                <button
                  className="secondary-action series-cohost-add"
                  type="button"
                  onClick={addGuest}
                  disabled={
                    !guestValid ||
                    selectedEmails.has(guestInput.trim().toLowerCase()) ||
                    guestEmails.includes(guestInput.trim().toLowerCase()) ||
                    busy !== null ||
                    !hasManageableMeetings
                  }
                >
                  <Plus size={16} /> Agregar
                </button>
              </div>
              <small>
                Máximo 100 invitados. Las cuentas anfitrionas y coanfitrionas se administran en otra
                sección.
              </small>
            </div>
            <strong>Invitados agregados ({guestCount})</strong>
            <ul className="series-cohost-items">
              {guestEmails.map((email) => (
                <li className="series-cohost-item" key={email}>
                  <span className="series-guest-email">{email}</span>
                  <button
                    type="button"
                    className="series-cohost-remove"
                    aria-label={`Quitar invitado ${email}`}
                    disabled={busy !== null || !hasManageableMeetings}
                    onClick={() => setGuestEmails((list) => list.filter((item) => item !== email))}
                  >
                    <Trash2 size={16} />
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="primary-action series-tool-action"
              onClick={saveGuests}
              disabled={busy !== null || !hasManageableMeetings}
            >
              {busy === "guests" ? (
                <LoaderCircle className="button-spinner" size={17} />
              ) : (
                <Save size={17} />
              )}
              {busy === "guests" ? "Guardando invitados…" : "Guardar invitados y enviar correos"}
            </button>
          </article>
        </details>

        <details className="series-management-tool-disclosure">
          <summary>
            <BellRing size={17} aria-hidden="true" /> Notificaciones{" "}
            <ChevronDown size={16} aria-hidden="true" />
          </summary>
          <article className="series-tool-card series-notify-card">
            <header>
              <BellRing size={19} aria-hidden="true" />
              <div>
                <h3>Reenviar aviso</h3>
                <p>
                  Vuelve a enviar las fechas y enlaces de Meet a las personas activas del programa.
                </p>
              </div>
            </header>
            <div className="series-notify-summary">
              <strong>{programPeopleCount}</strong>
              <span>
                {programPeopleCount === 1
                  ? "persona recibirá el aviso"
                  : "personas recibirán el aviso"}
              </span>
            </div>
            <button
              type="button"
              className="secondary-action series-preview-trigger"
              disabled={loadingPreview || busy !== null}
              onClick={previewNotice}
            >
              {loadingPreview ? (
                <LoaderCircle className="button-spinner" size={16} />
              ) : (
                <Eye size={16} />
              )}{" "}
              Vista previa real
            </button>
            <button
              className="secondary-action series-tool-action"
              disabled={busy !== null || programPeopleCount === 0 || !hasManageableMeetings}
              onClick={notifyProgram}
              type="button"
            >
              {busy === "notify" ? (
                <LoaderCircle className="button-spinner" size={17} />
              ) : (
                <BellRing size={17} />
              )}
              {busy === "notify" ? "Enviando…" : "Reenviar aviso"}
            </button>
          </article>
        </details>
        <details className="series-management-tool-disclosure">
          <summary>
            <Settings2 size={17} aria-hidden="true" /> Configuración{" "}
            <ChevronDown size={16} aria-hidden="true" />
          </summary>
          <article className="series-tool-card series-settings-card">
            <header>
              <Settings2 size={19} />
              <div>
                <h3>Configuración general</h3>
                <p>Información actual de la serie de reuniones.</p>
              </div>
            </header>
            <dl>
              <div>
                <dt>Título</dt>
                <dd>{seriesInfo.titulo}</dd>
              </div>
              <div>
                <dt>Modalidad</dt>
                <dd>{seriesInfo.modalidad}</dd>
              </div>
              <div>
                <dt>Encuentros totales</dt>
                <dd>{seriesInfo.encuentros}</dd>
              </div>
              <div>
                <dt>Activos y futuros</dt>
                <dd>{seriesInfo.siguientes}</dd>
              </div>
            </dl>
            <p>
              Los cambios de horario, modalidad y asistencia se realizan desde el cronograma, sin
              modificar los encuentros ya ocurridos.
            </p>
            <a className="secondary-action" href="#encuentros">
              Ir al cronograma
            </a>
          </article>
        </details>
      </div>
      {preview ? (
        <div className="series-preview" role="dialog" aria-label="Vista previa del aviso">
          <div className="series-preview-heading">
            <div>
              <strong>Vista previa del correo</strong>
              <small>
                {preview.destinatarios} destinatarios · {preview.encuentros} encuentros
              </small>
            </div>
            <button
              type="button"
              aria-label="Cerrar"
              className="secondary-action"
              onClick={() => setPreview(null)}
            >
              <X size={17} />
            </button>
          </div>
          <p>
            <strong>Asunto:</strong> {preview.asunto}
          </p>
          <pre>{preview.texto}</pre>
          <button type="button" className="secondary-action" onClick={() => setPreview(null)}>
            Cerrar vista previa
          </button>
        </div>
      ) : null}
    </details>
  );
}

function normalizeManualEmails(value: string): readonly string[] {
  return [
    ...new Set(
      value
        .split(/[\n,;]+/)
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}
