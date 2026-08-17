"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { usePathname } from "next/navigation";
import { driver, type DriveStep } from "driver.js";

export const RESTART_TEACHER_TOUR_EVENT = "salavirtual:restart-teacher-tour";

const TOUR_VERSION = "v3";

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
      description: "Primero identificá qué actividad vas a programar. En esta sección definís el nombre, el programa académico, la modalidad y la información general de la reunión.",
      side: "bottom",
      align: "start"
    }),
    step('#datos-academicos input[name="titulo"]', {
      title: "Título de la reunión",
      description: "Escribí un nombre que permita reconocer la actividad fácilmente en la Agenda y en Google Calendar. Por ejemplo: “Clase 4 – Políticas sociales” o “Seminario de metodología”.",
      side: "bottom",
      align: "start"
    }),
    step('#datos-academicos select[name="docenteProgramaId"]', {
      title: "Programa y docente",
      description: "Seleccioná el programa al que pertenece la actividad. La lista depende de los programas que tengas asociados en Mis programas, por eso es importante mantener esa sección actualizada.",
      side: "bottom",
      align: "start"
    }),
    step("#datos-academicos .modality-choice", {
      title: "Modalidad",
      description: "Elegí Virtual cuando todas las personas participen por Google Meet. Elegí Híbrida cuando la actividad combine participantes presenciales y remotos.",
      side: "bottom",
      align: "start"
    }),
    step('#datos-academicos textarea[name="descripcion"]', {
      title: "Descripción general",
      description: "Este campo es opcional. Usalo para información común a toda la reunión o serie. Si después dejás vacía la descripción de un encuentro particular, se utilizará esta descripción general.",
      side: "top",
      align: "start"
    }),
    step("#fechas .date-mode-selector", {
      title: "2. Definir las fechas",
      description: "Elegí cómo querés construir el calendario de la actividad. Todos los horarios de esta sección se interpretan en UTC-3, hora de Montevideo.",
      side: "top",
      align: "start"
    }),
    step('#fechas label:has(input[name="dateMode"][value="SINGLE"])', {
      title: "Una fecha",
      description: "Elegí Una fecha para una actividad que ocurre una sola vez. Vas a cargar una fecha, una hora de inicio y una hora de fin.",
      side: "bottom",
      align: "start"
    }),
    step('#fechas label:has(input[name="dateMode"][value="RECURRENT"])', {
      title: "Repetición semanal",
      description: "Esta opción sirve para cursos regulares. Indicás el período completo, el horario y los días de la semana. Después generás una vista previa y podés corregir encuentros individuales, quitar fechas o agregar excepciones.",
      side: "bottom",
      align: "start"
    }),
    step('#fechas label:has(input[name="dateMode"][value="MANUAL"])', {
      title: "Fechas específicas",
      description: "Usala cuando las fechas no sigan una regla semanal. Podés cargar cada encuentro por separado y agregar tantas fechas como necesites.",
      side: "bottom",
      align: "start"
    }),
    step("#fechas .date-row:first-child", {
      title: "Fecha y horario del encuentro",
      description: "Para cada encuentro completá Fecha, Hora de inicio y Hora de fin. En una serie, cada fila representa un encuentro independiente y puede ajustarse sin modificar las demás.",
      side: "top",
      align: "start"
    }),
    step("#fechas .date-row:first-child .date-description", {
      title: "Descripción del encuentro",
      description: "Es opcional y sirve para indicar el tema de esa clase, un invitado o una observación particular. Si queda vacía, Sala Virtual utilizará la descripción general de la reunión.",
      side: "top",
      align: "start"
    }),
    step("#organizacion", {
      title: "3. Organización",
      description: "En esta sección indicás qué apoyos necesita la actividad. La cuenta que organizará Google Meet se administra automáticamente, así que no tenés que seleccionar una sala manualmente.",
      side: "top",
      align: "start"
    }),
    step("#organizacion .auto-room-note", {
      title: "Sala Meet automática",
      description: "Al crear una serie, Sala Virtual busca una misma cuenta institucional que esté libre en todas las fechas y horarios solicitados. Esa cuenta se asigna a todos los encuentros creados en la serie. Si ninguna cuenta está disponible para todo el conjunto, tendrás que ajustar las fechas u horarios antes de crearla.",
      side: "top",
      align: "start"
    }),
    step('#organizacion label:has(input[name="requiereAsistenciaTecnica"])', {
      title: "Asistencia técnica",
      description: "Marcala cuando necesites apoyo durante el encuentro. Para el rol Docente, la solicitud queda abierta a postulaciones de asistentes técnicos. Después podrás consultar desde la reunión si alguien ya fue asignado.",
      side: "top",
      align: "start"
    }),
    step('#organizacion label:has(input[name="requiereGrabacion"])', {
      title: "Grabación",
      description: "Marcala cuando el encuentro deba grabarse. Esta opción registra el requerimiento en Sala Virtual. Al comenzar la actividad, verificá en Google Meet que la grabación haya sido iniciada correctamente.",
      side: "top",
      align: "start"
    }),
    step("#organizacion .cohost-disclosure", {
      title: "Cohosts opcionales",
      description: "Abrí esta sección solamente si otras personas necesitan permisos de coorganización. Podés seleccionar cuentas guardadas o ingresar otros correos. Los correos manuales pueden escribirse separados por comas.",
      side: "top",
      align: "start"
    }),
    step(".meeting-form .meeting-form-submit-summary", {
      title: "Resumen antes de crear",
      description: "Acá podés comprobar cuántos encuentros se van a crear. Si todavía no definiste fechas, Sala Virtual te lo indicará antes de permitir la creación.",
      side: "top",
      align: "start"
    }),
    step('.meeting-form .form-actions button[type="submit"]', {
      title: "Crear la reunión",
      description: "Cuando todo esté correcto, confirmá desde este botón. Sala Virtual guardará la actividad, asignará una misma cuenta de sala disponible para todas las fechas, creará los eventos de Google Calendar y configurará los enlaces de Google Meet. Mientras aparece “Creando reunión…”, no vuelvas a presionar el botón.",
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
