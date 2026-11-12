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
  UserCheck,
  UserMinus,
  Users,
  X
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
    tipoAccesoActual === "OPEN" || tipoAccesoActual === "RESTRICTED" ? tipoAccesoActual : "TRUSTED"
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
      tipoAccesoActual === "OPEN" || tipoAccesoActual === "RESTRICTED" ? tipoAccesoActual : "TRUSTED"
    );
    setRequiereGrabacion(requiereGrabacionActual);
    setModalidad(modalidadActual);
    setInicioAsistencia(toLocalDateTimeInput(inicioAsistenciaIso));
    setFinAsistencia(toLocalDateTimeInput(finAsistenciaIso));
  }, [tipoAccesoActual, requiereGrabacionActual, modalidadActual, inicioAsistenciaIso, finAsistenciaIso]);

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
    if (!limpio) {
      return;
    }
    await enviarActualizacion({ agregarCohostEmail: limpio }, `Cohost ${limpio} agregado y sincronizado.`);
    setNuevoCohost("");
  }

  async function quitarCohost(email: string) {
    await enviarActualizacion({ quitarCohostEmail: email }, `Cohost ${email} quitado.`);
  }

  return (
    <details className="content-section operational-disclosure operational-remote-control" open>
      <summary>
        <div>
          <h2>Control remoto en tiempo real</h2>
          <p>
            Modificá política de acceso Meet, requisito de grabación, horarios y cohosts a distancia desde
            Sala Virtual.
          </p>
        </div>
        <span className="status status-ok">
          <Shield size={13} aria-hidden="true" /> Control activo
        </span>
      </summary>

      <div className="operational-disclosure-content">
        <form onSubmit={guardarParametrosGenerales} className="encounter-edit-form">
          <div className="form-grid">
            <label className="field">
              <span>Tipo de acceso a la reunión (Google Meet)</span>
              <select
                value={tipoAcceso}
                onChange={(e) => setTipoAcceso(e.target.value as "OPEN" | "TRUSTED" | "RESTRICTED")}
                disabled={pending || !tieneMeet}
              >
                <option value="OPEN">Abierto (OPEN — cualquiera con enlace entra directo)</option>
                <option value="TRUSTED">
                  Institucional / Confianza (TRUSTED — FLACSO e invitados entran directo)
                </option>
                <option value="RESTRICTED">Restringido (RESTRICTED — solo invitados autorizados)</option>
              </select>
            </label>

            <label className="field">
              <span>Política de grabación (Solicitud del encuentro)</span>
              <select
                value={requiereGrabacion ? "SI" : "NO"}
                onChange={(e) => setRequiereGrabacion(e.target.value === "SI")}
                disabled={pending}
              >
                <option value="SI">Grabación requerida (exigir grabación en este encuentro)</option>
                <option value="NO">Grabación no requerida (opcional)</option>
              </select>
              <small className="muted-text">
                Indica si el encuentro debe grabarse. La grabación en vivo se inicia o detiene desde los
                controles de Google Meet.
              </small>
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

            <div className="form-grid" style={{ gap: "10px" }}>
              <label className="field">
                <span>Inicio de monitoreo</span>
                <input
                  type="datetime-local"
                  value={inicioAsistencia}
                  onChange={(e) => setInicioAsistencia(e.target.value)}
                  disabled={pending}
                />
              </label>

              <label className="field">
                <span>Fin de monitoreo</span>
                <input
                  type="datetime-local"
                  value={finAsistencia}
                  onChange={(e) => setFinAsistencia(e.target.value)}
                  disabled={pending}
                />
              </label>
            </div>
          </div>

          <div style={{ marginTop: "0.75rem" }}>
            <button className="primary-action" type="submit" disabled={pending}>
              {pending ? <LoaderCircle className="button-spinner" size={16} /> : <Save size={16} />}
              {pending ? "Aplicando cambios…" : "Aplicar cambios en tiempo real"}
            </button>
          </div>
        </form>

        <div style={{ marginTop: "1.1rem", paddingTop: "1rem", borderTop: "1px solid #e2e8f0" }}>
          <strong style={{ fontSize: "0.82rem", color: "#334155" }}>
            Cohosts configurados en Google Meet ({cohostEmails.length})
          </strong>

          {cohostEmails.length === 0 ? (
            <p className="muted-text" style={{ margin: "0.4rem 0 0.75rem", fontSize: "0.78rem" }}>
              No hay cohosts adicionales configurados.
            </p>
          ) : (
            <ul className="operational-cohost-chips">
              {cohostEmails.map((email) => (
                <li key={email} className="operational-cohost-chip">
                  <Mail size={13} aria-hidden="true" />
                  <span>{email}</span>
                  <button
                    type="button"
                    onClick={() => quitarCohost(email)}
                    disabled={pending}
                    title={`Quitar cohost ${email}`}
                    aria-label={`Quitar cohost ${email}`}
                  >
                    <X size={13} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <form
            onSubmit={agregarCohost}
            style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "flex-end" }}
          >
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
      </div>
    </details>
  );
}

type FiltroAsistentes = "CONECTADOS" | "SALIERON" | "TODOS" | "SIN_CORREO";

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
  const [filtro, setFiltro] = useState<FiltroAsistentes>("CONECTADOS");
  const [busqueda, setBusqueda] = useState("");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [addingManual, setAddingManual] = useState(false);
  const [nombreEdit, setNombreEdit] = useState("");
  const [emailEdit, setEmailEdit] = useState("");
  const [rolEdit, setRolEdit] = useState<
    "HOST" | "COHOST" | "DOCENTE" | "ASISTENTE_TECNICO" | "PARTICIPANTE"
  >("PARTICIPANTE");
  const [enGrupoEdit, setEnGrupoEdit] = useState(false);
  const [salaGrupoEdit, setSalaGrupoEdit] = useState("");
  const [notasEdit, setNotasEdit] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const conectados = asistentes.filter((a) => a.conectado);
  const desconectados = asistentes.filter((a) => !a.conectado);
  const sinCorreo = asistentes.filter((a) => !a.email);
  const ahoraMs = Date.parse(ahoraIso) || Date.now();

  const listaBase =
    filtro === "CONECTADOS"
      ? conectados
      : filtro === "SALIERON"
        ? desconectados
        : filtro === "SIN_CORREO"
          ? sinCorreo
          : asistentes;

  const termino = busqueda.trim().toLowerCase();
  const listaFiltrada = termino
    ? listaBase.filter(
        (item) =>
          item.nombre.toLowerCase().includes(termino) ||
          (item.email ?? "").toLowerCase().includes(termino) ||
          (item.salaGrupoPequeno ?? "").toLowerCase().includes(termino)
      )
    : listaBase;

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
        className={`operational-attendee-row ${item.conectado ? "is-online" : "is-departed"}`}
      >
        <div className="operational-attendee-row-main">
          <div className="operational-attendee-identity">
            <span
              className={`operational-presence-dot ${item.conectado ? "is-online" : ""}`}
              title={item.conectado ? "Conectado en este momento" : "Se desconectó"}
            />
            <strong>{item.nombre}</strong>
            <span className={`status ${rolBadgeClass(item.rolEnReunion)}`}>
              {rolLabel(item.rolEnReunion)}
            </span>
            {item.tipoAcceso !== "CUENTA_GOOGLE" ? (
              <span className="badge-tag">{tipoAccesoParticipanteLabel(item.tipoAcceso)}</span>
            ) : null}
            {item.enGrupoPequeno ? (
              <span className="status status-warning" title="Asignado a grupo pequeño">
                <Split size={11} aria-hidden="true" />{" "}
                {item.salaGrupoPequeno ? item.salaGrupoPequeno : "Grupo pequeño"}
              </span>
            ) : null}
          </div>

          <div className="operational-attendee-email">
            <Mail size={13} aria-hidden="true" />
            {item.email ? (
              <>
                <code>{item.email}</code>
                <span className="badge-tag">{origenCorreoLabel(item.origenCorreo)}</span>
              </>
            ) : (
              <button
                type="button"
                className="secondary-action operational-row-edit-btn"
                onClick={() => abrirEdicion(item)}
              >
                + Asignar correo
              </button>
            )}
          </div>

          <div className="operational-attendee-time">
            <Clock3 size={12} aria-hidden="true" style={{ marginRight: "4px", verticalAlign: "middle" }} />
            {item.conectado ? (
              <span>
                Hace <strong>{minutosDesdeEntrada} min</strong>
                {item.primeraEntradaAt ? ` · Entró ${formatHoraLocal(item.primeraEntradaAt)}` : ""}
              </span>
            ) : (
              <span>
                Estuvo <strong>{item.minutosConectado} min</strong> ({item.porcentajeAsistencia}%)
                {item.ultimaSalidaAt ? ` · Salió ${formatHoraLocal(item.ultimaSalidaAt)}` : ""}
                {item.numeroConexiones > 1 ? ` · ${item.numeroConexiones} conex.` : ""}
              </span>
            )}
          </div>

          <div>
            <button
              type="button"
              className="secondary-action operational-row-edit-btn"
              onClick={() => (isEditing ? setEditingKey(null) : abrirEdicion(item))}
              disabled={pending}
            >
              <Edit3 size={13} aria-hidden="true" />
              {isEditing ? "Cerrar" : "Editar"}
            </button>
          </div>
        </div>

        {item.notasOperador && !isEditing ? (
          <div style={{ marginTop: "4px", paddingLeft: "14px", fontSize: "0.73rem", color: "#64748b" }}>
            Nota: {item.notasOperador}
          </div>
        ) : null}

        {isEditing ? (
          <form
            onSubmit={(e) => guardarAsistente(e, item.claveParticipante, item.conectado)}
            className="operational-inline-editor"
          >
            <div className="form-grid">
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
                  <option value="ASISTENTE_TECNICO">Asistente de monitoreo</option>
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
                  placeholder="Dejar vacío si está en sala principal (ej: Grupo 1)"
                  disabled={pending}
                />
              </label>
              <label className="field field-wide">
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
            <div style={{ marginTop: "10px", display: "flex", gap: "8px" }}>
              <button type="submit" className="primary-action" disabled={pending}>
                {pending ? <LoaderCircle className="button-spinner" size={15} /> : <Save size={15} />}
                Guardar en base de datos
              </button>
              <button
                type="button"
                className="secondary-action"
                onClick={() => setEditingKey(null)}
                disabled={pending}
              >
                Cancelar
              </button>
            </div>
          </form>
        ) : null}
      </li>
    );
  }

  return (
    <section className="content-section operational-attendance-db">
      <div className="section-heading">
        <div>
          <h2>Asistentes de la reunión ({asistentes.length})</h2>
          <p>Registro en vivo persistido en PostgreSQL con correos, tiempos de conexión y estado actual.</p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
          {enGruposPequenos ? (
            <span className="status status-warning">
              <Split size={13} aria-hidden="true" /> Grupos pequeños ({cantidadGruposPequenos})
            </span>
          ) : null}
          <button
            type="button"
            className="secondary-action operational-row-edit-btn"
            onClick={() => (addingManual ? setAddingManual(false) : abrirNuevoManual())}
          >
            <Plus size={14} aria-hidden="true" />
            {addingManual ? "Cerrar formulario" : "Registrar asistente"}
          </button>
        </div>
      </div>

      <div className="operational-attendee-controls">
        <div className="operational-attendee-tabs" role="tablist" aria-label="Filtrar asistentes">
          <button
            type="button"
            className={`operational-tab-btn ${filtro === "CONECTADOS" ? "is-active" : ""}`}
            onClick={() => setFiltro("CONECTADOS")}
          >
            <UserCheck size={14} aria-hidden="true" />
            Conectados ahora ({conectados.length})
          </button>
          <button
            type="button"
            className={`operational-tab-btn ${filtro === "SALIERON" ? "is-active" : ""}`}
            onClick={() => setFiltro("SALIERON")}
          >
            <UserMinus size={14} aria-hidden="true" />
            Se conectaron y salieron ({desconectados.length})
          </button>
          <button
            type="button"
            className={`operational-tab-btn ${filtro === "TODOS" ? "is-active" : ""}`}
            onClick={() => setFiltro("TODOS")}
          >
            <Users size={14} aria-hidden="true" />
            Todos ({asistentes.length})
          </button>
          {sinCorreo.length > 0 ? (
            <button
              type="button"
              className={`operational-tab-btn ${filtro === "SIN_CORREO" ? "is-active" : ""}`}
              onClick={() => setFiltro("SIN_CORREO")}
            >
              <Mail size={14} aria-hidden="true" />
              Sin correo ({sinCorreo.length})
            </button>
          ) : null}
        </div>

        <input
          type="search"
          className="operational-search-input"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre o correo…"
          aria-label="Buscar asistente por nombre o correo"
        />
      </div>

      {addingManual ? (
        <form
          onSubmit={(e) =>
            guardarAsistente(
              e,
              `manual:${(emailEdit || `${nombreEdit}-${Date.now()}`).trim().toLowerCase()}`,
              true
            )
          }
          className="operational-inline-editor"
          style={{ margin: "12px 16px" }}
        >
          <strong style={{ display: "block", fontSize: "0.85rem", marginBottom: "8px" }}>
            Registrar asistente manualmente en la base de datos
          </strong>
          <div className="form-grid">
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
                <option value="ASISTENTE_TECNICO">Asistente de monitoreo</option>
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
          <div style={{ marginTop: "10px" }}>
            <button type="submit" className="primary-action" disabled={pending || !nombreEdit.trim()}>
              {pending ? <LoaderCircle className="button-spinner" size={15} /> : <Save size={15} />}
              Guardar asistente en DB
            </button>
          </div>
        </form>
      ) : null}

      {message ? (
        <p aria-live="polite" className="muted-text" style={{ margin: "10px 16px" }}>
          <CheckCircle2
            size={14}
            aria-hidden="true"
            style={{ marginRight: "0.3rem", verticalAlign: "middle" }}
          />
          {message}
        </p>
      ) : null}

      {listaFiltrada.length === 0 ? (
        <div style={{ padding: "14px 16px" }}>
          <p className="operational-empty-inline">
            <Users size={16} aria-hidden="true" />
            {termino
              ? "No hay asistentes que coincidan con la búsqueda."
              : filtro === "CONECTADOS"
                ? "No hay asistentes conectados en este momento."
                : filtro === "SALIERON"
                  ? "Ningún asistente se ha desconectado todavía."
                  : "No hay registros para mostrar."}
          </p>
        </div>
      ) : (
        <ul className="operational-attendee-rows">
          {listaFiltrada.map((item) => renderFilaAsistente(item))}
        </ul>
      )}
    </section>
  );
}

