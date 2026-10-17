"use client";

import {
  CheckCircle2,
  Clock3,
  Edit3,
  LoaderCircle,
  Mail,
  Plus,
  Save,
  Shield,
  Split,
  Trash2,
  UserCheck,
  UserMinus,
  Users
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { RegistroAsistenciaOperativoView } from "@/src/bootstrap/reunion-operativa.server";

export function OperationalRemoteControlPanel({
  instanciaId,
  tipoAccesoActual,
  requiereGrabacionActual,
  modalidadActual,
  inicioAsistenciaIso,
  finAsistenciaIso,
  cohostEmails,
  tieneMeet
}: Readonly<{
  instanciaId: string;
  tipoAccesoActual: string | null;
  requiereGrabacionActual: boolean;
  modalidadActual: "HIBRIDA" | "VIRTUAL";
  inicioAsistenciaIso: string;
  finAsistenciaIso: string;
  cohostEmails: readonly string[];
  tieneMeet: boolean;
}>) {
  const router = useRouter();
  const [tipoAcceso, setTipoAcceso] = useState<"OPEN" | "TRUSTED" | "RESTRICTED">(
    tipoAccesoActual === "OPEN" || tipoAccesoActual === "RESTRICTED"
      ? tipoAccesoActual
      : "TRUSTED"
  );
  const [requiereGrabacion, setRequiereGrabacion] = useState(requiereGrabacionActual);
  const [modalidad, setModalidad] = useState<"HIBRIDA" | "VIRTUAL">(modalidadActual);
  const [inicioAsistencia, setInicioAsistencia] = useState(toLocalDateTimeInput(inicioAsistenciaIso));
  const [finAsistencia, setFinAsistencia] = useState(toLocalDateTimeInput(finAsistenciaIso));
  const [nuevoCohost, setNuevoCohost] = useState("");
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "warn" | "error"; text: string } | null>(null);

  useEffect(() => {
    setTipoAcceso(
      tipoAccesoActual === "OPEN" || tipoAccesoActual === "RESTRICTED"
        ? tipoAccesoActual
        : "TRUSTED"
    );
    setRequiereGrabacion(requiereGrabacionActual);
    setModalidad(modalidadActual);
    setInicioAsistencia(toLocalDateTimeInput(inicioAsistenciaIso));
    setFinAsistencia(toLocalDateTimeInput(finAsistenciaIso));
  }, [
    tipoAccesoActual,
    requiereGrabacionActual,
    modalidadActual,
    inicioAsistenciaIso,
    finAsistenciaIso
  ]);

  async function enviarActualizacion(payload: Record<string, unknown>, mensajeExito: string) {
    setPending(true);
    setFeedback(null);
    try {
      const response = await fetch(
        `/api/v1/reuniones/instancias/${encodeURIComponent(instanciaId)}/control-operativo`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setFeedback({
          kind: "error",
          text: data.error ?? "No se pudieron aplicar los cambios operativos."
        });
        return;
      }
      if (data.advertenciaGoogle) {
        setFeedback({
          kind: "warn",
          text: `${mensajeExito} (Aviso Google Meet: ${data.advertenciaGoogle})`
        });
      } else {
        setFeedback({
          kind: "ok",
          text: mensajeExito
        });
      }
      router.refresh();
    } catch {
      setFeedback({
        kind: "error",
        text: "No se pudo conectar con el servidor."
      });
    } finally {
      setPending(false);
    }
  }

  async function guardarParametrosGenerales(e: React.FormEvent) {
    e.preventDefault();
    await enviarActualizacion(
      {
        tipoAccesoMeet: tieneMeet ? tipoAcceso : undefined,
        requiereGrabacion,
        modalidad,
        inicioAsistenciaTecnicaAt: inicioAsistencia ? new Date(inicioAsistencia).toISOString() : undefined,
        finAsistenciaTecnicaAt: finAsistencia ? new Date(finAsistencia).toISOString() : undefined
      },
      "Parámetros de la reunión actualizados en tiempo real."
    );
  }

  async function agregarCohost(e: React.FormEvent) {
    e.preventDefault();
    const limpio = nuevoCohost.trim().toLowerCase();
    if (!limpio) return;
    await enviarActualizacion(
      { agregarCohostEmail: limpio },
      `Cohost ${limpio} agregado y sincronizado.`
    );
    setNuevoCohost("");
  }

  async function quitarCohost(email: string) {
    await enviarActualizacion(
      { quitarCohostEmail: email },
      `Cohost ${email} quitado.`
    );
  }

  return (
    <section className="content-section operational-remote-control">
      <div className="section-heading">
        <div>
          <h2>Control remoto en tiempo real</h2>
          <p>Modificá acceso de Google Meet, grabación, modalidad y cohosts a distancia desde Sala Virtual.</p>
        </div>
        <span className="status status-ok">
          <Shield size={14} aria-hidden="true" /> Control activo
        </span>
      </div>

      <form onSubmit={guardarParametrosGenerales} className="encounter-edit-form">
        <div className="operational-facts">
          <label className="field">
            <span>Tipo de acceso a la reunión (Meet)</span>
            <select
              value={tipoAcceso}
              onChange={(e) => setTipoAcceso(e.target.value as "OPEN" | "TRUSTED" | "RESTRICTED")}
              disabled={pending || !tieneMeet}
            >
              <option value="OPEN">Abierto (OPEN — cualquiera con enlace entra directo)</option>
              <option value="TRUSTED">Institucional / Confianza (TRUSTED — FLACSO e invitados entran directo)</option>
              <option value="RESTRICTED">Restringido (RESTRICTED — solo invitados autorizados)</option>
            </select>
          </label>

          <label className="field">
            <span>Grabación requerida</span>
            <select
              value={requiereGrabacion ? "SI" : "NO"}
              onChange={(e) => setRequiereGrabacion(e.target.value === "SI")}
              disabled={pending}
            >
              <option value="SI">Sí, requiere grabación</option>
              <option value="NO">No requiere grabación</option>
            </select>
          </label>

          <label className="field">
            <span>Modalidad operativa</span>
            <select
              value={modalidad}
              onChange={(e) => setModalidad(e.target.value as "HIBRIDA" | "VIRTUAL")}
              disabled={pending}
            >
              <option value="VIRTUAL">Virtual</option>
              <option value="HIBRIDA">Híbrida</option>
            </select>
          </label>

          <label className="field">
            <span>Inicio asistencia técnica</span>
            <input
              type="datetime-local"
              value={inicioAsistencia}
              onChange={(e) => setInicioAsistencia(e.target.value)}
              disabled={pending}
            />
          </label>

          <label className="field">
            <span>Fin asistencia técnica</span>
            <input
              type="datetime-local"
              value={finAsistencia}
              onChange={(e) => setFinAsistencia(e.target.value)}
              disabled={pending}
            />
          </label>
        </div>

        <div className="operational-hero-actions" style={{ marginTop: "0.75rem" }}>
          <button className="primary-action" type="submit" disabled={pending}>
            {pending ? <LoaderCircle className="button-spinner" size={16} /> : <Save size={16} />}
            {pending ? "Aplicando cambios…" : "Aplicar cambios en tiempo real"}
          </button>
        </div>
      </form>

      <div style={{ marginTop: "1.25rem", paddingTop: "1rem", borderTop: "1px solid var(--border-subtle, #e2e8f0)" }}>
        <h3 style={{ fontSize: "0.95rem", marginBottom: "0.5rem" }}>Cohosts configurados ({cohostEmails.length})</h3>
        {cohostEmails.length === 0 ? (
          <p className="muted-text" style={{ marginBottom: "0.75rem" }}>No hay cohosts adicionales configurados.</p>
        ) : (
          <ul className="operational-participant-list" style={{ marginBottom: "0.75rem" }}>
            {cohostEmails.map((email) => (
              <li key={email} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
                <span>
                  <Mail size={14} aria-hidden="true" style={{ marginRight: "0.35rem", verticalAlign: "middle" }} />
                  <strong>{email}</strong>
                </span>
                <button
                  type="button"
                  className="secondary-action"
                  onClick={() => quitarCohost(email)}
                  disabled={pending}
                  title={`Quitar cohost ${email}`}
                >
                  <Trash2 size={14} aria-hidden="true" />
                  Quitar
                </button>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={agregarCohost} style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "flex-end" }}>
          <label className="field" style={{ flex: "1 1 240px", margin: 0 }}>
            <span>Agregar cohost en vivo (correo Google)</span>
            <input
              type="email"
              value={nuevoCohost}
              onChange={(e) => setNuevoCohost(e.target.value)}
              placeholder="ejemplo@flacso.edu.uy"
              disabled={pending}
            />
          </label>
          <button type="submit" className="secondary-action" disabled={pending || !nuevoCohost.trim()}>
            <Plus size={15} aria-hidden="true" />
            Agregar cohost
          </button>
        </form>
      </div>

      {feedback ? (
        <p
          aria-live="polite"
          className={feedback.kind === "error" ? "status-warning-text operational-warning" : "muted-text"}
          style={{ marginTop: "0.75rem" }}
        >
          {feedback.text}
        </p>
      ) : null}
    </section>
  );
}

export function OperationalAttendeeDatabaseManager({
  instanciaId,
  asistentes,
  enGruposPequenos,
  cantidadGruposPequenos,
  ahoraIso
}: Readonly<{
  instanciaId: string;
  asistentes: readonly RegistroAsistenciaOperativoView[];
  enGruposPequenos: boolean;
  cantidadGruposPequenos: number;
  ahoraIso: string;
}>) {
  const router = useRouter();
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [addingManual, setAddingManual] = useState(false);
  const [nombreEdit, setNombreEdit] = useState("");
  const [emailEdit, setEmailEdit] = useState("");
  const [rolEdit, setRolEdit] = useState<"HOST" | "COHOST" | "DOCENTE" | "ASISTENTE_TECNICO" | "PARTICIPANTE">("PARTICIPANTE");
  const [enGrupoEdit, setEnGrupoEdit] = useState(false);
  const [salaGrupoEdit, setSalaGrupoEdit] = useState("");
  const [notasEdit, setNotasEdit] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const conectados = asistentes.filter((a) => a.conectado);
  const desconectados = asistentes.filter((a) => !a.conectado);
  const ahoraMs = Date.parse(ahoraIso) || Date.now();

  function abrirEdicion(item: RegistroAsistenciaOperativoView) {
    setAddingManual(false);
    setEditingKey(item.claveParticipante);
    setNombreEdit(item.nombre);
    setEmailEdit(item.email ?? "");
    setRolEdit(item.rolEnReunion);
    setEnGrupoEdit(item.enGrupoPequeno);
    setSalaGrupoEdit(item.salaGrupoPequeno ?? "");
    setNotasEdit(item.notasOperador ?? "");
    setMessage(null);
  }

  function abrirNuevoManual() {
    setEditingKey(null);
    setAddingManual(true);
    setNombreEdit("");
    setEmailEdit("");
    setRolEdit("PARTICIPANTE");
    setEnGrupoEdit(false);
    setSalaGrupoEdit("");
    setNotasEdit("");
    setMessage(null);
  }

  async function guardarAsistente(e: React.FormEvent, claveParticipante: string, conectado: boolean) {
    e.preventDefault();
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/v1/reuniones/instancias/${encodeURIComponent(instanciaId)}/control-operativo`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            claveParticipante,
            nombre: nombreEdit.trim(),
            email: emailEdit.trim() || null,
            rolEnReunion: rolEdit,
            conectado,
            enGrupoPequeno: enGrupoEdit,
            salaGrupoPequeno: salaGrupoEdit.trim() || null,
            notasOperador: notasEdit.trim() || null
          })
        }
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(result.error ?? "No se pudo guardar el registro de asistencia.");
        return;
      }
      setEditingKey(null);
      setAddingManual(false);
      setMessage("Registro de asistente guardado en la base de datos.");
      router.refresh();
    } catch {
      setMessage("Error de conexión al guardar el asistente.");
    } finally {
      setPending(false);
    }
  }

  function renderFilaAsistente(item: RegistroAsistenciaOperativoView) {
    const isEditing = editingKey === item.claveParticipante;
    const minutosDesdeEntrada = item.primeraEntradaAt
      ? Math.max(1, Math.round((ahoraMs - Date.parse(item.primeraEntradaAt)) / 60_000))
      : item.minutosConectado;

    return (
      <li
        key={item.claveParticipante}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
          padding: "0.75rem",
          borderRadius: "0.5rem",
          border: "1px solid var(--border-subtle, #e2e8f0)"
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.75rem", flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", flexWrap: "wrap" }}>
              <strong>{item.nombre}</strong>
              <span className={`status ${rolBadgeClass(item.rolEnReunion)}`}>
                {rolLabel(item.rolEnReunion)}
              </span>
              <span className="badge-tag">{tipoAccesoParticipanteLabel(item.tipoAcceso)}</span>
              {item.enGrupoPequeno ? (
                <span className="status status-warning" title="Participante en sub-sala o sesión paralela">
                  <Split size={12} aria-hidden="true" />{" "}
                  {item.salaGrupoPequeno ? `Grupo pequeño: ${item.salaGrupoPequeno}` : "En grupo pequeño"}
                </span>
              ) : null}
            </div>

            <div className="muted-text" style={{ fontSize: "0.86rem", display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
              <span>
                <Mail size={13} aria-hidden="true" style={{ marginRight: "0.25rem", verticalAlign: "middle" }} />
                {item.email ? (
                  <>
                    <strong>{item.email}</strong> ({origenCorreoLabel(item.origenCorreo)})
                  </>
                ) : (
                  <em>Sin correo identificado — clic en Editar para asignar</em>
                )}
              </span>

              {item.conectado ? (
                <span>
                  <Clock3 size={13} aria-hidden="true" style={{ marginRight: "0.25rem", verticalAlign: "middle" }} />
                  Conectado hace <strong>{minutosDesdeEntrada} min</strong>
                  {item.primeraEntradaAt ? ` (entró ${formatHoraLocal(item.primeraEntradaAt)})` : ""}
                  {item.minutosConectado > 0 ? ` · Acumulado: ${item.minutosConectado} min` : ""}
                </span>
              ) : (
                <span>
                  <Clock3 size={13} aria-hidden="true" style={{ marginRight: "0.25rem", verticalAlign: "middle" }} />
                  Estuvo <strong>{item.minutosConectado} min</strong> ({item.porcentajeAsistencia}%)
                  {item.primeraEntradaAt ? ` · Entró ${formatHoraLocal(item.primeraEntradaAt)}` : ""}
                  {item.ultimaSalidaAt ? ` · Salió ${formatHoraLocal(item.ultimaSalidaAt)}` : ""}
                  {item.numeroConexiones > 1 ? ` · ${item.numeroConexiones} conexiones` : ""}
                </span>
              )}
            </div>

            {item.notasOperador ? (
              <small className="muted-text">Nota operador: {item.notasOperador}</small>
            ) : null}
          </div>

          <button
            type="button"
            className="secondary-action"
            onClick={() => (isEditing ? setEditingKey(null) : abrirEdicion(item))}
            disabled={pending}
          >
            <Edit3 size={14} aria-hidden="true" />
            {isEditing ? "Cancelar" : "Editar"}
          </button>
        </div>

        {isEditing ? (
          <form
            onSubmit={(e) => guardarAsistente(e, item.claveParticipante, item.conectado)}
            className="encounter-edit-form"
            style={{ marginTop: "0.5rem", paddingTop: "0.5rem", borderTop: "1px dashed var(--border-subtle, #cbd5e1)" }}
          >
            <div className="operational-facts">
              <label className="field">
                <span>Nombre</span>
                <input
                  type="text"
                  value={nombreEdit}
                  onChange={(e) => setNombreEdit(e.target.value)}
                  required
                  disabled={pending}
                />
              </label>
              <label className="field">
                <span>Correo electrónico</span>
                <input
                  type="email"
                  value={emailEdit}
                  onChange={(e) => setEmailEdit(e.target.value)}
                  placeholder="correo@flacso.edu.uy"
                  disabled={pending}
                />
              </label>
              <label className="field">
                <span>Rol en la reunión</span>
                <select
                  value={rolEdit}
                  onChange={(e) => setRolEdit(e.target.value as typeof rolEdit)}
                  disabled={pending}
                >
                  <option value="PARTICIPANTE">Participante</option>
                  <option value="HOST">Host (Organizador)</option>
                  <option value="COHOST">Cohost (Coanfitrión)</option>
                  <option value="DOCENTE">Docente</option>
                  <option value="ASISTENTE_TECNICO">Asistente técnico</option>
                </select>
              </label>
              <label className="field">
                <span>¿En grupo pequeño?</span>
                <select
                  value={enGrupoEdit ? "SI" : "NO"}
                  onChange={(e) => setEnGrupoEdit(e.target.value === "SI")}
                  disabled={pending}
                >
                  <option value="NO">Sala principal</option>
                  <option value="SI">Sí, en grupo pequeño</option>
                </select>
              </label>
              <label className="field">
                <span>Nombre de grupo pequeño (opcional)</span>
                <input
                  type="text"
                  value={salaGrupoEdit}
                  onChange={(e) => setSalaGrupoEdit(e.target.value)}
                  placeholder="Ej: Grupo 1"
                  disabled={pending}
                />
              </label>
              <label className="field">
                <span>Notas del operador</span>
                <input
                  type="text"
                  value={notasEdit}
                  onChange={(e) => setNotasEdit(e.target.value)}
                  placeholder="Observaciones de asistencia"
                  disabled={pending}
                />
              </label>
            </div>
            <button type="submit" className="primary-action" disabled={pending}>
              {pending ? <LoaderCircle className="button-spinner" size={15} /> : <Save size={15} />}
              Guardar en base de datos
            </button>
          </form>
        ) : null}
      </li>
    );
  }

  return (
    <section className="content-section operational-attendance-db">
      <div className="section-heading">
        <div>
          <h2>Registro de asistentes en base de datos</h2>
          <p>
            Lista sincronizada con Google Meet y persistida en PostgreSQL con nombres, correos, tiempos de conexión y grupos pequeños.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
          {enGruposPequenos ? (
            <span className="status status-warning">
              <Split size={14} aria-hidden="true" /> Grupos pequeños activos ({cantidadGruposPequenos})
            </span>
          ) : (
            <span className="status status-neutral">Sala principal única</span>
          )}
          <button
            type="button"
            className="secondary-action"
            onClick={() => (addingManual ? setAddingManual(false) : abrirNuevoManual())}
          >
            <Plus size={15} aria-hidden="true" />
            {addingManual ? "Cancelar registro manual" : "Registrar asistente"}
          </button>
        </div>
      </div>

      {addingManual ? (
        <form
          onSubmit={(e) => guardarAsistente(e, `manual:${(emailEdit || nombreEdit).trim().toLowerCase()}`, true)}
          className="encounter-edit-form"
          style={{ marginBottom: "1rem", padding: "0.85rem", borderRadius: "0.5rem", border: "1px solid var(--border-subtle, #cbd5e1)" }}
        >
          <h3 style={{ fontSize: "0.95rem", marginBottom: "0.5rem" }}>Nuevo registro de asistente en base de datos</h3>
          <div className="operational-facts">
            <label className="field">
              <span>Nombre completo</span>
              <input
                type="text"
                value={nombreEdit}
                onChange={(e) => setNombreEdit(e.target.value)}
                required
                placeholder="Nombre y apellido"
                disabled={pending}
              />
            </label>
            <label className="field">
              <span>Correo electrónico</span>
              <input
                type="email"
                value={emailEdit}
                onChange={(e) => setEmailEdit(e.target.value)}
                placeholder="correo@ejemplo.com"
                disabled={pending}
              />
            </label>
            <label className="field">
              <span>Rol</span>
              <select
                value={rolEdit}
                onChange={(e) => setRolEdit(e.target.value as typeof rolEdit)}
                disabled={pending}
              >
                <option value="PARTICIPANTE">Participante</option>
                <option value="HOST">Host</option>
                <option value="COHOST">Cohost</option>
                <option value="DOCENTE">Docente</option>
                <option value="ASISTENTE_TECNICO">Asistente técnico</option>
              </select>
            </label>
            <label className="field">
              <span>Grupo pequeño (opcional)</span>
              <input
                type="text"
                value={salaGrupoEdit}
                onChange={(e) => {
                  setSalaGrupoEdit(e.target.value);
                  setEnGrupoEdit(Boolean(e.target.value.trim()));
                }}
                placeholder="Ej: Subgrupo A"
                disabled={pending}
              />
            </label>
          </div>
          <button type="submit" className="primary-action" disabled={pending || !nombreEdit.trim()}>
            {pending ? <LoaderCircle className="button-spinner" size={15} /> : <Save size={15} />}
            Guardar asistente en DB
          </button>
        </form>
      ) : null}

      {message ? (
        <p aria-live="polite" className="muted-text" style={{ marginBottom: "0.75rem" }}>
          <CheckCircle2 size={14} aria-hidden="true" style={{ marginRight: "0.3rem", verticalAlign: "middle" }} />
          {message}
        </p>
      ) : null}

      <div style={{ display: "grid", gap: "1.25rem" }}>
        <div>
          <h3 style={{ fontSize: "0.95rem", marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <UserCheck size={16} aria-hidden="true" />
            Conectados en este momento ({conectados.length})
          </h3>
          {conectados.length === 0 ? (
            <p className="operational-empty-inline">
              <Users size={16} aria-hidden="true" />
              No hay asistentes conectados en este momento.
            </p>
          ) : (
            <ul className="operational-participant-list" style={{ display: "grid", gap: "0.5rem" }}>
              {conectados.map((item) => renderFilaAsistente(item))}
            </ul>
          )}
        </div>

        <div>
          <h3 style={{ fontSize: "0.95rem", marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <UserMinus size={16} aria-hidden="true" />
            Se conectaron y salieron ({desconectados.length})
          </h3>
          {desconectados.length === 0 ? (
            <p className="operational-empty-inline">
              <Clock3 size={16} aria-hidden="true" />
              Ningún asistente se ha desconectado todavía.
            </p>
          ) : (
            <ul className="operational-participant-list" style={{ display: "grid", gap: "0.5rem" }}>
              {desconectados.map((item) => renderFilaAsistente(item))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function toLocalDateTimeInput(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function formatHoraLocal(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" });
}

function rolLabel(rol: string): string {
  if (rol === "HOST") return "Host";
  if (rol === "COHOST") return "Cohost";
  if (rol === "DOCENTE") return "Docente";
  if (rol === "ASISTENTE_TECNICO") return "Asistente técnico";
  return "Participante";
}

function rolBadgeClass(rol: string): string {
  if (rol === "HOST" || rol === "COHOST") return "status-ok";
  if (rol === "DOCENTE" || rol === "ASISTENTE_TECNICO") return "status-warning";
  return "status-neutral";
}

function tipoAccesoParticipanteLabel(tipo: string): string {
  if (tipo === "CUENTA_GOOGLE") return "Cuenta Google";
  if (tipo === "TELEFONO") return "Teléfono";
  return "Anónimo";
}

function origenCorreoLabel(origen: string): string {
  if (origen === "GOOGLE_MEET") return "Google Meet";
  if (origen === "REPORTS_API") return "Auditoría Workspace";
  if (origen === "DIRECTORIO_FLACSO") return "Directorio FLACSO";
  if (origen === "MANUAL") return "Asignado manualmente";
  return "Sin correo";
}

