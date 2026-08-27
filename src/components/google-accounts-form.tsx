"use client";

import { Plus, Save, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

export function GoogleAccountsForm({
  userId,
  initialEmails,
  initialEmailPrincipal,
  hasPassword
}: Readonly<{
  userId: string;
  initialEmails: readonly string[];
  initialEmailPrincipal: string | null;
  hasPassword: boolean;
}>) {
  const router = useRouter();
  const [emails, setEmails] = useState<readonly string[]>(initialEmails.length ? initialEmails : [""]);
  const [principalEmail, setPrincipalEmail] = useState(initialEmailPrincipal ?? "");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const firstGoogleEmail = useMemo(
    () => emails.map((email) => email.trim()).find(Boolean) ?? null,
    [emails]
  );
  const effectivePrincipalEmail = firstGoogleEmail ?? principalEmail;

  async function save() {
    setSaving(true);
    setMessage("Guardando…");
    const response = await fetch(`/api/v1/usuarios/${encodeURIComponent(userId)}/cuentas-google`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        emails: emails.filter((email) => email.trim()),
        emailPrincipal: firstGoogleEmail ? undefined : principalEmail.trim() || null
      })
    });
    const result = await response.json();
    if (response.ok) {
      setPrincipalEmail(effectivePrincipalEmail);
      setMessage("Correo y cuentas actualizados.");
      router.refresh();
    } else {
      setMessage(result.error ?? "No se pudo guardar.");
    }
    setSaving(false);
  }

  return (
    <section className="form-section account-form">
      <div className="section-heading compact-heading">
        <div>
          <h2>Correo y cuentas Google</h2>
          <p>{hasPassword ? "También tiene acceso con contraseña." : "Sin contraseña local."}</p>
        </div>
      </div>

      <label className="field">
        <span>Correo electrónico principal</span>
        <input
          type="email"
          value={effectivePrincipalEmail}
          readOnly={Boolean(firstGoogleEmail)}
          placeholder="persona@ejemplo.com"
          onChange={(event) => setPrincipalEmail(event.target.value)}
        />
      </label>
      <p className="muted-text">
        {firstGoogleEmail
          ? "Al tener una cuenta Google asociada, esa cuenta se usa automáticamente como correo principal."
          : "Este correo puede editarse directamente mientras no haya una cuenta Google asociada."}
      </p>

      <div className="section-heading compact-heading">
        <div><h3>Cuentas Google autorizadas</h3><p>Permiten iniciar sesión con Google.</p></div>
      </div>
      <div className="account-email-list">
        {emails.map((email, index) => (
          <div className="account-email-row" key={index}>
            <input
              type="email"
              value={email}
              placeholder="persona@gmail.com"
              onChange={(event) => setEmails(
                emails.map((current, position) => position === index ? event.target.value : current)
              )}
            />
            <button
              className="icon-button"
              type="button"
              title="Quitar cuenta"
              onClick={() => setEmails(emails.filter((_, position) => position !== index))}
            >
              <Trash2 size={18} /><span className="sr-only">Quitar cuenta</span>
            </button>
          </div>
        ))}
      </div>
      <footer className="form-actions">
        <button
          className="secondary-action"
          type="button"
          onClick={() => setEmails([...emails, ""])}
        >
          <Plus size={17} />Agregar cuenta
        </button>
        <span className="muted-text" role="status">{message}</span>
        <button className="primary-action" type="button" disabled={saving} onClick={save}>
          <Save size={17} />Guardar
        </button>
      </footer>
    </section>
  );
}
