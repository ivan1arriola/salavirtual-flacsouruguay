"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { usePathname } from "next/navigation";
import { driver, type DriveStep } from "driver.js";

export const RESTART_TEACHER_TOUR_EVENT = "salavirtual:restart-teacher-tour";

const TOUR_VERSION = "v2";

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
      description: "Este resumen concentra tus próximas actividades. Desde acá podés revisar qué reuniones vienen, detectar enlaces de Meet todavía pendientes y entrar rápidamente a la agenda o crear una nueva reunión.",
      side: "bottom",
      align: "start"
    }),
    step('[data-tour="teacher-agenda"]', {
      title: "Agenda",
      description: "Acá consultás todas las reuniones asociadas a tus programas. Podés revisar fecha y horario, cuenta Google asignada, enlace de Meet, asistencia técnica y entrar al detalle para modificar encuentros futuros.",
      side: "right",
      align: "start"
    }),
    step('[data-tour="teacher-programs"]', {
      title: "Mis programas",
      description: "Elegí los programas académicos con los que trabajás. Esta selección determina qué programas aparecen disponibles cuando creás una reunión nueva.",
      side: "right",
      align: "start"
    }),
    step('[data-tour="teacher-recordings"], [data-tour="teacher-more"]', {
      title: "Grabaciones",
      description: "Consultá las grabaciones que ya estén disponibles, reproducilas desde Sala Virtual o abrí su carpeta de Google Drive. En celular, esta opción se encuentra dentro de Más.",
      side: "right",
      align: "start"
    }),
    step('[data-tour="teacher-notifications"]', {
      title: "Notificaciones",
      description: "Los avisos vinculados con tus reuniones aparecen acá. El número sobre la campana indica cuántas notificaciones todavía no leíste.",
      side: "right",
      align: "start"
    }),
    step('[data-tour="teacher-profile"]', {
      title: "Tu cuenta",
      description: "Desde este menú podés abrir Mi perfil, cambiar tu contraseña y preferencias de notificaciones, cambiar de cuenta, repetir este tutorial o cerrar sesión.",
      side: "top",
      align: "start"
    }),
    step('[data-tour="teacher-create"]', {
      title: "Crear una reunión",
      description: "Usá Nueva reunión para programar una clase, seminario u otra actividad. Podés crear un único encuentro o una serie completa y Sala Virtual generará los eventos de Calendar y sus enlaces de Google Meet.",
      side: "right",
      align: "start"
    })
  ].filter((item): item is DriveStep => item !== null);
}

function meetingSteps(): DriveStep[] {
  return [
    step("#datos-academicos", {
      title: "1. Datos académicos",
      description: "Empezá identificando la actividad. Escribí un título claro, elegí el programa correspondiente y, si lo necesitás, agregá una descripción general. Esa descripción se utilizará como información común para toda la serie.",
      side: "bottom",
      align: "start"
    }),
    step("#datos-academicos .modality-choice", {
      title: "Modalidad de la actividad",
      description: "Elegí Virtual cuando todos participen por Google Meet. Elegí Híbrida cuando parte de la actividad sea presencial y también haya participantes conectados de forma remota.",
      side: "bottom",
      align: "start"
    }),
    step("#fechas .date-mode-selector", {
      title: "2. Elegí cómo cargar las fechas",
      description: "Hay tres formas de programar los encuentros. Elegí la que mejor represente la actividad: una sola fecha, una serie semanal regular o varias fechas cargadas manualmente.",
      side: "top",
      align: "start"
    }),
    step("#fechas .date-mode-selector label:nth-of-type(1)", {
      title: "Una fecha",
      description: "Usá esta opción para una actividad que ocurre una sola vez. Solo tenés que indicar la fecha, la hora de inicio y la hora de fin. También podés agregar una descripción específica para ese encuentro.",
      side: "bottom",
      align: "start"
    }),
    step("#fechas .date-mode-selector label:nth-of-type(2)", {
      title: "Repetición semanal",
      description: "Usala para cursos que se repiten regularmente. Definís una fecha inicial y final, el horario común y los días de la semana. Después tocás Generar vista previa y podés revisar cada encuentro, cambiar fechas u horarios, quitar una fecha o agregar excepciones.",
      side: "bottom",
      align: "start"
    }),
    step("#fechas .date-mode-selector label:nth-of-type(3)", {
      title: "Fechas específicas",
      description: "Elegí esta modalidad cuando no haya una periodicidad fija. Cargás cada encuentro por separado y podés usar Agregar otra fecha para incorporar todas las instancias necesarias.",
      side: "bottom",
      align: "start"
    }),
    step("#fechas .date-row:first-child", {
      title: "Fecha, horario y descripción",
      description: "Completá la fecha y las horas de inicio y fin. Todos los horarios se interpretan en UTC-3, hora de Montevideo. La descripción del encuentro es opcional: si la dejás vacía, se utilizará la descripción general ingresada arriba.",
      side: "top",
      align: "start"
    }),
    step("#organizacion .auto-room-note", {
      title: "3. Sala Meet automática",
      description: "No tenés que elegir una cuenta de sala manualmente. Al crear la reunión, Sala Virtual buscará una cuenta institucional disponible y generará el evento de Google Calendar y el enlace de Google Meet para cada encuentro.",
      side: "top",
      align: "start"
    }),
    step("#organizacion .check-field:nth-of-type(1)", {
      title: "Asistencia técnica",
      description: "Marcá esta opción cuando necesites que un asistente técnico acompañe el encuentro. Para Docentes, la solicitud queda abierta a postulaciones y posteriormente podrás consultar si ya existe una persona asignada.",
      side: "top",
      align: "start"
    }),
    step("#organizacion .check-field:nth-of-type(2)", {
      title: "Grabación",
      description: "Marcá Grabación cuando la actividad deba quedar registrada. Esta opción deja asentado el requerimiento en Sala Virtual; al comenzar el encuentro conviene verificar en Google Meet que la grabación haya sido iniciada correctamente.",
      side: "top",
      align: "start"
    }),
    step("#organizacion .cohost-disclosure", {
      title: "Cohosts",
      description: "Esta sección es opcional. Abrila si otras personas necesitan permisos de coorganización. Podés elegir cuentas ya guardadas o escribir otros correos separados por comas.",
      side: "top",
      align: "start"
    }),
    step(".meeting-form .form-actions", {
      title: "Revisá y creá la reunión",
      description: "Antes de confirmar, revisá la cantidad de encuentros y los datos cargados. El botón indicará si vas a crear una reunión o varios encuentros. Durante la creación no vuelvas a presionarlo: Sala Virtual guardará la actividad y configurará Google Calendar y Meet automáticamente.",
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