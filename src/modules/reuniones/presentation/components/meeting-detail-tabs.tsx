"use client";

import type { ReactNode } from "react";
import { Activity, CalendarDays, ChevronDown, FolderOpen, List, UsersRound } from "lucide-react";

type MeetingDetailSection = Readonly<{
  id: "general" | "encuentros" | "personas" | "archivos" | "actividad";
  label: string;
  content: ReactNode;
}>;

const ICONS = {
  general: List,
  encuentros: CalendarDays,
  personas: UsersRound,
  archivos: FolderOpen,
  actividad: Activity,
} as const;

/**
 * All sections mount once and remain visible on every viewport.
 * Desktop arranges them in two independent masonry-like columns; on phones
 * CSS stacks them in reading order without a scrollable tab bar.
 */
export function MeetingDetailTabs({ tabs }: Readonly<{ tabs: readonly MeetingDetailSection[] }>) {
  function renderSection(section: MeetingDetailSection | undefined, index: number) {
    if (!section) {
      return null;
    }
    const Icon = ICONS[section.id];
    const numberedLabel = String(index + 1).padStart(2, "0");
    return (
      <section
        aria-labelledby={`meeting-mosaic-heading-${section.id}`}
        className={`meeting-detail-section meeting-mosaic-panel meeting-mosaic-panel--${section.id}`}
        id={section.id}
        key={section.id}
        tabIndex={-1}
      >
        <div className="meeting-mosaic-panel-header">
          <span className="meeting-mosaic-panel-icon">
            <Icon size={18} aria-hidden="true" />
          </span>
          <div>
            <span className="meeting-mosaic-panel-counter">Sección {numberedLabel} / 05</span>
            {section.id === "encuentros" ? (
              <span className="meeting-mosaic-panel-kicker" id="meeting-mosaic-heading-encuentros">
                Cronograma
              </span>
            ) : section.id === "general" ? (
              <strong className="meeting-mosaic-panel-kicker" id="meeting-mosaic-heading-general">
                {section.label}
              </strong>
            ) : (
              <h2 id={`meeting-mosaic-heading-${section.id}`}>{section.label}</h2>
            )}
          </div>
          <a
            href="#secciones-reunion"
            className="meeting-mosaic-panel-back"
            aria-label="Volver al índice de secciones"
          >
            Índice ↑
          </a>
        </div>
        <div className="meeting-mosaic-panel-content">{section.content}</div>
      </section>
    );
  }

  const general = tabs.find((tab) => tab.id === "general");
  const encuentros = tabs.find((tab) => tab.id === "encuentros");
  const personas = tabs.find((tab) => tab.id === "personas");
  const archivos = tabs.find((tab) => tab.id === "archivos");
  const actividad = tabs.find((tab) => tab.id === "actividad");

  return (
    <div className="meeting-tabs-workspace meeting-mosaic-workspace">
      <details className="meeting-mobile-outline" id="secciones-reunion">
        <summary>
          <span>
            <strong>Ir a una sección</strong>
            <small>Todo el contenido está disponible al desplazarte</small>
          </span>
          <ChevronDown size={19} aria-hidden="true" />
        </summary>
        <nav className="meeting-mobile-outline-links" aria-label="Secciones de la reunión">
          {tabs.map((tab, index) => (
            <a
              href={`#${tab.id}`}
              key={tab.id}
              onClick={(event) => {
                const parent = event.currentTarget.closest("details");
                if (parent) {
                  parent.open = false;
                }
              }}
            >
              <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
              {tab.label}
            </a>
          ))}
        </nav>
      </details>

      <div className="meeting-mosaic-layout">
        {renderSection(general, 0)}
        <div className="meeting-mosaic-columns">
          <div className="meeting-mosaic-primary">{renderSection(encuentros, 1)}</div>
          <div className="meeting-mosaic-secondary">
            {renderSection(personas, 2)}
            {renderSection(archivos, 3)}
            {renderSection(actividad, 4)}
          </div>
        </div>
      </div>
    </div>
  );
}
