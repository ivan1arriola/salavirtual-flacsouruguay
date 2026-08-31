import { claveMesUtc3, rangoMesUtc3, type ResumenAsistencia } from "./resumen-personal.domain";

export type PeriodoReporteMensual = Readonly<{
  clave: string;
  desde: Date;
  hasta: Date;
}>;

export type CorreoReporteMensual = Readonly<{
  subject: string;
  text: string;
  html: string;
}>;

export function periodoMesAnteriorUtc3(ahora: Date): PeriodoReporteMensual {
  const mesActual = rangoMesUtc3(ahora);
  const referenciaMesAnterior = new Date(mesActual.desdeMs - 1);
  const mesAnterior = rangoMesUtc3(referenciaMesAnterior);
  return {
    clave: claveMesUtc3(referenciaMesAnterior),
    desde: new Date(mesAnterior.desdeMs),
    hasta: new Date(mesAnterior.hastaMs)
  };
}

export function minutosTotales(resumen: ResumenAsistencia): number {
  return resumen.minutosVirtuales + resumen.minutosHibridos;
}

export function formatearDuracion(minutos: number): string {
  const total = Math.max(0, Math.round(minutos));
  const horas = Math.floor(total / 60);
  const resto = total % 60;
  if (resto === 0) return `${horas} h`;
  return `${horas} h ${resto} min`;
}

export function formatearHorasDecimales(minutos: number): string {
  return (Math.max(0, minutos) / 60).toFixed(2).replace(".", ",");
}

export function etiquetaMes(periodo: string): string {
  const [yearText, monthText] = periodo.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return periodo;
  }
  return new Intl.DateTimeFormat("es-UY", {
    month: "long",
    year: "numeric",
    timeZone: "America/Montevideo"
  }).format(new Date(Date.UTC(year, month - 1, 15, 12)));
}

export function construirCorreoReporteMensual(input: Readonly<{
  nombre: string;
  periodo: string;
  resumen: ResumenAsistencia;
}>): CorreoReporteMensual {
  const totalMinutos = minutosTotales(input.resumen);
  const total = formatearDuracion(totalMinutos);
  const decimal = formatearHorasDecimales(totalMinutos);
  const virtual = formatearDuracion(input.resumen.minutosVirtuales);
  const hibrida = formatearDuracion(input.resumen.minutosHibridos);
  const mes = etiquetaMes(input.periodo);
  const subject = `Horas de asistencia técnica — ${capitalizar(mes)}`;
  const text = [
    `Hola ${input.nombre},`,
    "",
    `Según Sala Virtual FLACSO, durante ${mes} realizaste ${total} de asistencia técnica (${decimal} horas).`,
    "",
    `Reuniones: ${input.resumen.reuniones}`,
    `Virtual: ${virtual}`,
    `Híbrida: ${hibrida}`,
    "",
    "Este resumen fue generado automáticamente a partir de las asistencias registradas en el sistema.",
    "Si detectás una diferencia, respondé este correo para que Administración pueda revisarla."
  ].join("\n");
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.55;color:#1f2937;max-width:640px;margin:0 auto">
      <h2 style="margin:0 0 16px">Resumen mensual de asistencia técnica</h2>
      <p>Hola ${escapeHtml(input.nombre)},</p>
      <p>Según Sala Virtual FLACSO, durante <strong>${escapeHtml(mes)}</strong> realizaste:</p>
      <p style="font-size:28px;font-weight:700;margin:18px 0 4px">${escapeHtml(total)}</p>
      <p style="margin:0 0 20px;color:#4b5563">${escapeHtml(decimal)} horas</p>
      <table style="border-collapse:collapse;width:100%;margin:0 0 20px">
        <tbody>
          <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb">Reuniones</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right"><strong>${input.resumen.reuniones}</strong></td></tr>
          <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb">Virtual</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right"><strong>${escapeHtml(virtual)}</strong></td></tr>
          <tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb">Híbrida</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right"><strong>${escapeHtml(hibrida)}</strong></td></tr>
        </tbody>
      </table>
      <p style="color:#4b5563">Este resumen fue generado automáticamente a partir de las asistencias registradas en el sistema.</p>
      <p style="color:#4b5563">Si detectás una diferencia, respondé este correo para que Administración pueda revisarla.</p>
    </div>
  `.trim();
  return { subject, text, html };
}

function capitalizar(value: string): string {
  return value ? value[0].toUpperCase() + value.slice(1) : value;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
