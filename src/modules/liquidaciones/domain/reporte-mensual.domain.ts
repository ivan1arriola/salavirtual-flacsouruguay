import { envolverCorreo, panelCorreo, escaparHtmlEmail } from "@/src/lib/email/email-design-system";
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
  const detalle = [
    ["Reuniones", String(input.resumen.reuniones)],
    ["Modalidad virtual", virtual],
    ["Modalidad híbrida", hibrida]
  ].map(([etiqueta, valor]) =>
    '<tr><td style="padding:10px 0;border-bottom:1px solid #e4eaf0;color:#526277;font-size:13px">' +
      escaparHtmlEmail(etiqueta) + '</td>' +
      '<td align="right" style="padding:10px 0;border-bottom:1px solid #e4eaf0;color:#192b44;font-size:13px;font-weight:700">' +
      escaparHtmlEmail(valor) + '</td></tr>'
  ).join("");
  const html = envolverCorreo({
    categoria: "Resumen mensual",
    titulo: "Tus horas de monitoreo",
    resumen: "Período: " + capitalizar(mes),
    variante: "reporte",
    contenidoHtml:
      '<p style="margin:0 0 12px;font-size:14px;line-height:22px;color:#33465c">Hola, ' +
      escaparHtmlEmail(input.nombre) + '.</p>' +
      panelCorreo(
        '<p style="margin:0;color:#526277;font-size:12px;line-height:18px;text-transform:uppercase;font-weight:700;letter-spacing:.04em">Total registrado</p>' +
        '<p style="margin:5px 0 3px;color:#183b70;font-size:33px;line-height:40px;font-weight:700">' + escaparHtmlEmail(total) + '</p>' +
        '<p style="margin:0;color:#526277;font-size:13px;line-height:20px">' + escaparHtmlEmail(decimal) + ' horas decimales</p>',
        "Actividad de " + capitalizar(mes)
      ) +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-top:14px">' +
      detalle + '</table>',
    nota: "Este resumen se genera a partir de las asistencias registradas. Si detectás una diferencia, respondé a todos para que Administración pueda revisarla.",
    permiteRespuesta: true
  });
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
