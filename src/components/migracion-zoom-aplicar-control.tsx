"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type {
  FilaVistaPreviaMigracion,
  VistaPreviaMigracionZoom
} from "@/src/modules/reuniones/migracion-zoom.service";
import { ExcepcionMeetControl } from "./excepcion-meet-control";
import styles from "./migracion-zoom-aplicar-control.module.css";

type Avisos = Readonly<{
  estado: "COMPLETO" | "PARCIAL" | "NO_APLICA" | "NO_CONFIGURADO";
  motivo?: string;
  enviados: number;
  yaEnviados: number;
  enCurso: number;
  errores: number;
  detalle: readonly Readonly<{ email: string; estado: string; error?: string }>[];
}>;
type Resultado = Readonly<{
  instanciaId: string;
  resultado: string;
  etapa: string;
  mensaje?: string;
  avisos?: Avisos;
}>;
type Filtro = "MIGRABLE" | "EXCEPCION" | "ATENCION" | "YA_ZOOM" | "TODOS";
type Modo = "PILOTO" | "LOTE";

const FECHA = new Intl.DateTimeFormat("es-UY", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Montevideo"
});

const ETIQUETAS: Record<FilaVistaPreviaMigracion["estado"], string> = {
  MIGRABLE: "Lista para convertir",
  EXCEPCION: "Se conserva en Meet",
  SERIE: "Serie con varios encuentros",
  YA_ZOOM: "En Zoom",
  SIN_SALA: "Sin sala Zoom disponible",
  CERCANO: "Comienza dentro de 24 horas",
  NO_FUTURO: "No es futura",
  REVISAR: "Requiere revisión"
};

function resumenAvisos(avisos: Avisos): string {
  if (avisos.estado === "NO_CONFIGURADO" || avisos.estado === "NO_APLICA") {
    return `Avisos por correo no enviados: ${avisos.motivo ?? avisos.estado}`;
  }
  const partes = [`${avisos.enviados} enviados`];
  if (avisos.yaEnviados) {
    partes.push(`${avisos.yaEnviados} enviados anteriormente`);
  }
  if (avisos.enCurso) {
    partes.push(`${avisos.enCurso} pendientes de revisión manual`);
  }
  if (avisos.errores) {
    partes.push(`${avisos.errores} con error`);
  }
  return `Avisos por correo: ${partes.join(", ")}${avisos.estado === "PARCIAL" && avisos.motivo ? ` — ${avisos.motivo}` : ""}`;
}

function coincideFiltro(fila: FilaVistaPreviaMigracion, filtro: Filtro): boolean {
  if (filtro === "TODOS") {
    return true;
  }
  if (filtro === "ATENCION") {
    return ["SIN_SALA", "CERCANO", "REVISAR", "NO_FUTURO", "SERIE"].includes(fila.estado);
  }
  return fila.estado === filtro;
}

