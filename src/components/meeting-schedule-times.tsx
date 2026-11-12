import { Clock3, Headset } from "lucide-react";
import { formatDate, formatTime } from "@/src/lib/ui/format";

type Instant = Date | string;

/** Both schedules have different purposes, even when their start time happens to match. */
export function MeetingScheduleTimes({
  startsAt,
  endsAt,
  assistanceStartsAt,
  assistanceEndsAt,
  requiresAssistance = false,
  modality = "VIRTUAL",
  viewerIsAssistant = false,
  compact = false
}: Readonly<{
  startsAt: Instant;
  endsAt: Instant;
  assistanceStartsAt?: Instant | null;
  assistanceEndsAt?: Instant | null;
  requiresAssistance?: boolean;
  modality?: "VIRTUAL" | "HIBRIDA";
  viewerIsAssistant?: boolean;
  compact?: boolean;
}>) {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const coverageConfigured = Boolean(assistanceStartsAt && assistanceEndsAt);
  const coverageMissing = requiresAssistance && modality === "HIBRIDA" && !coverageConfigured;
  // Reuniones virtuales antiguas pueden no tener horario técnico persistido.
  // Presentar la regla fija, sin confundirla con el horario del encuentro.
  const assistanceStart = assistanceStartsAt
    ? new Date(assistanceStartsAt)
    : requiresAssistance && modality === "VIRTUAL"
      ? new Date(start.getTime() - 15 * 60 * 1000)
      : start;
  const assistanceEnd = assistanceEndsAt ? new Date(assistanceEndsAt) : end;
  const sameDay = (a: Date, b: Date) => formatDate(a) === formatDate(b);
  const timeRange = (from: Date, to: Date) =>
    `${formatTime(from)}–${formatTime(to)}${sameDay(from, to) ? "" : ` (hasta ${formatDate(to)})`}`;

  return (
    <div
      className={`meeting-schedule-times${compact ? " is-compact" : ""}${viewerIsAssistant ? " is-assistant" : ""}`}
      aria-label="Horarios de la reunión y de monitoreo"
    >
      {requiresAssistance ? (
        <div className={`meeting-schedule-line is-coverage${coverageMissing ? " is-pending" : ""}`}>
          <Headset size={18} aria-hidden="true" />
          <div>
            <span>{viewerIsAssistant ? "Tu monitoreo" : "Horario de monitoreo"}</span>
            {coverageMissing ? (
              <>
                <strong>Horario técnico por confirmar</strong>
                <small>
                  Administración debe definir la llegada y salida del asistente antes de esta cobertura
                  híbrida.
                </small>
              </>
            ) : (
              <>
                <strong>{timeRange(assistanceStart, assistanceEnd)}</strong>
                <small>
                  {viewerIsAssistant ? "Tenés que estar desde las" : "Llegada del asistente:"}{" "}
                  {formatTime(assistanceStart)} · {viewerIsAssistant ? "Tu cobertura termina" : "Salida"}:{" "}
                  {formatTime(assistanceEnd)}
                </small>
              </>
            )}
          </div>
        </div>
      ) : null}
      <div className="meeting-schedule-line is-meeting">
        <Clock3 size={18} aria-hidden="true" />
        <div>
          <span>Horario del encuentro</span>
          <strong>{timeRange(start, end)}</strong>
          <small>
            La reunión empieza: {formatTime(start)} · Finaliza: {formatTime(end)}
          </small>
        </div>
      </div>
    </div>
  );
}
