"use client";

import { Info, RefreshCw, Save, TriangleAlert, UsersRound, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { GrupoZoom } from "@/src/integrations/zoom/zoom-grupos-client";
import {
  leerVistaPrevia,
  pedidoDeSincronizacion,
  resultadoSincronizacion,
  puedeRevisarSincronizacion,
  vistaPreviaSinCambios,
  type VistaPreviaSincronizacion
} from "./zoom-grupo-config.domain";

const API_GRUPO = "/api/v1/configuracion/zoom/grupo";
const SIN_CONEXION = "No se pudo conectar con el servidor. Revisá tu conexión y probá de nuevo.";
const ERROR_GRUPOS = "No se pudo obtener la lista de grupos de Zoom. Probá de nuevo.";
const ERROR_GUARDAR = "No se pudo guardar el grupo de Zoom. Probá de nuevo.";

const TEXTO_PENDIENTE = {
  grupos: "Buscando los grupos de Zoom…",
  guardar: "Guardando el grupo…",
  vistaPrevia: "Revisando qué cambiaría en las cuentas…",
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
  const [vistaPrevia, setVistaPrevia] = useState<VistaPreviaSincronizacion | null>(null);

  // La lista de grupos se pide a Zoom cada vez que se abre el selector, nunca al cargar la página.
  async function abrirSelector() {
    setEligiendo(true);
    setSeleccion(grupoId ?? "");
    setAviso(null);
    setVistaPrevia(null);
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
    setVistaPrevia(null);
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
      setVistaPrevia(null);
      router.refresh();
    } catch {
      setAviso({ ok: false, texto: SIN_CONEXION });
    } finally {
      setPendiente(null);
    }
  }

  // Primer paso de «Sincronizar con el grupo»: qué cambiaría, sin tocar ninguna cuenta.
  async function revisarSincronizacion() {
    setPendiente("vistaPrevia");
    setAviso(null);
    setVistaPrevia(null);
    try {
      const response = await fetch(API_GRUPO, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vistaPrevia: true })
      });
      const resultado = leerVistaPrevia(await response.json().catch(() => null));
      if (resultado.ok) setVistaPrevia(resultado.vistaPrevia);
      else setAviso({ ok: false, texto: resultado.mensaje });
    } catch {
      setAviso({ ok: false, texto: SIN_CONEXION });
    } finally {
      setPendiente(null);
    }
  }

  async function sincronizar(revisada: VistaPreviaSincronizacion) {
    setPendiente("sincronizar");
    setAviso(null);
    try {
      const response = await fetch(API_GRUPO, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pedidoDeSincronizacion(revisada))
      });
      // El resultado viaja en `ok`/`resumen` aunque la sincronización no se haya podido hacer.
      const resultado = resultadoSincronizacion(await response.json().catch(() => null));
      setAviso({ ok: resultado.ok, texto: resultado.mensaje });
      setVistaPrevia(null);
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
      {vistaPrevia ? (
        <VistaPreviaSincronizacionPanel
          vistaPrevia={vistaPrevia}
          ocupado={ocupado}
          onConfirmar={() => sincronizar(vistaPrevia)}
          onCancelar={() => setVistaPrevia(null)}
        />
      ) : null}
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
          <button
            className="primary-action"
            type="button"
            onClick={revisarSincronizacion}
            disabled={!puedeRevisarSincronizacion({ grupoId, ocupado, eligiendo, hayVistaPrevia: vistaPrevia !== null })}
          >
            <RefreshCw size={16} />{pendiente === "vistaPrevia" ? "Revisando…" : "Sincronizar con el grupo"}
          </button>
        </div>
      </footer>
    </section>
  );
}

function reunionesFuturas(cantidad: number): string {
  return `${cantidad} ${cantidad === 1 ? "reunión futura" : "reuniones futuras"}`;
}

function ListaDeCuentas({ titulo, cuentas }: Readonly<{ titulo: string; cuentas: readonly string[] }>) {
  if (cuentas.length === 0) return null;
  return (
    <details open>
      <summary>{titulo} ({cuentas.length})</summary>
      <ul>{cuentas.map((cuenta, indice) => <li key={`${indice}-${cuenta}`}>{cuenta}</li>)}</ul>
    </details>
  );
}

/** Lo que cambiaría la sincronización y la confirmación explícita; se exporta para probarlo sin estado. */
export function VistaPreviaSincronizacionPanel({
  vistaPrevia,
  ocupado,
  onConfirmar,
  onCancelar
}: Readonly<{
  vistaPrevia: VistaPreviaSincronizacion;
  ocupado: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
}>) {
  const { masivo, avisoMasivo, sinLicencia } = vistaPrevia;
  return (
    <div className={`workspace-resync-feedback ${masivo ? "is-error" : "is-warning"}`} role={masivo ? "alert" : "status"}>
      {masivo ? <TriangleAlert size={17} aria-hidden="true" /> : <Info size={17} aria-hidden="true" />}
      <div>
        <strong>
          {masivo ? "Atención: esta sincronización cambia muchas cuentas" : "Revisá lo que va a cambiar antes de sincronizar"}
        </strong>
        {masivo ? (
          <span>
            {avisoMasivo ?? "Esta sincronización cambiaría muchas cuentas."} Comprobá que el grupo elegido sea el correcto:
            si no lo es, cancelá y elegí otro grupo.
          </span>
        ) : null}
        <span>
          {vistaPreviaSinCambios(vistaPrevia)
            ? "No cambia ninguna cuenta: las salas ya coinciden con el grupo."
            : `Resultado: ${vistaPrevia.resumen}.`}
        </span>
        {sinLicencia.length > 0 ? (
          <span>{sinLicencia.length} sin licencia: esas cuentas no reciben reuniones nuevas hasta que tengan licencia en Zoom.</span>
        ) : null}
        <ListaDeCuentas titulo="Cuentas nuevas" cuentas={vistaPrevia.crear} />
        <ListaDeCuentas titulo="Se reactivan" cuentas={vistaPrevia.reactivar} />
        <ListaDeCuentas titulo="Se desactivan" cuentas={vistaPrevia.desactivar} />
        <ListaDeCuentas
          titulo="Quedan fuera del grupo"
          cuentas={vistaPrevia.marcarFuera.map(({ email, reunionesFuturas: n }) => `${email} (${reunionesFuturas(n)})`)}
        />
        <ListaDeCuentas titulo="Pasan a sin licencia" cuentas={vistaPrevia.pierdenLicencia} />
        <div className="workspace-actions">
          <button className="secondary-action" type="button" onClick={onCancelar} disabled={ocupado}>
            <X size={16} />Cancelar
          </button>
          <button className="primary-action" type="button" onClick={onConfirmar} disabled={ocupado}>
            <RefreshCw size={16} />{ocupado ? "Sincronizando…" : "Confirmar y sincronizar"}
          </button>
        </div>
      </div>
    </div>
  );
}