export function MigracionZoomAplicarControl({
  vistaPrevia
}: Readonly<{ vistaPrevia: VistaPreviaMigracionZoom }>) {
  const router = useRouter();
  const [filtro, setFiltro] = useState<Filtro>("MIGRABLE");
  const [busqueda, setBusqueda] = useState("");
  const [seleccion, setSeleccion] = useState<string[]>([]);
  const [confirmar, setConfirmar] = useState<Modo | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [resultados, setResultados] = useState<readonly Resultado[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const migrables = vistaPrevia.filas.filter((fila) => fila.estado === "MIGRABLE");
  const idsMigrables = new Set(migrables.map((fila) => fila.id));
  const seleccionActiva = seleccion.filter((id) => idsMigrables.has(id));
  const seleccionadas = migrables.filter((fila) => seleccionActiva.includes(fila.id));
  const atencion =
    vistaPrevia.conteos.SIN_SALA +
    vistaPrevia.conteos.CERCANO +
    vistaPrevia.conteos.REVISAR +
    vistaPrevia.conteos.NO_FUTURO +
    vistaPrevia.conteos.SERIE;
  const consulta = busqueda.trim().toLocaleLowerCase("es-UY");
  const visibles = vistaPrevia.filas.filter(
    (fila) =>
      coincideFiltro(fila, filtro) &&
      (!consulta ||
        `${fila.titulo} ${fila.programa} ${FECHA.format(new Date(fila.inicio))}`
          .toLocaleLowerCase("es-UY")
          .includes(consulta))
  );
  const tabs: readonly Readonly<{ id: Filtro; label: string; count: number }>[] = [
    { id: "MIGRABLE", label: "Para convertir", count: vistaPrevia.conteos.MIGRABLE },
    { id: "EXCEPCION", label: "Conservar en Meet", count: vistaPrevia.conteos.EXCEPCION },
    { id: "ATENCION", label: "Atención", count: atencion },
    { id: "YA_ZOOM", label: "Ya convertidas", count: vistaPrevia.conteos.YA_ZOOM },
    { id: "TODOS", label: "Todas", count: vistaPrevia.filas.length }
  ];

  async function aplicar(modo: Modo, ids: readonly string[]) {
    setConfirmar(null);
    setProcesando(true);
    setError(null);
    setResultados(null);
    try {
      const response = await fetch("/api/v1/reuniones/migracion-zoom/aplicar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modo, instanciaIds: ids })
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "No se pudo aplicar la migración.");
      }
      setResultados(payload.resultados);
      setSeleccion([]);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo aplicar la migración.");
    } finally {
      setProcesando(false);
    }
  }

  function cambiarSeleccion(id: string, checked: boolean) {
    setSeleccion((actual) => (checked ? [...actual, id] : actual.filter((item) => item !== id)));
  }

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroText}>
          <span className={styles.eyebrow}>ADMINISTRACIÓN DE REUNIONES</span>
          <h1>Migración a Zoom</h1>
          <p>Revisá cada encuentro, marcá los que deben seguir en Meet y convertí los demás por lotes.</p>
        </div>
        <div className={styles.heroMeta}>
          <span className={styles.liveDot} aria-hidden="true" />
          Vista previa del {FECHA.format(new Date(vistaPrevia.generadaAt))}
          <small>No se cambió ningún enlace al generar esta vista.</small>
        </div>
      </header>

      <div className={styles.metrics} aria-label="Resumen de la migración">
        <div className={styles.metric}>
          <span>Para convertir</span>
          <strong>{vistaPrevia.conteos.MIGRABLE}</strong>
          <small>Con sala Zoom propuesta</small>
        </div>
        <div className={styles.metric}>
          <span>Excepciones Meet</span>
          <strong>{vistaPrevia.conteos.EXCEPCION}</strong>
          <small>Conservan el enlace actual</small>
        </div>
        <div className={styles.metric}>
          <span>Ya en Zoom</span>
          <strong>{vistaPrevia.conteos.YA_ZOOM}</strong>
          <small>Encuentros convertidos</small>
        </div>
        <div className={`${styles.metric} ${atencion ? styles.metricWarning : ""}`}>
          <span>Requieren atención</span>
          <strong>{atencion}</strong>
          <small>Fuera de la conversión automática</small>
        </div>
      </div>

      <section className={styles.workArea} aria-labelledby="encuentros-title">
        <div className={styles.sectionHeader}>
          <div>
            <span className={styles.sectionEyebrow}>VISTA PREVIA</span>
            <h2 id="encuentros-title">Encuentros</h2>
            <p>
              Los que empiezan en menos de {vistaPrevia.margenSeguridadHoras} horas quedan fuera de la
              conversión.
            </p>
          </div>
          <label className={styles.search}>
            <span className="sr-only">Buscar encuentro o programa</span>
            <input
              type="search"
              placeholder="Buscar encuentro o programa"
              value={busqueda}
              onChange={(event) => setBusqueda(event.target.value)}
            />
          </label>
        </div>

        <div className={styles.tabs} role="group" aria-label="Filtrar encuentros">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={filtro === tab.id ? styles.tabActive : styles.tab}
              aria-pressed={filtro === tab.id}
              onClick={() => setFiltro(tab.id)}
            >
              {tab.label}
              <span>{tab.count}</span>
            </button>
          ))}
        </div>

        {visibles.length === 0 ? (
          <div className={styles.empty}>
            <strong>No hay encuentros en esta vista</strong>
            <p>{consulta ? "Probá otra búsqueda." : "Elegí otra categoría para seguir revisando."}</p>
          </div>
        ) : (
          <div className={styles.meetings}>
            {visibles.map((fila) => {
              const migrable = fila.estado === "MIGRABLE";
              const editable = ["MIGRABLE", "EXCEPCION", "CERCANO", "SIN_SALA", "SERIE"].includes(
                fila.estado
              );
              const selected = seleccionActiva.includes(fila.id);
              return (
                <article
                  key={fila.id}
                  className={`${styles.meeting} ${selected ? styles.meetingSelected : ""}`}
                >
                  <div className={styles.meetingMain}>
                    {migrable ? (
                      <label className={styles.selectBox}>
                        <input
                          type="checkbox"
                          checked={selected}
                          disabled={procesando || (!selected && seleccionActiva.length >= 10)}
                          onChange={(event) => cambiarSeleccion(fila.id, event.target.checked)}
                          aria-label={`Seleccionar ${fila.titulo} del ${FECHA.format(new Date(fila.inicio))}`}
                        />
                      </label>
                    ) : (
                      <span className={styles.selectSpacer} aria-hidden="true" />
                    )}
                    <div className={styles.meetingContent}>
                      <div className={styles.meetingTop}>
                        <span className={styles.meetingDate}>{FECHA.format(new Date(fila.inicio))}</span>
                        <span
                          className={`${styles.badge} ${fila.estado === "EXCEPCION" ? styles.badgeMeet : fila.estado === "MIGRABLE" ? styles.badgeReady : fila.estado === "YA_ZOOM" ? styles.badgeZoom : styles.badgeWarning}`}
                        >
                          {ETIQUETAS[fila.estado]}
                        </span>
                      </div>
                      <h3>{fila.titulo}</h3>
                      <p className={styles.program}>{fila.programa}</p>
                      <div className={styles.meetingFacts}>
                        <span>
                          <b>{fila.estado === "YA_ZOOM" ? "Enlace" : "Cambio"}</b>
                          {fila.cambioEnlace
                            ? "Meet → Zoom"
                            : fila.estado === "EXCEPCION"
                              ? "Sigue en Meet"
                              : fila.estado === "YA_ZOOM"
                                ? "Zoom activo"
                                : "Sin cambio"}
                        </span>
                        {fila.hostZoom && (
                          <span>
                            <b>Sala propuesta</b>
                            {fila.hostZoom.nombre}
                          </span>
                        )}
                        {migrable && (
                          <span>
                            <b>Avisos</b>
                            {fila.destinatarios.length} destinatarios
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <details className={styles.details}>
                    <summary>Ver enlace y destinatarios</summary>
                    <div className={styles.detailGrid}>
                      <div>
                        <strong>Enlace vigente</strong>
                        {fila.enlaceActual ? (
                          <a href={fila.enlaceActual} target="_blank" rel="noopener noreferrer">
                            {fila.enlaceActual}
                          </a>
                        ) : (
                          <span>Sin enlace</span>
                        )}
                      </div>
                      <div>
                        <strong>Sala Zoom</strong>
                        <span>
                          {fila.hostZoom
                            ? `${fila.hostZoom.nombre} · ${fila.hostZoom.email ?? "sin correo"}`
                            : "Sin sala propuesta"}
                        </span>
                      </div>
                      <div>
                        <strong>Destinatarios previstos</strong>
                        <span>
                          {fila.destinatarios.length
                            ? fila.destinatarios.join(", ")
                            : "Sin avisos previstos en este estado"}
                        </span>
                      </div>
                    </div>
                  </details>
                  {editable && (
                    <ExcepcionMeetControl
                      instanciaId={fila.id}
                      conservar={fila.estado === "EXCEPCION"}
                      motivoActual={fila.motivoExcepcion}
                    />
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {vistaPrevia.conteos.YA_ZOOM > 0 && (
        <details className={styles.retrySection}>
          <summary>Revisar avisos de encuentros ya convertidos</summary>
          {vistaPrevia.filas
            .filter((fila) => fila.estado === "YA_ZOOM" && fila.tieneMeetHistorico)
            .map((fila) => (
              <div key={fila.id} className={styles.retryRow}>
                <span>
                  {fila.titulo} · {FECHA.format(new Date(fila.inicio))}
                </span>
                <button type="button" disabled={procesando} onClick={() => aplicar("PILOTO", [fila.id])}>
                  Revisar avisos
                </button>
              </div>
            ))}
        </details>
      )}

      {resultados && (
        <section className={styles.results} role="status" aria-label="Resultado de la migración">
          <div className={styles.resultsHeading}>
            <h2>Resultado de la conversión</h2>
            <button type="button" onClick={() => setResultados(null)}>
              Cerrar
            </button>
          </div>
          {resultados.map((resultado) => {
            const fila = vistaPrevia.filas.find((item) => item.id === resultado.instanciaId);
            return (
              <div key={resultado.instanciaId} className={styles.resultRow}>
                <strong>{fila?.titulo ?? resultado.instanciaId}</strong>
                <span>
                  {resultado.resultado} · {resultado.etapa}
                  {resultado.mensaje ? ` · ${resultado.mensaje}` : ""}
                </span>
                {resultado.avisos && <p>{resumenAvisos(resultado.avisos)}</p>}
                {resultado.avisos?.detalle
                  .filter((detalle) => detalle.estado === "ERROR")
                  .map((detalle) => (
                    <p key={detalle.email} className={styles.error}>
                      {detalle.email}: {detalle.error ?? "Error al enviar"}
                    </p>
                  ))}
                {resultado.avisos && (resultado.avisos.errores > 0 || resultado.avisos.motivo) && (
                  <button
                    type="button"
                    disabled={procesando}
                    onClick={() => aplicar("PILOTO", [resultado.instanciaId])}
                  >
                    Reintentar avisos pendientes
                  </button>
                )}
              </div>
            );
          })}
        </section>
      )}

      {error && (
        <p className={styles.errorBanner} role="alert">
          {error}
        </p>
      )}

      <div className={styles.actionBar} aria-label="Aplicar migración a Zoom">
        <div>
          <strong>{seleccionActiva.length} de 10 seleccionados</strong>
          <span>La conversión reemplaza el enlace vigente y envía avisos.</span>
        </div>
        <div className={styles.actionButtons}>
          {seleccionActiva.length > 0 && (
            <button
              type="button"
              className={styles.clearButton}
              disabled={procesando}
              onClick={() => setSeleccion([])}
            >
              Limpiar
            </button>
          )}
          <button
            type="button"
            className={styles.secondaryButton}
            disabled={procesando || seleccionActiva.length !== 1}
            onClick={() => setConfirmar("PILOTO")}
          >
            Convertir piloto
          </button>
          <button
            type="button"
            className={styles.primaryButton}
            disabled={procesando || seleccionActiva.length < 1 || seleccionActiva.length > 10}
            onClick={() => setConfirmar("LOTE")}
          >
            Convertir selección
          </button>
        </div>
      </div>

      {confirmar && (
        <div
          className={styles.modalBackdrop}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setConfirmar(null);
            }
          }}
        >
          <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="confirmar-migracion">
            <span className={styles.sectionEyebrow}>CONFIRMAR CAMBIO DE ENLACES</span>
            <h2 id="confirmar-migracion">
              {confirmar === "PILOTO"
                ? "Convertir encuentro piloto"
                : `Convertir ${seleccionadas.length} encuentros`}
            </h2>
            <p>
              Se crearán reuniones Zoom, se actualizarán los eventos de Calendar y se avisará a los
              destinatarios. Cada encuentro se valida de nuevo antes de cambiarlo.
            </p>
            <ul className={styles.confirmList}>
              {seleccionadas.map((fila) => (
                <li key={fila.id}>
                  <strong>{fila.titulo}</strong>
                  <span>
                    {FECHA.format(new Date(fila.inicio))} · {fila.hostZoom?.nombre ?? "Sin sala"} ·{" "}
                    {fila.destinatarios.length} avisos previstos
                  </span>
                </li>
              ))}
            </ul>
            <div className={styles.modalActions}>
              <button type="button" onClick={() => setConfirmar(null)}>
                Volver a revisar
              </button>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() => aplicar(confirmar, seleccionActiva)}
              >
                {confirmar === "PILOTO" ? "Confirmar piloto" : "Confirmar conversión"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
