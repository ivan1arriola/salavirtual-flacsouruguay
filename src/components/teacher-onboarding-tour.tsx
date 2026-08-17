"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { usePathname } from "next/navigation";
import { driver, type DriveStep } from "driver.js";

export const RESTART_TEACHER_TOUR_EVENT = "salavirtual:restart-teacher-tour";

const TOUR_VERSION = "v1";

function firstVisible(selector: string): Element | undefined {
  return Array.from(document.querySelectorAll(selector)).find((element) => {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
  });
}

function step(selector: string, popover: NonNullable<DriveStep["popover"]>): DriveStep | null {
  const element = firstVisible(selector);
  return element ? { element, popover } : null;
}

function homeSteps(): DriveStep[] {
  return [
    step('[data-tour="teacher-dashboard"]', {
      title: "Bienvenido a Sala Virtual",
      description: "Desde aquí podés organizar tus reuniones, consultar tu agenda y acceder a las actividades de tus programas.",
      side: "bottom",
      align: "start"
    }),
    step('[data-tour="teacher-agenda"]', {
      title: "Agenda",
      description: "Consultá tus próximas reuniones, horarios, cuentas Google, enlaces de Meet y asistencia técnica.",
      side: "right",
      align: "start"
    }),
    step('[data-tour="teacher-programs"]', {
      title: "Mis programas",
      description: "Administrá los programas académicos para los que podés crear reuniones.",
      side: "right",
      align: "start"
    }),
    step('[data-tour="teacher-recordings"], [data-tour="teacher-more"]', {
      title: "Grabaciones",
      description: "Accedé a las grabaciones disponibles y a sus archivos asociados. En celular, esta opción se encuentra dentro de Más.",
      side: "right",
      align: "start"
    }),
    step('[data-tour="teacher-notifications"]', {
      title: "Notificaciones",
      description: "Los avisos relacionados con tus reuniones aparecen en esta sección.",
      side: "right",
      align: "start"
    }),
    step('[data-tour="teacher-profile"]', {
      title: "Tu cuenta",
      description: "Desde este menú podés abrir Mi perfil, cambiar de cuenta, repetir este tutorial o cerrar sesión.",
      side: "top",
      align: "start"
    }),
    step('[data-tour="teacher-create"]', {
      title: "Crear una reunión",
      description: "Cuando necesites programar una actividad, comenzá desde Nueva reunión.",
      side: "right",
      align: "start"
    })
  ].filter((item): item is DriveStep => item !== null);
}

function meetingSteps(): DriveStep[] {
  return [
    step("#datos-academicos", {
      title: "1. Datos académicos",
      description: "Indicá el título, programa, modalidad y, si corresponde, una descripción general.",
      side: "bottom",
      align: "start"
    }),
    step("#fechas", {
      title: "2. Fechas",
      description: "Podés crear un único encuentro, una repetición semanal o cargar fechas específicas.",
      side: "top",
      align: "start"
    }),
    step("#organizacion", {
      title: "3. Organización",
      description: "Solicitá asistencia técnica, indicá si debe grabarse y agregá cohosts. La sala Meet se asigna automáticamente.",
      side: "top",
      align: "start"
    }),
    step(".meeting-form .form-actions", {
      title: "Crear la reunión",
      description: "Revisá los datos antes de confirmar. Sala Virtual creará los eventos y enlaces de Google Meet automáticamente.",
      side: "top",
      align: "center"
    })
  ].filter((item): item is DriveStep => item !== null);
}

function storageKey(userId: string, pathname: string): string {
  const section = pathname === "/reuniones/nueva" ? "nueva-reunion" : "inicio";
  return `salavirtual:tour:docente:${userId}:${section}:${TOUR_VERSION}`;
}

function consumeForceTutorialParameter(): boolean {
  const url = new URL(window.location.href);
  if (url.searchParams.get("tutorial") !== "1") return false;
  url.searchParams.delete("tutorial");
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  return true;
}

export function TeacherOnboardingTour({ userId }: Readonly<{ userId: string }>) {
  const pathname = usePathname();
  const runningRef = useRef(false);
  const currentStorageKey = useMemo(() => storageKey(userId, pathname), [pathname, userId]);

  const startTour = useCallback((force = false) => {
    if (runningRef.current) return;
    if (pathname !== "/" && pathname !== "/reuniones/nueva") return;
    if (!force && localStorage.getItem(currentStorageKey) === "done") return;

    const steps = pathname === "/" ? homeSteps() : meetingSteps();
    if (steps.length === 0) return;

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
      }
    });

    tour.drive();
  }, [currentStorageKey, pathname]);

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
    window.addEventListener(RESTART_TEACHER_TOUR_EVENT, restart);
    return () => window.removeEventListener(RESTART_TEACHER_TOUR_EVENT, restart);
  }, [currentStorageKey, startTour]);

  return null;
}
