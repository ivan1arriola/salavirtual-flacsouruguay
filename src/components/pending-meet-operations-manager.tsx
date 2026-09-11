"use client";

import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Info,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldAlert,
  Trash2
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

export type PendingOperationItem = Readonly<{
  id: string; // eventoProveedorId
  solicitudId: string;
  solicitudTitulo: string;
  programaNombre: string | null;
  docenteNombre: string | null;
  ordinal: number;
  inicioProgramadoAt: string;
  finProgramadoAt: string;
  estadoInstancia: string;
  hostEmail: string | null;
  hostNombre: string | null;
  externalEventId: string | null;
  joinUrl: string | null;
  codigoReunion: string | null;
  operacionPendiente: "PROVISIONAR" | "REPROGRAMAR" | "CONFIGURAR_MEET" | "CANCELAR" | null;
  estadoIntegracion: string;
  errorIntegracion: string | null;
  updatedAt: string;
}>;

const OPERATION_LABELS: Readonly<Record<string, { label: string; description: string }>> = {
  PROVISIONAR: {
    label: "Crear reunión en Google",
    description: "Falta crear o terminar de provisionar el evento y su enlace Meet."
  },
  REPROGRAMAR: {
    label: "Actualizar fecha u horario",
    description: "Google todavía debe reflejar un cambio hecho en la agenda."
  },
  CONFIGURAR_MEET: {
    label: "Aplicar ajustes de Meet",
    description: "El Meet ya existe; faltan ajustes como cohosts, moderación o reportes."
  },
  CANCELAR: {
    label: "Cancelar en Google",
    description: "La reunión ya fue cancelada en la app y falta confirmarlo en Google."
  }
};

