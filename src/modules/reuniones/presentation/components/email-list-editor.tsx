"use client";

import { useId, useState } from "react";
import { ChevronDown, ShieldCheck, Mail, Plus } from "lucide-react";

type EmailEditorProps = Readonly<{
  title: string;
  detail: string;
  emails: readonly string[];
  otherEmails: readonly string[];
  teacherEmail?: string;
  googleOnly?: boolean;
  placeholder: string;
  addLabel: string;
  onChange: (emails: readonly string[]) => void;
}>;

export function EmailListEditor({
  title,
  detail,
  emails,
  otherEmails,
  teacherEmail,
  googleOnly = false,
  placeholder,
  addLabel,
  onChange
}: EmailEditorProps) {
  const errorId = useId();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");

  function addEmail() {
    const email = draft.trim().toLowerCase();
    setError("");
    if (!email) {
      return setError("Ingresá un correo.");
    }
    if (!isValidEmail(email)) {
      return setError("Ingresá un correo válido.");
    }
    if (teacherEmail?.trim().toLowerCase() === email) {
      return setError("El docente ya está incluido automáticamente como cohost.");
    }
    if (emails.includes(email)) {
      return setError("Ese correo ya fue agregado.");
    }
    if (otherEmails.includes(email)) {
      return setError(`Ese correo ya está agregado como ${googleOnly ? "invitado" : "cohost"}.`);
    }
    onChange([...emails, email]);
    setDraft("");
  }

  return (
    <details className="organization-subsection organization-email-editor">
      <summary className="organization-subsection-heading">
        <div>
          <h3>
            {title} <span>(opcional)</span>
          </h3>
          <p>{detail}</p>
        </div>
        <span className="organization-count-pill">
          {emails.length}{" "}
          {emails.length === 1
            ? googleOnly
              ? "adicional"
              : "invitado"
            : googleOnly
              ? "adicionales"
              : "invitados"}
        </span>
        <ChevronDown size={18} aria-hidden="true" className="organization-disclosure-chevron" />
      </summary>
      <div className="organization-email-content">
        {googleOnly ? (
          <div className="organization-google-warning">
            <ShieldCheck size={17} />
            <div>
              <strong>Debe ser una cuenta Google</strong>
              <span>
                El correo tiene que estar asociado a Gmail o Google Workspace. Si no es una cuenta Google, no
                podrá configurarse como cohost.
              </span>
            </div>
          </div>
        ) : (
          <div className="organization-guest-note">
            <Mail size={17} />
            <div>
              <strong>Puede ser cualquier correo electrónico válido</strong>
              <span>No es necesario que sea una cuenta Google ni que pertenezca a flacso.edu.uy.</span>
            </div>
          </div>
        )}
        <div className="organization-email-add-row">
          <input
            type="email"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? errorId : undefined}
            value={draft}
            placeholder={placeholder}
            aria-label={`Correo para ${title.toLowerCase()}`}
            autoComplete="email"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addEmail();
              }
            }}
          />
          <button className="secondary-action" type="button" onClick={addEmail}>
            <Plus size={16} />
            {addLabel}
          </button>
        </div>
        <span id={errorId} className="organization-email-error" role={error ? "alert" : "status"}>
          {error}
        </span>
        {emails.length ? (
          <div className="organization-email-chips">
            {emails.map((email) => (
              <span key={email}>
                <strong>{email}</strong>
                <button
                  type="button"
                  onClick={() => onChange(emails.filter((value) => value !== email))}
                  aria-label={`Quitar ${email}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </details>
  );
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@][^.\s@]*\.[^\s@]+$/.test(email);
}
