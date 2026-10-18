"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";

type MeetingDetailTab = Readonly<{
  id: "general" | "encuentros" | "personas" | "archivos" | "actividad";
  label: string;
  content: ReactNode;
}>;

export function MeetingDetailTabs({
  tabs
}: Readonly<{ tabs: readonly MeetingDetailTab[] }>) {
  const [selectedId, setSelectedId] = useState<MeetingDetailTab["id"]>("general");
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const instanceId = useId();

  useEffect(() => {
    function selectFromLocation() {
      const hash = window.location.hash.slice(1);
      const matchingTab = tabs.find((tab) => tab.id === hash);
      if (!matchingTab) return;
      setSelectedId(matchingTab.id);
      window.requestAnimationFrame(() => {
        document.getElementById(matchingTab.id)?.scrollIntoView({ block: "start" });
      });
    }

    selectFromLocation();
    window.addEventListener("hashchange", selectFromLocation);
    window.addEventListener("popstate", selectFromLocation);
    return () => {
      window.removeEventListener("hashchange", selectFromLocation);
      window.removeEventListener("popstate", selectFromLocation);
    };
  }, [tabs]);

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

  return (
    <div className="meeting-tabs-workspace">
      <div className="meeting-section-nav" role="tablist" aria-label="Secciones de la reunión" aria-orientation="horizontal">
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

      {tabs.map((tab) => {
        const selected = selectedId === tab.id;
        return (
          <section
            aria-labelledby={`${instanceId}-${tab.id}-tab`}
            className="meeting-detail-section"
            hidden={!selected}
            id={tab.id}
            key={tab.id}
            role="tabpanel"
            tabIndex={0}
          >
            {tab.content}
          </section>
        );
      })}
    </div>
  );
}
