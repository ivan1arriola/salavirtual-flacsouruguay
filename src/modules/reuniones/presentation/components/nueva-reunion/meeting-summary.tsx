export function MeetingSummary({ count, isReady, hasProgram, academicReady, requiresAssistance, requiresRecording }: Readonly<{
  count: number;
  isReady: boolean;
  hasProgram: boolean;
  academicReady: boolean;
  requiresAssistance: boolean;
  requiresRecording: boolean;
}>) {
  return (
          <div className="meeting-form-summary-v2" role="status" aria-live="polite">
            <strong>{count} {count === 1 ? "encuentro" : "encuentros"}</strong>
            <span>{isReady ? "Listo para crear" : !hasProgram ? "Elegí un programa" : !academicReady ? "Completá el título" : "Revisá fechas y horarios"}</span>
            <small>{requiresAssistance ? "Con monitoreo" : "Sin monitoreo"} · {requiresRecording ? "Se graba" : "Sin grabación"}</small>
          </div>
  );
}
