"use client";

import { useState } from "react";
import type { ResultadoInscriptosZoom } from "@/src/integrations/zoom/zoom-registrants.client";
import { formatDate, formatTime } from "@/src/lib/ui/format";
import styles from "./reunion-zoom-operativa.module.css";

const etiquetas = { approved: "Aprobada", pending: "Pendiente", denied: "Rechazada" };

export function ZoomRegistroDirectorio({ resultado }: Readonly<{ resultado: ResultadoInscriptosZoom }>) {
  const [buscar, setBuscar] = useState("");
  const [estado, setEstado] = useState("todos");
  const texto = buscar.trim().toLowerCase();
  const personas = resultado.personas.filter(
    (p) =>
      (estado === "todos" || p.estado === estado) && (p.nombre + " " + p.email).toLowerCase().includes(texto)
  );
  return (
    <section className={styles.card} aria-label="Inscripciones de Zoom">
      <h2 className={styles.sectionTitle}>Inscripciones de Zoom</h2>
      <p className={styles.note}>
        {resultado.ambito.tipo === "ENCUENTRO"
          ? "Encuentro específico"
          : "Serie o alcance sin confirmar; no atribuir a este encuentro."}
      </p>
      {resultado.estado === "NO_HABILITADA" ? <p>La inscripción no está habilitada en Zoom.</p> : null}
      {resultado.estado === "SIN_VERIFICAR" ? <p>No se pudo verificar la lista de Zoom.</p> : null}
      {resultado.estado === "PARCIAL" ? (
        <p>Lista parcial: no se pudieron completar todas las consultas.</p>
      ) : null}
      {resultado.estado === "DISPONIBLE" || resultado.estado === "PARCIAL" ? (
        <>
          <dl className={styles.kpis} aria-label="Resumen de inscripciones recuperadas">
            <div>
              <dt>Registros recuperados</dt>
              <dd>{resultado.personas.length}</dd>
            </div>
            {(["approved", "pending", "denied"] as const).map((tipo) => (
              <div key={tipo}>
                <dt>{etiquetas[tipo]}</dt>
                <dd>{resultado.personas.filter((p) => p.estado === tipo).length}</dd>
              </div>
            ))}
          </dl>
          <div className={styles.directoryFilters}>
            <label>
              Buscar por nombre o correo
              <input value={buscar} onChange={(e) => setBuscar(e.target.value)} />
            </label>
            <label>
              Estado de inscripción
              <select value={estado} onChange={(e) => setEstado(e.target.value)}>
                <option value="todos">Todos</option>
                <option value="approved">Aprobadas</option>
                <option value="pending">Pendientes</option>
                <option value="denied">Rechazadas</option>
              </select>
            </label>
          </div>
          <p aria-live="polite">{personas.length} resultados</p>
          {personas.length === 0 ? (
            <p className={styles.note}>No hay registros que coincidan con los filtros.</p>
          ) : null}
          <ul className={styles.registeredList}>
            {personas.map((p) => (
              <li className={styles.registeredRow} key={p.id + ":" + p.estado}>
                <div className={styles.registeredIdentity}>
                  <strong>{p.nombre || p.email}</strong>
                  <span>{p.email}</span>
                  {p.fecha && Number.isFinite(Date.parse(p.fecha)) ? (
                    <small>
                      Inscripción: {formatDate(new Date(p.fecha))} · {formatTime(new Date(p.fecha))}
                    </small>
                  ) : null}
                </div>
                <span className={styles.registeredStatus}>{etiquetas[p.estado]}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <p className={styles.note}>Una inscripción aprobada no confirma asistencia.</p>
    </section>
  );
}
