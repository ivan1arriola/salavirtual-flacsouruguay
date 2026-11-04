"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  FilaVistaPreviaSerie,
  VistaPreviaMigracionZoomSerie,
} from "@/src/modules/reuniones/migracion-zoom-serie.service";
import type { DiagnosticoSerieZoom } from "@/src/modules/reuniones/diagnostico-serie-zoom.domain";
import { describirResultadoSerie } from "@/src/modules/reuniones/mensajes-serie-zoom.domain";
import {
  presentarDiagnosticoSerie,
  textoConfirmacionAccion,
  type AccionEscrituraSerie,
} from "@/src/modules/reuniones/presentacion-serie-zoom.domain";
import { ExcepcionMeetControl } from "./excepcion-meet-control";
import styles from "./migracion-zoom-aplicar-control.module.css";

type Avisos = Readonly<{
  estado: "COMPLETO" | "PARCIAL" | "NO_APLICA" | "NO_CONFIGURADO";
  motivo?: string;
  enviados: number;
  yaEnviados: number;
  enCurso: number;
  errores: number;
}>;
type Resultado = Readonly<{
  serieClave: string;
  resultado: string;
  etapa: string;
  mensaje?: string;
  reintentable: boolean;
  encuentros?: number;
  avisos?: Avisos;
}>;
type AccionPendiente = Readonly<{ tipo: AccionEscrituraSerie; serieClave: string; titulo: string; encuentros: number }>;
type Filtro = "MIGRABLE" | "UNIFICAR" | "EXCEPCION" | "ATENCION" | "YA_ZOOM" | "TODOS";
type Modo = "PILOTO" | "LOTE";

const MAXIMO_SERIES = 5;
const FECHA = new Intl.DateTimeFormat("es-UY", {
  dateStyle: "medium", timeStyle: "short", timeZone: "America/Montevideo",
});

const ETIQUETAS: Record<FilaVistaPreviaSerie["estado"], string> = {
  MIGRABLE: "Lista para convertir",
  EXCEPCION: "Se conserva en Meet",
  SERIE: "Serie con varios encuentros",
  YA_ZOOM: "En Zoom",
  SIN_SALA: "Sin sala Zoom libre en todos los horarios",
  CERCANO: "Un encuentro comienza dentro de 24 horas",
  NO_FUTURO: "Sin encuentros futuros",
  REVISAR: "Requiere revisión",
};
const ATENCION = ["SIN_SALA", "CERCANO", "REVISAR", "NO_FUTURO", "SERIE"];

function resumenAvisos(avisos: Avisos): string {
  if (avisos.estado === "NO_CONFIGURADO" || avisos.estado === "NO_APLICA") return `Avisos por correo no enviados: ${avisos.motivo ?? avisos.estado}`;
  const partes = [`${avisos.enviados} enviados`];
  if (avisos.yaEnviados) partes.push(`${avisos.yaEnviados} enviados anteriormente`);
  if (avisos.enCurso) partes.push(`${avisos.enCurso} pendientes de revisión manual`);
  if (avisos.errores) partes.push(`${avisos.errores} con error`);
  return `Avisos por correo: ${partes.join(", ")}${avisos.estado === "PARCIAL" && avisos.motivo ? ` — ${avisos.motivo}` : ""}`;
}

const RUTA_UNIFICAR = "/api/v1/reuniones/migracion-zoom/series-enlaces";
const TONOS = { ok: "badgeZoom", pendiente: "badgeReady", atencion: "badgeWarning", neutro: "badgeMeet" } as const;

function coincideFiltro(fila: FilaVistaPreviaSerie, filtro: Filtro, diagnostico?: DiagnosticoSerieZoom): boolean {
  if (filtro === "TODOS") return true;
  if (filtro === "UNIFICAR") return diagnostico?.acciones[0] === "UNIFICAR_ENLACE";
  if (filtro === "ATENCION") return ATENCION.includes(fila.estado);
  return fila.estado === filtro;
}

