"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { ChevronDown, ArrowUp } from "lucide-react";

type MeetingDetailTab = Readonly<{
  id: "general" | "encuentros" | "personas" | "archivos" | "actividad";
  label: string;
  content: ReactNode;
}>;

const MOBILE_MEDIA_QUERY = "(max-width: 760px)";

export function MeetingDetailTabs({
  tabs
}: Readonly<{ tabs: readonly MeetingDetailTab[] }>) {
  const [selectedId, setSelectedId] = useState<MeetingDetailTab["id"]>("general");
  const [isMobile, setIsMobile] = useState(false);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const instanceId = useId();
  const sectionNavigationId = `${instanceId}-section-navigation`;

  // Preserve a single instance of each section (and of its forms/state) when
  // switching between tabbed desktop and the continuous mobile reading mode.
  useEffect(() => {
    const media = window.matchMedia(MOBILE_MEDIA_QUERY);
    const handleChange = () => setIsMobile(media.matches);
    handleChange();
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    function selectFromLocation() {
      const hash = window.location.hash.slice(1);
      const matchingTab = tabs.find((tab) => tab.id === hash);
      if (!matchingTab) return;

      setSelectedId(matchingTab.id);
      // On mobile, previously hidden sections become visible after the media
      // query effect. Wait for that paint before restoring deep links.
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          document.getElementById(matchingTab.id)?.scrollIntoView({ block: "start" });
        });
      });
    }

    selectFromLocation();
    window.addEventListener("hashchange", selectFromLocation);
    window.addEventListener("popstate", selectFromLocation);
    return () => {
      window.removeEventListener("hashchange", selectFromLocation);
      window.removeEventListener("popstate", selectFromLocation);
    };
  }, [tabs, isMobile]);

  function selectTab(id: MeetingDetailTab["id"]) {
    setSelectedId(id);
    if (window.location.hash !== `#${id}`) {
      window.history.pushState(null, "", `#${id}`);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabs.length;
    if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = tabs.length - 1;
    if (nextIndex === null) return;

    event.preventDefault();
    const nextTab = tabs[nextIndex];
    if (!nextTab) return;
    selectTab(nextTab.id);
    tabRefs.current[nextIndex]?.focus();
  }

  function jumpToSection(id: MeetingDetailTab["id"]) {
    setSelectedId(id);
    if (window.location.hash !== `#${id}`) {
      window.history.pushState(null, "", `#${id}`);
    }
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className={`meeting-tabs-workspace${isMobile ? " meeting-tabs-workspace--continuous" : ""}`}>
      <div
        className="meeting-section-nav"
        role="tablist"
        aria-label="Secciones de la reunión"
        aria-orientation="horizontal"
        hidden={isMobile}
      >
        {tabs.map((tab, index) => {
          const selected = selectedId === tab.id;
          const tabId = `${instanceId}-${tab.id}-tab`;
          return (
            <button
              aria-controls={tab.id}
              aria-selected={selected}
              className="meeting-section-tab"
              id={tabId}
              key={tab.id}
              onClick={() => selectTab(tab.id)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              ref={(element) => { tabRefs.current[index] = element; }}
              role="tab"
              tabIndex={selected ? 0 : -1}
              type="button"
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <details className="meeting-mobile-outline" id={sectionNavigationId} hidden={!isMobile}>
        <summary>
          <span>
            <strong>Contenido de la reunión</strong>
            <small>Las {tabs.length} secciones están visibles al desplazarte</small>
          </span>
          <span className="meeting-mobile-outline-action">Ir a sección <ChevronDown size={17} aria-hidden="true" /></span>
        </summary>
        <nav className="meeting-mobile-outline-links" aria-label="Ir a una sección de la reunión">
          {tabs.map((tab, index) => (
            <a
              href={`#${tab.id}`}
              key={tab.id}
              onClick={(event) => {
                event.preventDefault();
                jumpToSection(tab.id);
                const outline = event.currentTarget.closest("details");
                if (outline instanceof HTMLDetailsElement) outline.open = false;
              }}
            >
              <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>{tab.label}
            </a>
          ))}
        </nav>
      </details>

      {tabs.map((tab, index) => {
        const selected = selectedId === tab.id;
        return (
          <section
            aria-label={isMobile ? tab.label : undefined}
            aria-labelledby={isMobile ? undefined : `${instanceId}-${tab.id}-tab`}
            className="meeting-detail-section"
            hidden={!isMobile && !selected}
            id={tab.id}
            key={tab.id}
            role={isMobile ? "region" : "tabpanel"}
            tabIndex={isMobile ? -1 : 0}
          >
            <div className="meeting-mobile-section-marker">
              <span className="meeting-mobile-section-index">Sección {index + 1} de {tabs.length}</span>
              <a href={`#${sectionNavigationId}`} aria-label="Volver al índice de secciones">
                <ArrowUp size={14} aria-hidden="true" /> Índice
              </a>
            </div>
            {tab.content}
          </section>
        );
      })}
    </div>
  );
}
