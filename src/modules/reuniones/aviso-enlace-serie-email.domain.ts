import {
  botonCorreo,
  envolverCorreo,
  escaparHtmlEmail,
  panelCorreo,
} from "@/src/lib/email/email-design-system";

export type TipoAvisoEnlaceSerie = "MIGRACION_SERIE" | "CORRECCION_ENLACE";

export type DatosAvisoEnlaceSerie = Readonly<{
  nombre?: string | null;
  reunion: string;
  programa?: string | null;
  /** Todos los encuentros próximos de la serie: comparten el mismo enlace. */
  encuentros: readonly Readonly<{ fecha: string; horario: string }>[];
  /** join_url real de Zoom. Nunca el start_url del anfitrión. */
  urlZoom: string;
  tipo: TipoAvisoEnlaceSerie;
}>;

const TEXTOS: Record<
  TipoAvisoEnlaceSerie,
  Readonly<{ asunto: string; titulo: string; resumen: string; aviso: string }>
> = {
  MIGRACION_SERIE: {
    asunto: "Cambio a Zoom",
    titulo: "Tu reunión ahora es por Zoom",
    resumen: "Un solo enlace de Zoom para todos los encuentros de la serie.",
    aviso:
      "La reunión dejó de realizarse por Google Meet y ahora es por Zoom, con un solo enlace para todos los encuentros.",
  },
  CORRECCION_ENLACE: {
    asunto: "Nuevo enlace de Zoom",
    titulo: "El enlace de tu reunión cambió",
    resumen: "Usá este enlace de Zoom para todos los encuentros de la serie.",
    aviso:
      "El enlace de Zoom de la reunión cambió. Usá el enlace nuevo para todos los encuentros; el anterior dejará de funcionar.",
  },
};

/** Aviso individual de cambio de enlace: un solo correo con todos los encuentros próximos de la serie. */
export function construirAvisoEnlaceSerieZoom(
  input: DatosAvisoEnlaceSerie,
): Readonly<{ subject: string; text: string; html: string }> {
  const e = escaparHtmlEmail;
  const textos = TEXTOS[input.tipo];
  const saludo = input.nombre?.trim() ? `Hola ${input.nombre.trim()},` : "Hola,";
  const titulo = input.reunion + (input.programa ? ` — ${input.programa}` : "");

  const text = [
    textos.titulo,
    "",
    saludo,
    textos.aviso,
    titulo,
    "",
    "Encuentros:",
    ...input.encuentros.map(({ fecha, horario }) => `- ${fecha} · ${horario}`),
    "",
    `Enlace de Zoom: ${input.urlZoom}`,
  ].join("\n");

  const agenda = input.encuentros
    .map(
      ({ fecha, horario }) =>
        `<p style="margin:0 0 6px;color:#192b44;font-size:14px;line-height:22px"><strong>${e(fecha)}</strong> · ${e(horario)}</p>`,
    )
    .join("");
  const detalles = panelCorreo(
    `<p style="margin:0 0 6px;color:#192b44;font-size:18px;line-height:26px;font-weight:700">${e(input.reunion)}</p>` +
      (input.programa
        ? `<p style="margin:0 0 14px;color:#526277;font-size:13px;line-height:20px">${e(input.programa)}</p>`
        : "") +
      agenda,
    "Encuentros de la serie · Uruguay",
  );
  const html = envolverCorreo({
    categoria: "Cambio de enlace",
    titulo: textos.titulo,
    resumen: textos.resumen,
    variante: "accion",
    contenidoHtml:
      detalles +
      `<div style="margin:15px 0">${botonCorreo({ texto: "Ingresar a Zoom", url: input.urlZoom })}</div>`,
    nota: "Fechas y horarios no cambian. Usá este enlace para todos los encuentros.",
    preferenciasUrl: null,
  });
  return { subject: `${textos.asunto}: ${input.reunion} · Sala Virtual FLACSO`, text, html };
}