export function MigracionZoomSerieControl({ vistaPrevia, diagnosticos = {} }: Readonly<{
  vistaPrevia: VistaPreviaMigracionZoomSerie;
  diagnosticos?: Readonly<Record<string, DiagnosticoSerieZoom>>;
}>) {
  const router = useRouter();
  const [filtro, setFiltro] = useState<Filtro>("MIGRABLE");
  const [busqueda, setBusqueda] = useState("");
  const [seleccion, setSeleccion] = useState<string[]>([]);
  const [confirmar, setConfirmar] = useState<Modo | null>(null);
  const [accionPendiente, setAccionPendiente] = useState<AccionPendiente | null>(null);
  const [origenResultados, setOrigenResultados] = useState<AccionEscrituraSerie>("MIGRAR");
  const [procesando, setProcesando] = useState(false);
  const [resultados, setResultados] = useState<readonly Resultado[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const disparadorRef = useRef<HTMLElement | null>(null);

  const migrables = vistaPrevia.filas.filter((fila) => fila.estado === "MIGRABLE");
  const clavesMigrables = new Set(migrables.map((fila) => fila.serieClave));
  const seleccionActiva = seleccion.filter((clave) => clavesMigrables.has(clave));
  const seleccionadas = migrables.filter((fila) => seleccionActiva.includes(fila.serieClave));
  const atencion = vistaPrevia.conteos.SIN_SALA + vistaPrevia.conteos.CERCANO
    + vistaPrevia.conteos.REVISAR + vistaPrevia.conteos.NO_FUTURO + vistaPrevia.conteos.SERIE;
  const paraUnificar = vistaPrevia.filas.filter((fila) => diagnosticos[fila.serieClave]?.acciones[0] === "UNIFICAR_ENLACE").length;
  const consulta = busqueda.trim().toLocaleLowerCase("es-UY");
  const visibles = vistaPrevia.filas.filter((fila) =>
    coincideFiltro(fila, filtro, diagnosticos[fila.serieClave])
    && (!consulta || `${fila.titulo} ${fila.programa}`.toLocaleLowerCase("es-UY").includes(consulta)));
  const tabs: readonly Readonly<{ id: Filtro; label: string; count: number }>[] = [
    { id: "MIGRABLE", label: "Para convertir", count: vistaPrevia.conteos.MIGRABLE },
    { id: "UNIFICAR", label: "Para unificar enlace", count: paraUnificar },
    { id: "EXCEPCION", label: "Conservar en Meet", count: vistaPrevia.conteos.EXCEPCION },
    { id: "ATENCION", label: "Atención", count: atencion },
    { id: "YA_ZOOM", label: "Ya convertidas", count: vistaPrevia.conteos.YA_ZOOM },
    { id: "TODOS", label: "Todas", count: vistaPrevia.filas.length },
  ];

  // Diálogo: foco al abrir, Escape cierra y Tab no sale de él; al cerrar el foco vuelve al botón que lo abrió.
  useEffect(() => {
    if (!confirmar && !accionPendiente) return;
    const dialogo = modalRef.current;
    const enfocables = () => [...(dialogo?.querySelectorAll<HTMLElement>("button:not([disabled]), a[href]") ?? [])];
    enfocables()[0]?.focus();
    function alPulsar(event: KeyboardEvent) {
      if (event.key === "Escape") { setConfirmar(null); setAccionPendiente(null); return; }
      if (event.key !== "Tab") return;
      const lista = enfocables();
      if (lista.length === 0) return;
      const primero = lista[0];
      const ultimo = lista[lista.length - 1];
      if (event.shiftKey && document.activeElement === primero) { event.preventDefault(); ultimo.focus(); }
      else if (!event.shiftKey && document.activeElement === ultimo) { event.preventDefault(); primero.focus(); }
    }
    document.addEventListener("keydown", alPulsar);
    const disparador = disparadorRef.current;
    return () => {
      document.removeEventListener("keydown", alPulsar);
      disparador?.focus();
    };
  }, [confirmar, accionPendiente]);

  async function ejecutarAccion(accion: AccionPendiente) {
    setAccionPendiente(null);
    setProcesando(true);
    setError(null);
    setResultados(null);
    setOrigenResultados(accion.tipo);
    try {
      const unificar = accion.tipo === "UNIFICAR_ENLACE";
      const response = await fetch(unificar ? RUTA_UNIFICAR : "/api/v1/reuniones/migracion-zoom/series/aplicar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modo: "PILOTO", serieClaves: [accion.serieClave] }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "No se pudo completar la acción.");
      setResultados(payload.resultados);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo completar la acción.");
    } finally {
      setProcesando(false);
    }
  }

  function abrirAccion(accion: AccionPendiente, evento: React.MouseEvent<HTMLElement>) {
    disparadorRef.current = evento.currentTarget;
    setAccionPendiente(accion);
  }

  async function aplicar(modo: Modo, claves: readonly string[]) {
    setConfirmar(null);
    setOrigenResultados("MIGRAR");
    setProcesando(true);
    setError(null);
    setResultados(null);
    try {
      const response = await fetch("/api/v1/reuniones/migracion-zoom/series/aplicar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modo, serieClaves: claves }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "No se pudo aplicar la migración.");
      setResultados(payload.resultados);
      setSeleccion([]);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo aplicar la migración.");
    } finally {
      setProcesando(false);
    }
  }

  function abrirConfirmacion(modo: Modo, evento: React.MouseEvent<HTMLElement>) {
    disparadorRef.current = evento.currentTarget;
    setConfirmar(modo);
  }

  function cambiarSeleccion(clave: string, checked: boolean) {
    setSeleccion((actual) => checked ? [...actual, clave] : actual.filter((item) => item !== clave));
  }

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroText}>
          <span className={styles.eyebrow}>ADMINISTRACIÓN DE REUNIONES</span>
          <h1>Migración a Zoom por serie</h1>
          <p>Cada serie pasa completa a una sola reunión de Zoom: todos sus encuentros comparten el mismo enlace y la misma sala.</p>
        </div>
        <div className={styles.heroMeta}>
          <span className={styles.liveDot} aria-hidden="true" />
          Vista previa del {FECHA.format(new Date(vistaPrevia.generadaAt))}
          <small>No se cambió ningún enlace al generar esta vista.</small>
        </div>
      </header>

      <div className={styles.metrics} aria-label="Resumen de la migración">
        <div className={styles.metric}><span>Series para convertir</span><strong>{vistaPrevia.conteos.MIGRABLE}</strong><small>Con una sala libre en todos los horarios</small></div>
        <div className={styles.metric}><span>Excepciones Meet</span><strong>{vistaPrevia.conteos.EXCEPCION}</strong><small>Conservan el enlace actual</small></div>
        <div className={styles.metric}><span>Ya en Zoom</span><strong>{vistaPrevia.conteos.YA_ZOOM}</strong><small>Series convertidas</small></div>
        <div className={`${styles.metric} ${atencion ? styles.metricWarning : ""}`}><span>Requieren atención</span><strong>{atencion}</strong><small>Fuera de la conversión automática</small></div>
      </div>

      <section className={styles.workArea} aria-labelledby="series-title">
        <div className={styles.sectionHeader}>
          <div>
            <span className={styles.sectionEyebrow}>VISTA PREVIA</span>
            <h2 id="series-title">Series</h2>
            <p>Si algún encuentro de la serie empieza en menos de {vistaPrevia.margenSeguridadHoras} horas, toda la serie queda fuera de la conversión.</p>
          </div>
          <label className={styles.search}>
            <span className="sr-only">Buscar serie o programa</span>
            <input type="search" placeholder="Buscar serie o programa" value={busqueda} onChange={(event) => setBusqueda(event.target.value)} />
          </label>
        </div>

        <div className={styles.tabs} role="group" aria-label="Filtrar series">
          {tabs.map((tab) => (
            <button key={tab.id} type="button" className={filtro === tab.id ? styles.tabActive : styles.tab} aria-pressed={filtro === tab.id} onClick={() => setFiltro(tab.id)}>
              {tab.label}<span>{tab.count}</span>
            </button>
          ))}
        </div>

        {visibles.length === 0 ? (
          <div className={styles.empty}>
            <strong>No hay series en esta vista</strong>
            <p>{consulta ? "Probá otra búsqueda." : "Elegí otra categoría para seguir revisando."}</p>
          </div>
        ) : (
          <div className={styles.meetings}>
            {visibles.map((fila) => {
              const migrable = fila.estado === "MIGRABLE";
              const seleccionada = seleccionActiva.includes(fila.serieClave);
              const futuros = fila.encuentros.length;
              const diagnostico = diagnosticos[fila.serieClave];
              const presentacion = diagnostico ? presentarDiagnosticoSerie(diagnostico) : null;
              // La conversión de series «para convertir» sigue por selección; el botón cubre unificar y retomar.
              const accion = presentacion?.accionPrincipal && !(presentacion.accionPrincipal.tipo === "MIGRAR" && migrable)
                ? presentacion.accionPrincipal
                : null;
              return (
                <article key={fila.serieClave} className={`${styles.meeting} ${seleccionada ? styles.meetingSelected : ""}`}>
                  <div className={styles.meetingMain}>
                    {migrable ? (
                      <label className={styles.selectBox}>
                        <input type="checkbox" checked={seleccionada} disabled={procesando || (!seleccionada && seleccionActiva.length >= MAXIMO_SERIES)}
                          onChange={(event) => cambiarSeleccion(fila.serieClave, event.target.checked)} aria-label={`Seleccionar la serie ${fila.titulo}`} />
                      </label>
                    ) : <span className={styles.selectSpacer} aria-hidden="true" />}
                    <div className={styles.meetingContent}>
                      <div className={styles.meetingTop}>
                        <span className={styles.meetingDate}>{futuros} {futuros === 1 ? "encuentro" : "encuentros"}</span>
                        <span className={`${styles.badge} ${fila.estado === "EXCEPCION" ? styles.badgeMeet : migrable ? styles.badgeReady : fila.estado === "YA_ZOOM" ? styles.badgeZoom : styles.badgeWarning}`}>
                          {ETIQUETAS[fila.estado]}
                        </span>
                      </div>
                      <h3>{fila.titulo}</h3>
                      <p className={styles.program}>{fila.programa}</p>
                      {presentacion && (
                        <p className={styles.program} data-estado-serie={diagnostico?.clasificacion}>
                          <span className={`${styles.badge} ${styles[TONOS[presentacion.tono]]}`}>{presentacion.etiqueta}</span>{" "}
                          {presentacion.resumen}
                        </p>
                      )}
                      {accion && (
                        <button
                          type="button"
                          className={styles.secondaryButton}
                          disabled={procesando}
                          aria-label={`${accion.texto}: ${fila.titulo}`}
                          onClick={(event) => abrirAccion({ tipo: accion.tipo, serieClave: fila.serieClave, titulo: fila.titulo, encuentros: diagnostico?.conteos.enZoom && accion.tipo === "UNIFICAR_ENLACE" ? diagnostico.conteos.enZoom : futuros }, event)}
                        >
                          {accion.texto}
                        </button>
                      )}
                      <div className={styles.meetingFacts}>
                        <span><b>Cambio</b>{fila.cambioEnlace ? "Meet → Zoom" : fila.estado === "EXCEPCION" ? "Sigue en Meet" : fila.estado === "YA_ZOOM" ? "Zoom activo" : "Sin cambio"}</span>
                        {fila.hostZoom && <span><b>Sala propuesta</b>{fila.hostZoom.nombre}</span>}
                        {migrable && <span><b>Avisos</b>{fila.destinatarios.length} destinatarios</span>}
                      </div>
                    </div>
                  </div>
                  <details className={styles.details}>
                    <summary>Ver encuentros{migrable ? " y destinatarios" : ""}</summary>
                    <div className={styles.detailGrid}>
                      {fila.encuentros.map((encuentro) => (
                        <div key={encuentro.id}>
                          <strong>{FECHA.format(new Date(encuentro.inicio))} · {encuentro.proveedor === "ZOOM" ? "Zoom" : "Meet"}{encuentro.migra ? " → Zoom" : ""}</strong>
                          {encuentro.enlaceActual ? <a href={encuentro.enlaceActual} target="_blank" rel="noopener noreferrer">{encuentro.enlaceActual}</a> : <span>Sin enlace</span>}
                          {encuentro.proveedor === "GOOGLE_MEET" && fila.estado !== "YA_ZOOM" && (
                            <ExcepcionMeetControl instanciaId={encuentro.id} conservar={encuentro.conservarEnMeet} motivoActual={encuentro.motivoExcepcion} />
                          )}
                        </div>
                      ))}
                      {migrable && <div><strong>Destinatarios previstos</strong><span>{fila.destinatarios.length ? fila.destinatarios.join(", ") : "Sin avisos previstos"}</span></div>}
                      <div><strong>Sala Zoom</strong><span>{fila.hostZoom ? `${fila.hostZoom.nombre} · ${fila.hostZoom.email ?? "sin correo"}` : "Sin sala propuesta"}</span></div>
                    </div>
                  </details>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {resultados && (
        <section className={styles.results} role="status" aria-label="Resultado de la migración">
          <div className={styles.resultsHeading}><h2>Resultado de la conversión</h2><button type="button" onClick={() => setResultados(null)}>Cerrar</button></div>
          {resultados.map((resultado) => {
            const fila = vistaPrevia.filas.find((item) => item.serieClave === resultado.serieClave);
            const mensaje = describirResultadoSerie(resultado);
            return (
              <div key={resultado.serieClave} className={styles.resultRow}>
                <strong>{fila?.titulo ?? "Serie"}</strong>
                <span>{mensaje.titulo}</span>
                <p>{mensaje.detalle}</p>
                <p>{mensaje.accionSugerida}</p>
                {resultado.avisos && <p>{resumenAvisos(resultado.avisos)}</p>}
                {mensaje.reintentable && (
                  <button
                    type="button"
                    disabled={procesando}
                    onClick={() => ejecutarAccion({ tipo: origenResultados, serieClave: resultado.serieClave, titulo: fila?.titulo ?? "la serie", encuentros: resultado.encuentros ?? 0 })}
                  >
                    Reintentar
                  </button>
                )}
                {mensaje.detalleTecnico && (
                  <details><summary>Detalle técnico</summary><p>{mensaje.detalleTecnico}</p></details>
                )}
              </div>
            );
          })}
        </section>
      )}

      {error && <p className={styles.errorBanner} role="alert">{error}</p>}

      <div className={styles.actionBar} aria-label="Aplicar migración a Zoom">
        <div><strong>{seleccionActiva.length} de {MAXIMO_SERIES} series seleccionadas</strong><span>La conversión reemplaza el enlace de todos los encuentros de la serie y envía avisos.</span></div>
        <div className={styles.actionButtons}>
          {seleccionActiva.length > 0 && <button type="button" className={styles.clearButton} disabled={procesando} onClick={() => setSeleccion([])}>Limpiar</button>}
          <button type="button" className={styles.secondaryButton} disabled={procesando || seleccionActiva.length !== 1} onClick={(event) => abrirConfirmacion("PILOTO", event)}>Convertir piloto</button>
          <button type="button" className={styles.primaryButton} disabled={procesando || seleccionActiva.length < 1 || seleccionActiva.length > MAXIMO_SERIES} onClick={(event) => abrirConfirmacion("LOTE", event)}>Convertir selección</button>
        </div>
      </div>

      {accionPendiente && (
        <div className={styles.modalBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setAccionPendiente(null); }}>
          <div className={styles.modal} ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="confirmar-accion-serie">
            <span className={styles.sectionEyebrow}>CONFIRMAR ACCIÓN SOBRE LA SERIE</span>
            <h2 id="confirmar-accion-serie">{textoConfirmacionAccion(accionPendiente.tipo, accionPendiente).titulo}</h2>
            <p>{textoConfirmacionAccion(accionPendiente.tipo, accionPendiente).detalle}</p>
            <div className={styles.modalActions}>
              <button type="button" onClick={() => setAccionPendiente(null)}>Volver a revisar</button>
              <button type="button" className={styles.primaryButton} onClick={() => ejecutarAccion(accionPendiente)}>Confirmar</button>
            </div>
          </div>
        </div>
      )}

      {confirmar && (
        <div className={styles.modalBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setConfirmar(null); }}>
          <div className={styles.modal} ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="confirmar-migracion">
            <span className={styles.sectionEyebrow}>CONFIRMAR CAMBIO DE ENLACES</span>
            <h2 id="confirmar-migracion">{confirmar === "PILOTO" ? "Convertir serie piloto" : `Convertir ${seleccionadas.length} series`}</h2>
            <p>Se creará una reunión Zoom por serie, se actualizarán las citas de Calendar de todos sus encuentros y se avisará a los destinatarios. Cada serie se valida de nuevo antes de cambiarla.</p>
            <ul className={styles.confirmList}>
              {seleccionadas.map((fila) => (
                <li key={fila.serieClave}><strong>{fila.titulo}</strong><span>{fila.encuentros.filter((e) => e.migra).length} encuentros · {fila.hostZoom?.nombre ?? "Sin sala"} · {fila.destinatarios.length} avisos previstos</span></li>
              ))}
            </ul>
            <div className={styles.modalActions}>
              <button type="button" onClick={() => setConfirmar(null)}>Volver a revisar</button>
              <button type="button" className={styles.primaryButton} onClick={() => aplicar(confirmar, seleccionActiva)}>{confirmar === "PILOTO" ? "Confirmar piloto" : "Confirmar conversión"}</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
