"use client";

import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  FileCode,
  FileUp,
  KeyRound,
  RefreshCw,
  Save,
  ShieldCheck,
  TestTube2,
  UploadCloud,
  X,
} from "lucide-react";
import { useRef, useState } from "react";
import type { GoogleServiceAccountKey } from "@/src/modules/configuracion/google-workspace.domain";
import { parseServiceAccountKeyJson } from "@/src/modules/configuracion/google-workspace.domain";
import { saveWorkspaceSection, testWorkspaceCredential } from "./workspace-config.client";
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

  const [currentEmail, setCurrentEmail] = useState(email);
  const [keyConfigured, setKeyConfigured] = useState(privateKeyConfigured);
  const [editing, setEditing] = useState(!privateKeyConfigured);

  const [parsedKey, setParsedKey] = useState<GoogleServiceAccountKey | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [showPasteArea, setShowPasteArea] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const isPrincipal = credentialId === "principal";

  function handleKeyContent(content: string, sourceName?: string) {
    setMessage("");
    setSuccess(false);
    try {
      const parsed = parseServiceAccountKeyJson(content);
      setParsedKey(parsed);
      setParseError(null);
      if (sourceName) {
        setFileName(sourceName);
      }
    } catch (error) {
      setParsedKey(null);
      setParseError(
        error instanceof Error
          ? error.message
          : "El archivo no contiene un JSON válido de cuenta de servicio de Google Cloud.",
      );
    }
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    readFile(file);
    // Reset file input value so re-selecting same file triggers onChange
    event.target.value = "";
  }

  function readFile(file: File) {
    if (!file.name.endsWith(".json") && file.type !== "application/json") {
      setParseError("El archivo seleccionado debe tener extensión .json");
      setParsedKey(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = String(e.target?.result ?? "");
      handleKeyContent(text, file.name);
    };
    reader.onerror = () => {
      setParseError("No se pudo leer el archivo seleccionado.");
      setParsedKey(null);
    };
    reader.readAsText(file);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      readFile(file);
    }
  }

  function handlePasteChange(text: string) {
    setPasteText(text);
    if (!text.trim()) {
      setParsedKey(null);
      setParseError(null);
      return;
    }
    handleKeyContent(text, "JSON pegado");
  }

  function cancelEditing() {
    setEditing(false);
    setParsedKey(null);
    setParseError(null);
    setFileName(null);
    setPasteText("");
    setShowPasteArea(false);
    setMessage("");
  }

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!parsedKey) {
      return;
    }

    setBusy("save");
    setSuccess(false);
    setMessage("Guardando credencial…");

    const result = await saveWorkspaceSection({
      seccion: "CREDENCIAL",
      credentialId,
      serviceAccountJson: parsedKey,
    });

    setSuccess(result.ok);
    setMessage(result.message);
    setBusy(null);

    if (!result.ok) {
      return;
    }

    setCurrentEmail(parsedKey.client_email);
    setKeyConfigured(true);
    setEditing(false);
    setParsedKey(null);
    setParseError(null);
    setFileName(null);
    setPasteText("");
    setShowPasteArea(false);
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

  async function copyToClipboard(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(label);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      // Ignorar si el portapapeles no está disponible
    }
  }

  return (
    <form className={`form-section workspace-config ${styles["card"]}`} onSubmit={handleSave}>
      <header className={styles["header"]}>
        <div className={styles["heading"]}>
          <span className={styles["headingIcon"]} aria-hidden="true">
            <KeyRound size={20} />
          </span>
          <div>
            <div className={styles["titleRow"]}>
              <h2>{title}</h2>
              <span
                className={`${styles["badge"]} ${isPrincipal ? styles["badgePrincipal"] : styles["badgeLegacy"]}`}
              >
                {isPrincipal ? "Principal" : "Legacy"}
              </span>
            </div>
            <p>{description}</p>
          </div>
        </div>
        <span
          className={`${styles["statusBadge"]} ${
            keyConfigured && !editing ? styles["statusReady"] : styles["statusPending"]
          }`}
        >
          {keyConfigured && !editing ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
          {keyConfigured && !editing
            ? "Configurada"
            : editing && keyConfigured
              ? "Reemplazando"
              : "Incompleta"}
        </span>
      </header>

      <div className={styles["body"]}>
        {/* VISTA 1: Credencial ya configurada y no en edición */}
        {keyConfigured && !editing ? (
          <div className={styles["configuredContainer"]}>
            <div className={styles["configuredEmailBox"]}>
              <div className={styles["configuredEmailHeader"]}>
                <span className={styles["metaLabel"]}>Cuenta de servicio activa</span>
                <button
                  type="button"
                  className={styles["copyBtn"]}
                  onClick={() => copyToClipboard(currentEmail, "email")}
                  title="Copiar email de la cuenta"
                >
                  {copiedField === "email" ? (
                    <Check size={14} color="var(--brand)" />
                  ) : (
                    <Copy size={14} />
                  )}
                  {copiedField === "email" ? "Copiado" : "Copiar"}
                </button>
              </div>
              <code className={styles["emailCode"]}>{currentEmail}</code>
            </div>

            <div className={`${styles["secretSummary"]} ${styles["secretReady"]}`}>
              <span className={styles["secretIcon"]} aria-hidden="true">
                <ShieldCheck size={19} />
              </span>
              <div className={styles["secretCopy"]}>
                <strong>Clave privada RSA</strong>
                <span>Almacenada de forma cifrada en la base de datos.</span>
              </div>
              <button
                className={`secondary-action ${styles["compactAction"]}`}
                type="button"
                onClick={() => {
                  setEditing(true);
                  setMessage("");
                }}
              >
                <RefreshCw size={15} />
                Reemplazar con archivo JSON
              </button>
            </div>
          </div>
        ) : (
          /* VISTA 2: Carga o reemplazo de credencial mediante JSON */
          <div className={styles["jsonUploadContainer"]}>
            <div className={styles["jsonNotice"]}>
              <p>
                <strong>Solo se aceptan archivos JSON oficiales de Google Cloud.</strong>
                <br />
                En Google Cloud Console andá a{" "}
                <em>
                  IAM y administración → Cuentas de servicio → Claves → Agregar clave → Crear clave
                  nueva → Tipo JSON
                </em>
                .
              </p>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              style={{ display: "none" }}
              onChange={handleFileChange}
            />

            <div
              className={`${styles["dropzone"]} ${isDragging ? styles["dropzoneActive"] : ""}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
            >
              <div className={styles["dropzoneIcon"]}>
                <UploadCloud size={32} />
              </div>
              <div className={styles["dropzoneText"]}>
                <strong>Arrastrá el archivo .json acá</strong>
                <span>o hacé clic para seleccionarlo de tu computadora</span>
              </div>
              <button
                type="button"
                className={`secondary-action ${styles["compactAction"]}`}
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
              >
                <FileUp size={16} />
                Seleccionar archivo .json
              </button>
            </div>

            <div className={styles["pasteToggleContainer"]}>
              <button
                type="button"
                className={styles["toggleLink"]}
                onClick={() => setShowPasteArea(!showPasteArea)}
              >
                <FileCode size={14} />
                {showPasteArea
                  ? "Ocultar editor de texto JSON"
                  : "O pegar contenido JSON directamente como texto"}
              </button>
            </div>

            {showPasteArea ? (
              <div className={styles["pasteArea"]}>
                <textarea
                  className={styles["jsonTextarea"]}
                  rows={6}
                  value={pasteText}
                  onChange={(e) => handlePasteChange(e.target.value)}
                  placeholder='{\n  "type": "service_account",\n  "project_id": "mi-proyecto",\n  "private_key": "-----BEGIN PRIVATE KEY-----...",\n  "client_email": "cuenta@mi-proyecto.iam.gserviceaccount.com"\n}'
                  spellCheck={false}
                />
              </div>
            ) : null}

            {parseError ? (
              <div className={styles["errorBanner"]} role="alert">
                <AlertCircle size={18} />
                <div>
                  <strong>Error en el archivo JSON</strong>
                  <p>{parseError}</p>
                </div>
              </div>
            ) : null}

            {parsedKey ? (
              <div className={styles["previewCard"]}>
                <div className={styles["previewHeader"]}>
                  <CheckCircle2 size={18} color="#236849" />
                  <strong>
                    Archivo JSON validado correctamente {fileName ? `(${fileName})` : ""}
                  </strong>
                </div>

                <div className={styles["previewGrid"]}>
                  <div className={styles["previewItem"]}>
                    <span className={styles["previewLabel"]}>Email de la cuenta</span>
                    <code className={styles["previewValue"]}>{parsedKey.client_email}</code>
                  </div>
                  {parsedKey.project_id ? (
                    <div className={styles["previewItem"]}>
                      <span className={styles["previewLabel"]}>Proyecto Google Cloud</span>
                      <span className={styles["previewValue"]}>{parsedKey.project_id}</span>
                    </div>
                  ) : null}
                  {parsedKey.client_id ? (
                    <div className={styles["previewItem"]}>
                      <div className={styles["previewLabelRow"]}>
                        <span className={styles["previewLabel"]}>ID numérico de cliente</span>
                        <button
                          type="button"
                          className={styles["copyBtnCompact"]}
                          onClick={() => copyToClipboard(parsedKey.client_id!, "clientId")}
                          title="Copiar ID numérico para Google Admin"
                        >
                          {copiedField === "clientId" ? (
                            <Check size={12} color="var(--brand)" />
                          ) : (
                            <Copy size={12} />
                          )}
                        </button>
                      </div>
                      <code className={styles["previewValue"]}>{parsedKey.client_id}</code>
                      <small className={styles["previewHelp"]}>
                        Usá este ID numérico para autorizar la delegación en la consola de Google
                        Workspace.
                      </small>
                    </div>
                  ) : null}
                  {parsedKey.private_key_id ? (
                    <div className={styles["previewItem"]}>
                      <span className={styles["previewLabel"]}>ID de clave</span>
                      <span className={styles["previewSubtext"]}>
                        {parsedKey.private_key_id.slice(0, 16)}…
                      </span>
                    </div>
                  ) : null}
                  <div className={styles["previewItem"]}>
                    <span className={styles["previewLabel"]}>Clave privada</span>
                    <span className={styles["previewSuccessBadge"]}>RSA válida (PEM)</span>
                  </div>
                </div>
              </div>
            ) : null}

            {keyConfigured && editing ? (
              <div className={styles["cancelContainer"]}>
                <button className={styles["cancelKey"]} type="button" onClick={cancelEditing}>
                  <X size={14} />
                  Cancelar reemplazo y conservar credencial actual
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <footer className={styles["footer"]}>
        <div className={styles["feedback"]} role="status" aria-live="polite">
          {message ? (
            <span className={success ? styles["feedbackSuccess"] : styles["feedbackError"]}>
              {message}
            </span>
          ) : editing ? (
            <span>
              {parsedKey
                ? "JSON listo para guardar."
                : "Esperando archivo JSON de cuenta de servicio."}
            </span>
          ) : (
            <span>Credencial guardada y activa.</span>
          )}
        </div>
        <div className={styles["actions"]}>
          {!editing && keyConfigured ? (
            <button
              className="secondary-action"
              type="button"
              onClick={() => void test()}
              disabled={busy !== null}
            >
              <TestTube2 size={17} />
              {busy === "test" ? "Verificando…" : "Verificar credencial"}
            </button>
          ) : null}

          {editing ? (
            <button className="primary-action" type="submit" disabled={busy !== null || !parsedKey}>
              <Save size={17} />
              {busy === "save" ? "Guardando…" : "Guardar credencial JSON"}
            </button>
          ) : null}
        </div>
      </footer>
    </form>
  );
}
