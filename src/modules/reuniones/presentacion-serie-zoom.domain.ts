import type { AccionSerieZoom, ClasificacionSerieZoom, DiagnosticoSerieZoom } from "./diagnostico-serie-zoom.domain";

export type AccionEscrituraSerie = Exclude<AccionSerieZoom, "VER_DETALLE">;

export type PresentacionSerieZoom = Readonly<{
  etiqueta: string;
  /** Solo para el estilo: el estado siempre se comunica también con texto. */
  tono: "ok" | "pendiente" | "atencion" | "neutro";
  resumen: string;
  accionPrincipal: Readonly<{ tipo: AccionEscrituraSerie; texto: string }> | null;
}>;

const ETIQUETAS: Readonly<Record<ClasificacionSerieZoom, Readonly<{ etiqueta: string; tono: PresentacionSerieZoom["tono"] }>>> = {
  SANA: { etiqueta: "Sana", tono: "ok" },
  MIGRABLE: { etiqueta: "Para convertir", tono: "pendiente" },
  MEZCLADA: { etiqueta: "Mezclada Meet/Zoom", tono: "atencion" },
  ENLACES_DISTINTOS: { etiqueta: "Enlaces distintos", tono: "atencion" },
  RETOMABLE: { etiqueta: "A medias", tono: "atencion" },
  HUERFANA: { etiqueta: "Reunión sin encuentros", tono: "neutro" },
  SIN_FUTUROS: { etiqueta: "Sin encuentros futuros", tono: "neutro" },
};

const VERBOS: Readonly<Record<AccionEscrituraSerie, string>> = {
  MIGRAR: "Convertir a Zoom",
  UNIFICAR_ENLACE: "Unificar enlace",
  REANUDAR: "Retomar",
};

const plural = (n: number, singular: string, pluralTexto: string) => `${n} ${n === 1 ? singular : pluralTexto}`;

/** Qué muestra el panel de una serie: estado, conteos y la acción principal que permite el diagnóstico. */
export function presentarDiagnosticoSerie(diagnostico: DiagnosticoSerieZoom): PresentacionSerieZoom {
  const { conteos } = diagnostico;
  const partes = [
    `${conteos.enZoom} de ${conteos.total} en Zoom`,
    ...(conteos.enMeet > 0 ? [`${conteos.enMeet} en Meet`] : []),
    ...(conteos.enZoom > 0 ? [plural(conteos.enlacesDistintos, "enlace", "enlaces distintos")] : []),
  ];
  const principal = diagnostico.acciones.find((accion): accion is AccionEscrituraSerie => accion !== "VER_DETALLE");
  return {
    ...ETIQUETAS[diagnostico.clasificacion],
    resumen: partes.join(" · "),
    accionPrincipal: principal ? { tipo: principal, texto: VERBOS[principal] } : null,
  };
}

/** Texto del diálogo de confirmación: qué va a pasar antes de tocar Zoom, Calendar y los avisos. */
export function textoConfirmacionAccion(
  accion: AccionEscrituraSerie,
  datos: Readonly<{ titulo: string; encuentros: number }>,
): Readonly<{ titulo: string; detalle: string }> {
  const encuentros = plural(datos.encuentros, "encuentro", "encuentros");
  switch (accion) {
    case "UNIFICAR_ENLACE":
      return {
        titulo: `Unificar el enlace de «${datos.titulo}»`,
        detalle: `Se creará una sola reunión de Zoom para ${encuentros} que hoy tienen enlaces distintos y se actualizarán sus citas de Calendar. Quienes ya tenían un enlace recibirán un aviso con el nuevo; el anterior seguirá activo 7 días.`,
      };
    case "MIGRAR":
      return {
        titulo: `Convertir «${datos.titulo}» a Zoom`,
        detalle: `Se pasarán ${encuentros} de Meet a una sola reunión de Zoom, se actualizarán sus citas de Calendar y se avisará a los destinatarios.`,
      };
    case "REANUDAR":
      return {
        titulo: `Retomar «${datos.titulo}»`,
        detalle: `La serie quedó a medias. Se completarán ${encuentros} usando la misma reunión de Zoom ya creada, sin crear otra, y se avisará solo a quien falte.`,
      };
  }
}
