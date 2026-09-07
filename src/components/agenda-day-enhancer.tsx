"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";

const MONTEVIDEO_TIME_ZONE = "America/Montevideo";
const DAY_TONE_CLASSES = [
  "agenda-day-tone-0",
  "agenda-day-tone-1",
  "agenda-day-tone-2",
  "agenda-day-tone-3",
  "agenda-day-tone-4"
] as const;

const shortDateFormatter = new Intl.DateTimeFormat("es-UY", {
  timeZone: MONTEVIDEO_TIME_ZONE,
  weekday: "short",
  day: "2-digit",
  month: "short"
});

const timePartsFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: MONTEVIDEO_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23"
});

export function AgendaDayEnhancer() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();

  useEffect(() => {
    if (pathname !== "/reuniones") return;

    const apply = () => enhanceAgenda();
    apply();
    const timer = window.setInterval(apply, 30_000);

    return () => {
      window.clearInterval(timer);
      cleanupAgendaEnhancement();
    };
  }, [pathname, searchKey]);

  return null;
}

function enhanceAgenda(): void {
  const root = document.querySelector<HTMLElement>(".meetings-agenda-page.agenda-v2");
  if (!root) return;

  root.querySelectorAll<HTMLElement>(".agenda-day-heading[data-agenda-enhanced='true']")
    .forEach((heading) => heading.remove());

  const now = new Date();
  const todayLabel = normalizeDateLabel(shortDateFormatter.format(now));
  const tomorrowLabel = normalizeDateLabel(shortDateFormatter.format(new Date(now.getTime() + 86_400_000)));
  const yesterdayLabel = normalizeDateLabel(shortDateFormatter.format(new Date(now.getTime() - 86_400_000)));

  root.querySelectorAll<HTMLElement>(".agenda-cohost-block > small").forEach((note) => {
    if (note.textContent?.includes("cuenta FLACSO")) {
      note.textContent = note.textContent.replace("cuenta FLACSO", "cuenta Google");
    }
  });

  root.querySelectorAll<HTMLElement>(".agenda-meeting-list").forEach((list) => {
    const cards = [...list.querySelectorAll<HTMLElement>(":scope > .agenda-meeting-card")];
    let previousDay = "";
    let stripeIndex = 0;
    let toneIndex = 0;

    cards.forEach((card) => {
      clearDayClasses(card);

      const dateText = card.querySelector<HTMLElement>(".agenda-meeting-date > span")?.textContent ?? "";
      const dayLabel = normalizeDateLabel(dateText.split("→")[0] ?? "");
      if (!dayLabel) return;

      if (dayLabel !== previousDay) {
        previousDay = dayLabel;
        stripeIndex = 0;
        toneIndex = stableTone(dayLabel);
        card.before(createDayHeading(
          dayLabel,
          relativeDayLabel(dayLabel, todayLabel, tomorrowLabel, yesterdayLabel),
          toneIndex
        ));
      }

      card.classList.add("agenda-day-card", DAY_TONE_CLASSES[toneIndex]);
      if (stripeIndex % 2 === 1) card.classList.add("is-zebra");
      stripeIndex += 1;

      updateLiveEncounterStatus(card, dayLabel, todayLabel);
    });
  });
}

function cleanupAgendaEnhancement(): void {
  document.querySelectorAll<HTMLElement>(".agenda-day-heading[data-agenda-enhanced='true']")
    .forEach((heading) => heading.remove());
  document.querySelectorAll<HTMLElement>(".agenda-day-card")
    .forEach((card) => clearDayClasses(card));
}

function createDayHeading(dayLabel: string, relative: string, toneIndex: number): HTMLElement {
  const isToday = relative === "Hoy";
  const heading = document.createElement("div");
  heading.className = `agenda-day-heading ${DAY_TONE_CLASSES[toneIndex]}${isToday ? " is-today" : ""}`;
  heading.dataset.agendaEnhanced = "true";
  heading.setAttribute("role", "heading");
  heading.setAttribute("aria-level", "2");

  const relativeLabel = document.createElement("span");
  relativeLabel.textContent = relative;

  const date = document.createElement("strong");
  date.textContent = dayLabel;

  heading.append(relativeLabel, date);
  return heading;
}

function relativeDayLabel(
  dayLabel: string,
  todayLabel: string,
  tomorrowLabel: string,
  yesterdayLabel: string
): string {
  if (dayLabel === todayLabel) return "Hoy";
  if (dayLabel === tomorrowLabel) return "Mañana";
  if (dayLabel === yesterdayLabel) return "Ayer";
  return "Día";
}

function clearDayClasses(card: HTMLElement): void {
  card.classList.remove("agenda-day-card", "is-zebra", ...DAY_TONE_CLASSES);
}

function stableTone(dayLabel: string): number {
  let hash = 0;
  for (const character of dayLabel) {
    hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  }
  return Math.abs(hash) % DAY_TONE_CLASSES.length;
}

function normalizeDateLabel(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("es-UY");
}

function updateLiveEncounterStatus(card: HTMLElement, dayLabel: string, todayLabel: string): void {
  if (card.classList.contains("agenda-series-card")) return;

  const status = card.querySelector<HTMLElement>(".agenda-meeting-card-header > .status");
  if (!status) return;

  const currentStatus = status.textContent?.trim().toLocaleLowerCase("es-UY") ?? "";
  if (currentStatus === "cancelada" || currentStatus === "no realizada") return;
  if (dayLabel !== todayLabel) return;

  const range = card.querySelector<HTMLElement>(".agenda-meeting-date > strong")?.textContent ?? "";
  const match = range.match(/(\d{1,2}):(\d{2})\s*[–-]\s*(\d{1,2}):(\d{2})/);
  if (!match) return;

  const nowParts = timePartsFormatter.formatToParts(new Date());
  const hour = Number(nowParts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(nowParts.find((part) => part.type === "minute")?.value ?? "0");
  const nowMinutes = hour * 60 + minute;
  const startMinutes = Number(match[1]) * 60 + Number(match[2]);
  const endMinutes = Number(match[3]) * 60 + Number(match[4]);

  status.classList.remove("status-ok", "status-neutral", "status-warning");
  if (nowMinutes >= startMinutes && nowMinutes < endMinutes) {
    status.textContent = "En curso";
    status.classList.add("status-ok");
    return;
  }
  if (nowMinutes >= endMinutes) {
    status.textContent = "Finalizada";
    status.classList.add("status-neutral");
    return;
  }
  status.textContent = "Programada";
  status.classList.add("status-ok");
}
