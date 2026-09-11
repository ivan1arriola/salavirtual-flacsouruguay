"use client";

import {
  AlertCircle,
  CheckCircle2,
  KeyRound,
  RefreshCw,
  Save,
  ShieldCheck,
  TestTube2,
  X
} from "lucide-react";
import { useState } from "react";
import {
  saveWorkspaceSection,
  testWorkspaceCredential
} from "./workspace-config.client";
import styles from "./workspace-credential-form.module.css";

type BusyAction = "save" | "test" | null;

export function WorkspaceCredentialForm({
  email,
  privateKeyConfigured,
  credentialId = "principal",
  title = "Cuenta de servicio principal",
  description = "Credencial usada para crear reuniones nuevas.",
  onSaved,
}: Readonly<{
  email: string;
  privateKeyConfigured: boolean;
  credentialId?: string;
  title?: string;
  description?: string;
  onSaved?: () => void | Promise<void>;
}>) {
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState<BusyAction>(null);
  const [savedEmail, setSavedEmail] = useState(email);
  const [emailValue, setEmailValue] = useState(email);
  const [privateKey, setPrivateKey] = useState("");
  const [keyConfigured, setKeyConfigured] = useState(privateKeyConfigured);
  const [editingKey, setEditingKey] = useState(!privateKeyConfigured);

  const isPrincipal = credentialId === "principal";
  const emailChanged = emailValue.trim().toLowerCase() !== savedEmail.trim().toLowerCase();
  const keyChanged = privateKey.trim().length > 0;
  const hasUnsavedChanges = emailChanged || keyChanged;
  const showPrivateKey = !keyConfigured || editingKey || emailChanged;
  const keyRequired = !keyConfigured || emailChanged;

  function markDirty() {
    setMessage("");
    setSuccess(false);
  }

  async function save(formData: FormData) {
    setBusy("save");
    setSuccess(false);
    setMessage("Guardando cambios…");

    const submittedEmail = String(formData.get("serviceAccountEmail") ?? "").trim();
    const submittedKey = String(formData.get("privateKey") ?? "");
    const result = await saveWorkspaceSection({
      seccion: "CREDENCIAL",
      credentialId,
      serviceAccountEmail: submittedEmail,
      privateKey: submittedKey
    });

    setSuccess(result.ok);
    setMessage(result.message);
    setBusy(null);

    if (!result.ok) return;

    setSavedEmail(submittedEmail);
    setEmailValue(submittedEmail);
    if (submittedKey.trim()) setKeyConfigured(true);
    setPrivateKey("");
    setEditingKey(false);
    await onSaved?.();
  }

  async function test() {
    setBusy("test");
    setSuccess(false);
    setMessage("Verificando credencial guardada…");
    const result = await testWorkspaceCredential(credentialId);
    setSuccess(result.ok);
    setMessage(result.message);
    setBusy(null);
  }

  function cancelKeyReplacement() {
    setPrivateKey("");
    setEditingKey(false);
    markDirty();
  }

  return (
    <form className={`form-section workspace-config ${styles.card}`} action={save}>
      <header className={styles.header}>
        <div className={styles.heading}>
          <span className={styles.headingIcon} aria-hidden="true"><KeyRound size={20} /></span>
          <div>
            <div className={styles.titleRow}>
              <h2>{title}</h2>
              <span className={`${styles.badge} ${isPrincipal ? styles.badgePrincipal : styles.badgeLegacy}`}>
                {isPrincipal ? "Principal" : "Legacy"}
              </span>
            </div>
            <p>{description}</p>
          </div>
        </div>
        <span className={`${styles.statusBadge} ${keyConfigured ? styles.statusReady : styles.statusPending}`}>
          {keyConfigured ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
          {keyConfigured ? "Configurada" : "Incompleta"}
        </span>
      </header>

      <div className={styles.body}>
        <label className={`field ${styles.emailField}`}>
          <span>Email de la cuenta de servicio</span>
          <input
            type="email"
            name="serviceAccountEmail"
            value={emailValue}
            onChange={(event) => {
              setEmailValue(event.target.value);
              markDirty();
            }}
            required
            spellCheck={false}
          />
          <small>
            {isPrincipal
              ? "Esta cuenta se usa para las operaciones nuevas de Google Workspace."
              : "Esta cuenta solo se usa para recuperar compatibilidad con reuniones históricas."}
          </small>
        </label>

        <section className={`${styles.secretPanel} ${keyConfigured ? styles.secretReady : styles.secretPending}`}>
          <div className={styles.secretSummary}>
            <span className={styles.secretIcon} aria-hidden="true">
              {keyConfigured ? <ShieldCheck size={19} /> : <AlertCircle size={19} />}
            </span>
            <div className={styles.secretCopy}>
              <strong>Clave privada</strong>
              <span>
                {keyConfigured
                  ? "Configurada y almacenada de forma cifrada."
                  : "Todavía no hay una clave privada configurada."}
              </span>
            </div>
            {keyConfigured && !showPrivateKey ? (
              <button
                className={`secondary-action ${styles.compactAction}`}
                type="button"
                onClick={() => {
                  setEditingKey(true);
                  markDirty();
                }}
              >
                <RefreshCw size={15} />
                Reemplazar clave
              </button>
            ) : null}
          </div>

          {showPrivateKey ? (
            <div className={styles.secretEditor}>
              {emailChanged && keyConfigured ? (
                <div className={styles.keyWarning}>
                  <AlertCircle size={16} aria-hidden="true" />
                  <span>Al cambiar el email también tenés que cargar la clave privada correspondiente a esa cuenta.</span>
                </div>
              ) : null}
              <label className={`field ${styles.keyField}`}>
                <span>{keyConfigured ? "Nueva clave privada PEM" : "Clave privada PEM"}</span>
                <textarea
                  name="privateKey"
                  rows={4}
                  value={privateKey}
                  onChange={(event) => {
                    setPrivateKey(event.target.value);
                    markDirty();
                  }}
                  autoComplete="off"
                  required={keyRequired}
                  placeholder="-----BEGIN PRIVATE KEY-----"
                />
                <small>La clave se cifra antes de guardarse y nunca vuelve a mostrarse en la interfaz.</small>
              </label>
              {keyConfigured && editingKey && !emailChanged ? (
                <button className={styles.cancelKey} type="button" onClick={cancelKeyReplacement}>
                  <X size={14} />
                  Cancelar reemplazo
                </button>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>

      <footer className={styles.footer}>
        <div className={styles.feedback} role="status" aria-live="polite">
          {message ? (
            <span className={success ? styles.feedbackSuccess : undefined}>{message}</span>
          ) : hasUnsavedChanges ? (
            <span>Hay cambios sin guardar.</span>
          ) : (
            <span>La configuración mostrada está guardada.</span>
          )}
        </div>
        <div className={styles.actions}>
          <button
            className="secondary-action"
            type="button"
            onClick={() => void test()}
            disabled={busy !== null || hasUnsavedChanges || !keyConfigured}
            title={hasUnsavedChanges ? "Guardá los cambios antes de verificar la credencial." : undefined}
          >
            <TestTube2 size={17} />
            {busy === "test" ? "Verificando…" : "Verificar credencial"}
          </button>
          <button
            className="primary-action"
            type="submit"
            disabled={busy !== null || !hasUnsavedChanges}
          >
            <Save size={17} />
            {busy === "save" ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </footer>
    </form>
  );
}