function humanizeError(rawError: string | null): { friendly: string; isScopeError: boolean } {
  if (!rawError) {
    return { friendly: "Pendiente de sincronización inicial.", isScopeError: false };
  }
  const norm = rawError.toLowerCase();
  if (norm.includes("insufficient authentication scopes") || norm.includes("insufficient_scope") || norm.includes("access_token_scope_insufficient")) {
    return {
      friendly: "Faltan permisos (scopes) de la API de Google Meet en Google Workspace. El Meet funciona normalmente pero no se pueden sincronizar co-anfitriones por API.",
      isScopeError: true
    };
  }
  if (norm.includes("todavía no terminó de generar el enlace meet")) {
    return { friendly: "Google Calendar demoró en generar el enlace Meet.", isScopeError: false };
  }
  if (norm.includes("la cuenta host no tiene email")) {
    return { friendly: "Falta configurar la cuenta organizadora de la sala.", isScopeError: false };
  }
  return { friendly: rawError, isScopeError: false };
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("es-UY", {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return iso;
  }
}

export function PendingMeetOperationsManager({
  items
}: Readonly<{ items: readonly PendingOperationItem[] }>) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [busyItemIds, setBusyItemIds] = useState<ReadonlySet<string>>(new Set());
  const [globalMessage, setGlobalMessage] = useState<{ text: string; isError?: boolean } | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [expandedErrorIds, setExpandedErrorIds] = useState<ReadonlySet<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<"all" | "ready" | "missing_meet">("all");

  const pendingItems = useMemo(
    () => items.filter((it) => it.operacionPendiente !== null || it.estadoIntegracion === "ERROR"),
    [items]
  );

  const countTotal = pendingItems.length;
  const itemsWithMeet = pendingItems.filter((it) => Boolean(it.joinUrl || it.codigoReunion));
  const itemsWithoutMeet = pendingItems.filter((it) => !it.joinUrl && !it.codigoReunion);
  const countWithMeet = itemsWithMeet.length;
  const countWithoutMeet = itemsWithoutMeet.length;
  const allReady = countTotal > 0 && countWithoutMeet === 0;

  const breakdown = useMemo(() => {
    const counts: Record<string, number> = {
      PROVISIONAR: 0,
      CONFIGURAR_MEET: 0,
      REPROGRAMAR: 0,
      CANCELAR: 0
    };
    for (const it of pendingItems) {
      if (it.operacionPendiente && counts[it.operacionPendiente] !== undefined) {
        counts[it.operacionPendiente]++;
      }
    }
    return Object.entries(OPERATION_LABELS)
      .map(([op, info]) => ({
        operation: op,
        count: counts[op] ?? 0,
        ...info
      }))
      .filter((b) => b.count > 0);
  }, [pendingItems]);

  const hasScopeErrors = pendingItems.some((it) => humanizeError(it.errorIntegracion).isScopeError);

  const filteredItems = useMemo(() => {
    return pendingItems.filter((it) => {
      if (filterType === "ready" && !it.joinUrl && !it.codigoReunion) return false;
      if (filterType === "missing_meet" && (it.joinUrl || it.codigoReunion)) return false;

      if (!searchTerm) return true;
      const q = searchTerm.toLowerCase();
      return (
        it.solicitudTitulo.toLowerCase().includes(q) ||
        (it.programaNombre?.toLowerCase().includes(q) ?? false) ||
        (it.docenteNombre?.toLowerCase().includes(q) ?? false) ||
        (it.codigoReunion?.toLowerCase().includes(q) ?? false) ||
        (it.hostEmail?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [pendingItems, filterType, searchTerm]);

  function toggleErrorDetails(id: string) {
    setExpandedErrorIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function synchronizeAll() {
    setBusy(true);
    setGlobalMessage({ text: "Sincronizando operaciones pendientes con Google…" });
    try {
      const response = await fetch("/api/v1/reuniones/provisionar-pendientes", { method: "POST" });
      const result = await response.json().catch(() => ({}));
      if (response.ok) {
        setGlobalMessage({
          text: [
            `${result.sincronizadas ?? 0} completadas`,
            `${result.pendientesConfiguracion ?? 0} pendientes de ajustes Meet`,
            `${result.errores ?? 0} con error`,
            `${result.enProceso ?? 0} en proceso`
          ].join(" · ")
        });
      } else {
        setGlobalMessage({ text: result.error ?? "No se pudo sincronizar.", isError: true });
      }
    } catch {
      setGlobalMessage({ text: "No se pudo conectar con el servicio de sincronización.", isError: true });
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  async function dismissAllNonBlocking() {
    if (!confirm(`¿Descartar las ${countWithMeet} tareas de ajustes para reuniones que ya tienen enlace Meet funcionando?`)) {
      return;
    }
    setBusy(true);
    setGlobalMessage({ text: "Descartando tareas no bloqueantes…" });
    try {
      const response = await fetch("/api/v1/reuniones/operaciones-integracion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "descartar-no-bloqueantes" })
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok) {
        setGlobalMessage({
          text: `Se descartaron ${result.resultado?.totalDescartadas ?? countWithMeet} operaciones. Las reuniones siguen operativas con sus enlaces Meet.`
        });
      } else {
        setGlobalMessage({ text: result.error ?? "No se pudieron descartar las operaciones.", isError: true });
      }
    } catch {
      setGlobalMessage({ text: "Error de conexión al descartar operaciones.", isError: true });
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  async function reclassifyMisclassified() {
    setBusy(true);
    setGlobalMessage({ text: "Reclasificando operaciones con Meet ya existente…" });
    try {
      const response = await fetch("/api/v1/reuniones/operaciones-integracion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "reclasificar" })
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok) {
        setGlobalMessage({
          text: `Se reclasificaron ${result.resultado?.totalReclasificadas ?? 0} operaciones a 'Aplicar ajustes de Meet'.`
        });
      } else {
        setGlobalMessage({ text: result.error ?? "No se pudo reclasificar.", isError: true });
      }
    } catch {
      setGlobalMessage({ text: "Error de conexión al reclasificar.", isError: true });
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  async function retrySingle(item: PendingOperationItem) {
    setBusyItemIds((prev) => new Set(prev).add(item.id));
    try {
      const response = await fetch("/api/v1/reuniones/provisionar-pendientes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventoProveedorId: item.id,
          operacion: item.joinUrl ? "CONFIGURAR_MEET" : (item.operacionPendiente ?? "PROVISIONAR")
        })
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok) {
        setGlobalMessage({ text: `Reintento completado para: ${item.solicitudTitulo}` });
      } else {
        setGlobalMessage({ text: result.error ?? "No se pudo reintentar.", isError: true });
      }
    } catch {
      setGlobalMessage({ text: "Error de red al reintentar.", isError: true });
    } finally {
      setBusyItemIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
      router.refresh();
    }
  }

  async function dismissSingle(item: PendingOperationItem) {
    setBusyItemIds((prev) => new Set(prev).add(item.id));
    try {
      const response = await fetch("/api/v1/reuniones/operaciones-integracion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accion: "descartar",
          eventoProveedorId: item.id
        })
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok) {
        setGlobalMessage({ text: `Operación descartada para: ${item.solicitudTitulo}. El Meet sigue activo.` });
      } else {
        setGlobalMessage({ text: result.error ?? "No se pudo descartar.", isError: true });
      }
    } catch {
      setGlobalMessage({ text: "Error de red al descartar.", isError: true });
    } finally {
      setBusyItemIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
      router.refresh();
    }
  }

  if (countTotal === 0) {
    return (
      <div className="pending-operations-clean-state">
        <CheckCircle2 size={24} className="text-success" />
        <div>
          <strong>Todas las reuniones están sincronizadas con Google</strong>
          <small>No hay operaciones técnicas ni errores pendientes de integración.</small>
        </div>
      </div>
    );
  }

  return (
    <div className="pending-operations-wrapper">
      <div className="pending-provision">
        <div className="pending-provision-summary">
          <div className="pending-provision-header">
            <strong>{countTotal} {countTotal === 1 ? "operación pendiente" : "operaciones pendientes"} con Google</strong>
            {allReady ? (
              <span className="status status-success">
                <CheckCircle2 size={13} /> {countWithMeet} reuniones con Meet funcionando
              </span>
            ) : countWithoutMeet > 0 ? (
              <span className="status status-error">
                <AlertTriangle size={13} /> {countWithoutMeet} sin enlace Meet
              </span>
            ) : null}
          </div>

          <small className={globalMessage?.isError ? "text-error" : ""}>
            {globalMessage?.text || (allReady
              ? "Las reuniones ya cuentan con su enlace Google Meet generado y están listas para usarse. Los pendientes corresponden a la configuración avanzada de cohosts y moderación."
              : "Existen tareas técnicas pendientes con los servicios de Google.")}
          </small>

          {breakdown.length ? (
            <ul className="settings-list pending-breakdown-list" aria-label="Detalle de operaciones pendientes">
              {breakdown.map(({ operation, count: opCount, label, description }) => (
                <li key={operation}>
                  <span>
                    <strong>{label}</strong>
                    <small>{description}</small>
                  </span>
                  <span className="status status-warning">{opCount}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="pending-provision-actions">
          <button
            className="secondary-action"
            disabled={busy || countTotal === 0}
            onClick={synchronizeAll}
            type="button"
          >
            {busy ? <LoaderCircle className="button-spinner" size={17} /> : <RefreshCw size={17} />}
            {busy ? "Procesando…" : "Sincronizar con Google"}
          </button>

          {countWithMeet > 0 ? (
            <button
              className="ghost-action text-muted"
              disabled={busy}
              onClick={dismissAllNonBlocking}
              title="Quita estas operaciones de la cola de pendientes ya que las clases tienen su enlace Meet listo y funcionan normalmente."
              type="button"
            >
              <Trash2 size={15} /> Descartar pendientes con Meet listo ({countWithMeet})
            </button>
          ) : null}

          {pendingItems.some((it) => it.operacionPendiente === "PROVISIONAR" && Boolean(it.joinUrl)) ? (
            <button
              className="ghost-action text-muted"
              disabled={busy}
              onClick={reclassifyMisclassified}
              title="Corrige la etiqueta de reuniones que ya tienen enlace Meet creado para que no digan 'Crear reunión'."
              type="button"
            >
              Corregir clasificación
            </button>
          ) : null}
        </div>
      </div>

      {hasScopeErrors ? (
        <div className="integration-diagnostic-banner">
          <ShieldAlert size={20} className="diagnostic-banner-icon" />
          <div className="diagnostic-banner-content">
            <strong>Diagnóstico del error: Falta de permisos (scopes) en Google Workspace</strong>
            <p>
              Google devuelve <code>Request had insufficient authentication scopes.</code> Esto ocurre porque la cuenta de servicio institucional aún no tiene autorizados los scopes de Google Meet (<code>meetings.space.settings</code> y <code>meetings.space.created</code>) bajo <em>Delegación en todo el dominio</em> en la Consola de Administración de Google Workspace.
            </p>
            <div className="diagnostic-banner-footer">
              <span className="diagnostic-pill pill-ok">
                <CheckCircle2 size={13} /> Enlaces Meet: Creados y operativos para docentes y alumnos
              </span>
              <span className="diagnostic-pill pill-warn">
                <Info size={13} /> Co-anfitriones por API: Omitidos temporalmente
              </span>
            </div>
          </div>
        </div>
      ) : null}

      <div className="pending-details-toggle-bar">
        <button
          className="pending-toggle-button"
          onClick={() => setExpanded(!expanded)}
          type="button"
          aria-expanded={expanded}
        >
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          <span>{expanded ? "Ocultar detalle de encuentros afectados" : `Ver detalle y gestionar encuentros (${countTotal})`}</span>
        </button>
      </div>

      {expanded ? (
        <div className="pending-details-container">
          <div className="pending-details-toolbar">
            <div className="pending-search-wrapper">
              <Search size={15} />
              <input
                className="pending-search-input"
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por reunión, programa, docente o código Meet…"
                type="search"
                value={searchTerm}
              />
            </div>
            <div className="pending-filter-pills">
              <button
                className={`filter-pill ${filterType === "all" ? "active" : ""}`}
                onClick={() => setFilterType("all")}
                type="button"
              >
                Todas ({pendingItems.length})
              </button>
              <button
                className={`filter-pill ${filterType === "ready" ? "active" : ""}`}
                onClick={() => setFilterType("ready")}
                type="button"
              >
                Con Meet ({countWithMeet})
              </button>
              {countWithoutMeet > 0 ? (
                <button
                  className={`filter-pill ${filterType === "missing_meet" ? "active" : ""}`}
                  onClick={() => setFilterType("missing_meet")}
                  type="button"
                >
                  Sin Meet ({countWithoutMeet})
                </button>
              ) : null}
            </div>
          </div>

          <div className="pending-cards-list">
            {filteredItems.length === 0 ? (
              <p className="empty-filter-note">No se encontraron encuentros con los filtros seleccionados.</p>
            ) : (
              filteredItems.map((item) => {
                const isBusyItem = busyItemIds.has(item.id);
                const hasMeet = Boolean(item.joinUrl || item.codigoReunion);
                const errInfo = humanizeError(item.errorIntegracion);
                const isErrExpanded = expandedErrorIds.has(item.id);

                return (
                  <div className={`pending-card ${hasMeet ? "has-meet" : "missing-meet"}`} key={item.id}>
                    <div className="pending-card-main">
                      <div className="pending-card-title-row">
                        <Link
                          className="pending-card-title-link"
                          href={`/reuniones/${item.solicitudId}`}
                          title="Ver solicitud de reunión"
                        >
                          <strong>{item.solicitudTitulo}</strong>
                        </Link>

                        <div className="pending-card-badges">
                          {hasMeet ? (
                            <span className="status status-success" title="El enlace Meet fue creado y funciona">
                              <CheckCircle2 size={12} /> Meet operativo
                            </span>
                          ) : (
                            <span className="status status-error" title="Falta crear el Meet">
                              <AlertCircle size={12} /> Falta crear Meet
                            </span>
                          )}

                          <span className="status status-warning">
                            {OPERATION_LABELS[item.operacionPendiente ?? ""]?.label ?? (item.operacionPendiente || "Error")}
                          </span>
                        </div>
                      </div>

                      <div className="pending-card-meta">
                        <span>Encuentro {item.ordinal} · {formatDate(item.inicioProgramadoAt)}</span>
                        {item.programaNombre ? <span>· {item.programaNombre}</span> : null}
                        {item.docenteNombre ? <span>· Docente: {item.docenteNombre}</span> : null}
                        {item.hostEmail ? <span>· Sala: {item.hostEmail}</span> : null}
                      </div>

                      {item.joinUrl ? (
                        <div className="pending-card-meet-link">
                          <span>Enlace Meet:</span>
                          <a
                            className="meet-url-badge"
                            href={item.joinUrl}
                            rel="noreferrer"
                            target="_blank"
                          >
                            {item.joinUrl}
                            <ExternalLink size={12} />
                          </a>
                        </div>
                      ) : null}

                      <div className="pending-card-error-box">
                        <div className="pending-card-error-header">
                          <span className="pending-card-error-text">
                            <strong>Diagnóstico:</strong> {errInfo.friendly}
                          </span>
                          {item.errorIntegracion ? (
                            <button
                              className="pending-card-error-toggle"
                              onClick={() => toggleErrorDetails(item.id)}
                              type="button"
                            >
                              {isErrExpanded ? "Ocultar técnico" : "Ver error de Google"}
                            </button>
                          ) : null}
                        </div>
                        {isErrExpanded && item.errorIntegracion ? (
                          <pre className="pending-card-raw-error">
                            <code>{item.errorIntegracion}</code>
                          </pre>
                        ) : null}
                      </div>
                    </div>

                    <div className="pending-card-actions">
                      <button
                        className="secondary-action"
                        disabled={isBusyItem || busy}
                        onClick={() => retrySingle(item)}
                        title="Reintentar sincronización de este encuentro con Google"
                        type="button"
                      >
                        {isBusyItem ? <LoaderCircle className="button-spinner" size={15} /> : <RefreshCw size={15} />}
                        {isBusyItem ? "Reintentando…" : "Reintentar"}
                      </button>

                      <button
                        className="ghost-action text-danger"
                        disabled={isBusyItem || busy}
                        onClick={() => dismissSingle(item)}
                        title={hasMeet ? "Quitar tarea pendiente (el enlace Meet se conserva)" : "Descartar operación"}
                        type="button"
                      >
                        <Trash2 size={14} /> Descartar
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