function toLocalDateTimeInput(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function formatHoraLocal(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" });
}

function rolLabel(rol: string): string {
  if (rol === "HOST") {
    return "Host";
  }
  if (rol === "COHOST") {
    return "Cohost";
  }
  if (rol === "DOCENTE") {
    return "Docente";
  }
  if (rol === "ASISTENTE_TECNICO") {
    return "Asistente";
  }
  return "Participante";
}

function rolBadgeClass(rol: string): string {
  if (rol === "HOST" || rol === "COHOST") {
    return "status-ok";
  }
  if (rol === "DOCENTE" || rol === "ASISTENTE_TECNICO") {
    return "status-warning";
  }
  return "status-neutral";
}

function tipoAccesoParticipanteLabel(tipo: string): string {
  if (tipo === "CUENTA_GOOGLE") {
    return "Cuenta Google";
  }
  if (tipo === "TELEFONO") {
    return "Teléfono";
  }
  return "Anónimo";
}

function origenCorreoLabel(origen: string): string {
  if (origen === "GOOGLE_MEET") {
    return "Meet";
  }
  if (origen === "REPORTS_API" || origen === "GOOGLE_REPORTS") {
    return "Workspace";
  }
  if (origen === "DIRECTORIO_FLACSO") {
    return "FLACSO";
  }
  if (origen === "MANUAL") {
    return "Manual";
  }
  return "Sin correo";
}
