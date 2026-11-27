"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { usePathname } from "next/navigation";
import { driver, type DriveStep } from "driver.js";

export const RESTART_ASSISTANT_TOUR_EVENT = "salavirtual:restart-assistant-tour";

const TOUR_VERSION = "v1";
const TOUR_PATHS = ["/", "/agenda-abierta", "/reuniones-del-mes"] as const;

function firstVisible(selector: string): Element | undefined {
  return Array.from(document.querySelectorAll(selector)).find((element) => {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return (
      rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden"
    );
  });
}

function step(selector: string, popover: NonNullable<DriveStep["popover"]>): DriveStep | null {
  const element = firstVisible(selector);
  return element ? { element, popover } : null;
}

function homeSteps(): DriveStep[] {
  return [
    step('[data-tour="assistant-dashboard"]', {
      title: "Bienvenido a Sala Virtual",
      description:
        "Este resumen muestra tu próxima cobertura, requerimientos de atención y siguientes coberturas asignadas.",
      side: "bottom",
      align: "start",
    }),
    step('[data-tour="assistant-my-agenda"]', {
      title: "Mi agenda",
      description:
        "Acá aparecen tus reuniones asignadas, el desglose del mes en curso y tu histórico personal.",
      side: "right",
      align: "start",
    }),
    step('[data-tour="assistant-open-agenda"]', {
      title: "Agenda abierta",
      description:
        "Consultá las reuniones que necesitan monitoreo, revisá disponibilidad o posibles conflictos y postuláte.",
      side: "right",
      align: "start",
    }),
    step('[data-tour="assistant-month"]', {
      title: "Reuniones del mes",
      description:
        "Revisá tus horas e importes estimados y, después de una cobertura, confirmá el horario real e incidencias si corresponde.",
      side: "right",
      align: "start",
    }),
    step('[data-tour="assistant-recordings"]', {
      title: "Grabaciones",
      description: "Consultá las grabaciones que tenés habilitadas para ver desde Sala Virtual.",
      side: "right",
      align: "start",
    }),
    step('[data-tour="assistant-history"], [data-tour="assistant-more"]', {
      title: "Mi histórico",
      description:
        "Consultá tus reuniones, horas e importes de meses anteriores. En celular, esta opción se encuentra dentro de Más.",
      side: "right",
      align: "start",
    }),
    step('[data-tour="assistant-notifications"]', {
      title: "Notificaciones",
      description:
        "Consultá Notificaciones en la navegación o la campana del celular. El contador indica los avisos sin leer.",
      side: "bottom",
      align: "end",
    }),
    step('[data-tour="assistant-profile"]', {
      title: "Tu cuenta",
      description:
        "Desde este menú podés abrir Notificaciones y Mi perfil, cambiar de cuenta, repetir el tutorial o cerrar sesión.",
      side: "top",
      align: "start",
    }),
  ].filter((item): item is DriveStep => item !== null);
}

function openAgendaSteps(): DriveStep[] {
  return [
    step('[data-tour="assistant-open-list"]', {
      title: "Reuniones disponibles",
      description:
        "Esta lista contiene únicamente reuniones futuras que requieren monitoreo y todavía no tienen un asistente asignado.",
      side: "top",
      align: "start",
    }),
    step('[data-tour="assistant-interest"]', {
      title: "Postularme",
      description:
        "Usá Postularme para marcar tu interés. Una postulación no es una asignación: cuando la cobertura quede confirmada aparecerá en Mi agenda. Si cambiás de idea, podés usar Retirar mientras siga disponible.",
      side: "left",
      align: "center",
    }),
  ].filter((item): item is DriveStep => item !== null);
}

function monthSteps(): DriveStep[] {
  return [
    step('[data-tour="assistant-month-summary"]', {
      title: "Resumen del mes",
      description:
        "Acá se muestran por separado las horas virtuales e híbridas y la cotización total estimada del mes en curso.",
      side: "bottom",
      align: "start",
    }),
    step('[data-tour="assistant-month-list"]', {
      title: "Tus coberturas del mes",
      description:
        "La lista muestra modalidad, horario, duración y estado de cada monitoreo asignada.",
      side: "top",
      align: "start",
    }),
    step('[data-tour="assistant-close-assistance"]', {
      title: "Finalizar monitoreo",
      description:
        "Cuando una reunión haya terminado, confirmá el inicio y fin efectivos. También podés agregar observaciones y registrar una incidencia con su tipo, severidad y descripción.",
      side: "left",
      align: "center",
    }),
  ].filter((item): item is DriveStep => item !== null);
}

function tourSteps(pathname: string): DriveStep[] {
  if (pathname === "/agenda-abierta") {
    return openAgendaSteps();
  }
  if (pathname === "/reuniones-del-mes") {
    return monthSteps();
  }
  return homeSteps();
}

function storageKey(userId: string, pathname: string): string {
  const section =
    pathname === "/agenda-abierta"
      ? "agenda-abierta"
      : pathname === "/reuniones-del-mes"
        ? "reuniones-del-mes"
        : "inicio";
  return `salavirtual:tour:asistente:${userId}:${section}:${TOUR_VERSION}`;
}

function consumeForceTutorialParameter(): boolean {
  const url = new URL(window.location.href);
  if (url.searchParams.get("tutorial") !== "1") {
    return false;
  }
  url.searchParams.delete("tutorial");
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  return true;
}

export function AssistantOnboardingTour({ userId }: Readonly<{ userId: string }>) {
  const pathname = usePathname();
  const runningRef = useRef(false);
  const currentStorageKey = useMemo(() => storageKey(userId, pathname), [pathname, userId]);

  const startTour = useCallback(
    (force = false) => {
      if (runningRef.current) {
        return;
      }
      if (!TOUR_PATHS.includes(pathname as (typeof TOUR_PATHS)[number])) {
        return;
      }
      if (!force && localStorage.getItem(currentStorageKey) === "done") {
        return;
      }

      const steps = tourSteps(pathname);
      if (steps.length === 0) {
        return;
      }

      runningRef.current = true;
      const tour = driver({
        animate: true,
        smoothScroll: true,
        allowClose: true,
        disableActiveInteraction: true,
        overlayClickBehavior: "close",
        overlayOpacity: 0.55,
        stagePadding: 8,
        stageRadius: 12,
        showProgress: true,
        progressText: "{{current}} de {{total}}",
        nextBtnText: "Siguiente",
        prevBtnText: "Anterior",
        doneBtnText: "Finalizar",
        popoverClass: "flacso-tour",
        steps,
        onDestroyed: () => {
          localStorage.setItem(currentStorageKey, "done");
          runningRef.current = false;
        },
      });

      tour.drive();
    },
    [currentStorageKey, pathname],
  );

  useEffect(() => {
    const force = consumeForceTutorialParameter();
    const timeout = window.setTimeout(() => startTour(force), 450);
    return () => window.clearTimeout(timeout);
  }, [pathname, startTour]);

  useEffect(() => {
    const restart = () => {
      localStorage.removeItem(currentStorageKey);
      startTour(true);
    };
    window.addEventListener(RESTART_ASSISTANT_TOUR_EVENT, restart);
    return () => window.removeEventListener(RESTART_ASSISTANT_TOUR_EVENT, restart);
  }, [currentStorageKey, startTour]);

  return null;
}
