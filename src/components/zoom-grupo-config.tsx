"use client";

import { RefreshCw, Save, UsersRound, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { GrupoZoom } from "@/src/integrations/zoom/zoom-grupos-client";
import { resultadoSincronizacion } from "./zoom-grupo-config.domain";

const API_GRUPO = "/api/v1/configuracion/zoom/grupo";
const SIN_CONEXION = "No se pudo conectar con el servidor. Revisá tu conexión y probá de nuevo.";
const ERROR_GRUPOS = "No se pudo obtener la lista de grupos de Zoom. Probá de nuevo.";
const ERROR_GUARDAR = "No se pudo guardar el grupo de Zoom. Probá de nuevo.";

const TEXTO_PENDIENTE = {
  grupos: "Buscando los grupos de Zoom…",
  guardar: "Guardando el grupo…",
  sincronizar: "Sincronizando las cuentas con el grupo…"
} as const;

type Pendiente = keyof typeof TEXTO_PENDIENTE;
type Aviso = Readonly<{ ok: boolean; texto: string }>;

/** Grupo de Zoom elegido y última sincronización. La fecha llega formateada desde el servidor. */
export type ZoomGrupoVisible = Readonly<{
  grupoId: string | null;
  grupoNombre: string | null;
  ultimaSincronizacionFecha: string | null;
  ultimaSincronizacionResultado: string | null;
}>;

export function ZoomGrupoConfig({
  grupoId,
  grupoNombre,
  ultimaSincronizacionFecha,
  ultimaSincronizacionResultado
}: ZoomGrupoVisible) {
  const router = useRouter();
  const [grupos, setGrupos] = useState<readonly GrupoZoom[] | null>(null);
  const [eligiendo, setEligiendo] = useState(false);
  const [seleccion, setSeleccion] = useState(grupoId ?? "");
  const [pendiente, setPendiente] = useState<Pendiente | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);

  // La lista de grupos se pide a Zoom cada vez que se abre el selector, nunca al cargar la página.
  async function abrirSelector() {
    setEligiendo(true);
    setSeleccion(grupoId ?? "");
    setAviso(null);
    setPendiente("grupos");
    try {
      const response = await fetch(API_GRUPO, { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(data?.grupos)) {
        setEligiendo(false);
        setAviso({ ok: false, texto: data?.error ?? ERROR_GRUPOS });
        return;
      }
      setGrupos(data.grupos);
    } catch {
      setEligiendo(false);
      setAviso({ ok: false, texto: SIN_CONEXION });
    } finally {
      setPendiente(null);
    }
  }

  function cerrarSelector() {
    setEligiendo(false);
    setAviso(null);
  }

  async function guardarGrupo() {
    const grupo = grupos?.find(({ id }) => id === seleccion);
    if (!grupo) {
      setAviso({ ok: false, texto: "Elegí un grupo de la lista." });
      return;
    }
    setPendiente("guardar");
    setAviso(null);
    try {
      const response = await fetch(API_GRUPO, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grupoId: grupo.id, grupoNombre: grupo.nombre })
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setAviso({ ok: false, texto: data?.error ?? ERROR_GUARDAR });
        return;
      }
      setAviso({
        ok: true,
        texto: `${data?.message ?? `Grupo de Zoom «${grupo.nombre}» guardado.`} Sincronizá para actualizar las cuentas anfitrionas.`
      });
      setEligiendo(false);
      router.refresh();
    } catch {
      setAviso({ ok: false, texto: SIN_CONEXION });
    } finally {
      setPendiente(null);
    }
  }

  async function sincronizar() {
    setPendiente("sincronizar");
    setAviso(null);
    try {
      const response = await fetch(API_GRUPO, { method: "POST" });
      // El resultado viaja en `ok`/`resumen` aunque la sincronización no se haya podido hacer.
      const resultado = resultadoSincronizacion(await response.json().catch(() => null));
      setAviso({ ok: resultado.ok, texto: resultado.mensaje });
      if (resultado.ok) router.refresh();
    } catch {
      setAviso({ ok: false, texto: SIN_CONEXION });
    } finally {
      setPendiente(null);
    }
  }

  const ocupado = pendiente !== null;

  return (
    <section className="form-section workspace-config settings-room-editor" aria-label="Grupo de Zoom">
      <header className="form-section-title">
        <UsersRound size={22} aria-hidden="true" />
        <div><h2>Grupo de Zoom</h2><p>Las cuentas anfitrionas de Zoom son los miembros de este grupo.</p></div>
      </header>
      <div className="form-grid">
        {grupoId ? null : (
          <p className="form-notice form-notice-error field-wide" role="status">
            Elegí un grupo de Zoom para obtener las cuentas anfitrionas.
          </p>
        )}
        <div className="field">
          <span>Grupo elegido</span>
          <p className="config-secret-state">{grupoNombre ?? (grupoId ? "Grupo sin nombre" : "Ninguno")}</p>
        </div>
        <div className="field">
          <span>Última sincronización</span>
          <p className="config-secret-state">
            {ultimaSincronizacionFecha
              ? `${ultimaSincronizacionFecha}: ${ultimaSincronizacionResultado ?? "sin resultado registrado"}`
              : "Todavía no se sincronizó con el grupo."}
          </p>
        </div>
        {eligiendo && grupos ? (
          grupos.length === 0 ? (
            <p className="config-secret-state field-wide">No hay grupos en la cuenta de Zoom. Creá uno en Zoom y volvé a intentar.</p>
          ) : (
            <label className="field field-wide">
              <span>Grupo de Zoom</span>
              <select value={seleccion} onChange={(event) => setSeleccion(event.target.value)} disabled={ocupado}>
                <option value="" disabled>Elegí un grupo</option>
                {grupos.map((grupo) => (
                  <option key={grupo.id} value={grupo.id}>
                    {grupo.nombre} ({grupo.totalMiembros} {grupo.totalMiembros === 1 ? "miembro" : "miembros"})
                  </option>
                ))}
              </select>
            </label>
          )
        ) : null}
      </div>
      <footer className="form-actions">
        <span className={`form-message${pendiente ? " saving" : aviso?.ok ? " done" : ""}`} role="status">
          {pendiente ? TEXTO_PENDIENTE[pendiente] : aviso?.texto ?? ""}
        </span>
        <div className="workspace-actions">
          {eligiendo ? (
            <>
              <button className="secondary-action" type="button" onClick={cerrarSelector} disabled={ocupado}>
                <X size={16} />Cancelar
              </button>
              <button className="secondary-action" type="button" onClick={guardarGrupo} disabled={ocupado || !seleccion}>
                <Save size={16} />{pendiente === "guardar" ? "Guardando…" : "Guardar grupo"}
              </button>
            </>
          ) : (
            <button className="secondary-action" type="button" onClick={abrirSelector} disabled={ocupado}>
              <UsersRound size={16} />{grupoId ? "Cambiar grupo" : "Elegir grupo"}
            </button>
          )}
          <button className="primary-action" type="button" onClick={sincronizar} disabled={!grupoId || ocupado}>
            <RefreshCw size={16} />{pendiente === "sincronizar" ? "Sincronizando…" : "Sincronizar con el grupo"}
          </button>
        </div>
      </footer>
    </section>
  );
}
