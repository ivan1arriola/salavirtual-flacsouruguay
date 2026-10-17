import {
  etiquetaMes,
  formatearDuracion,
  formatearHorasDecimales,
  minutosTotales
} from "./calculo-horas.domain";
import type { CorreoReporteMensual, ResumenAsistencia } from "./liquidaciones.types";

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
  const subject = `Horas de monitoreo — ${capitalizar(mes)}`;
  const text = [
    `Hola ${input.nombre},`,
    "",
    `Según Sala Virtual FLACSO, durante ${mes} realizaste ${total} de trabajo de monitoreo (${decimal} horas).`,
    "",
    `Reuniones: ${input.resumen.reuniones}`,
    `Virtual: ${virtual}`,
    `Híbrida: ${hibrida}`,
    "",
    "Este resumen fue generado automáticamente a partir de las asistencias registradas en el sistema.",
    "Si detectás una diferencia, respondé a todos para que Administración pueda revisarla."
  ].join("\n");
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.55;color:#1f2937;max-width:640px;margin:0 auto">
      <h2 style="margin:0 0 16px">Resumen mensual de monitoreo</h2>
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
      <p style="color:#4b5563">Si detectás una diferencia, respondé a todos para que Administración pueda revisarla.</p>
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
