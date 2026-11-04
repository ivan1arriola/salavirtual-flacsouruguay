export type EntradaResultadoSerie = Readonly<{
  resultado: string;
  etapa?: string;
  mensaje?: string;
  reintentable?: boolean;
}>;

export type MensajeResultadoSerie = Readonly<{
  titulo: string;
  detalle: string;
  accionSugerida: string;
  reintentable: boolean;
  detalleTecnico?: string;
}>;

type PlantillaMensaje = Readonly<{
  titulo: string;
  detalle: string;
  accionSugerida: string;
}>;

const PATRONES_NO_REINTENTABLES: readonly RegExp[] = [
  /22021/i,
  /invalid byte sequence/i,
  /clave de la serie no es v[aá]lida/i,
  /menos de 24 horas/i,
];

const MENSAJES_POR_RESULTADO: Readonly<Record<string, PlantillaMensaje>> = {
  MIGRADA: {
    titulo: "Serie convertida a Zoom",
    detalle:
      "Todos los encuentros futuros quedaron con un único enlace compartido de Zoom y las citas de Calendar actualizadas.",
    accionSugerida:
      "Podés abrir el detalle de la serie si querés verificar el enlace o el estado de los avisos por correo.",
  },
  CORREGIDA: {
    titulo: "Enlaces de la serie unificados",
    detalle:
      "Los encuentros futuros quedaron unificados en una sola reunión de Zoom y se actualizaron las citas de Calendar.",
    accionSugerida:
      "Revisá el detalle de la serie si necesitás confirmar el enlace vigente; los enlaces anteriores siguen activos por convivencia durante 7 días.",
  },
  YA_ZOOM: {
    titulo: "La serie ya estaba en Zoom",
    detalle:
      "Los encuentros futuros ya tenían Zoom como proveedor activo, por lo que no hizo falta volver a convertirlos.",
    accionSugerida:
      "No tenés que hacer nada más; abrí el detalle si querés revisar el enlace o los avisos.",
  },
  YA_UNIFICADA: {
    titulo: "La serie ya tenía un único enlace",
    detalle:
      "Todos los encuentros futuros ya compartían la misma reunión de Zoom y no había cambios pendientes.",
    accionSugerida:
      "No hace falta ninguna acción adicional; podés ver el detalle de la serie para consultar la reunión.",
  },
  OMITIDA: {
    titulo: "La serie no se pudo procesar ahora",
    detalle:
      "La serie no cumple las condiciones actuales para ejecutar esta acción automáticamente.",
    accionSugerida:
      "Abrí el detalle de la serie para revisar sus encuentros, horarios y anfitrión antes de volver a intentar.",
  },
};

const MENSAJES_ERROR_POR_ETAPA: Readonly<Record<string, PlantillaMensaje>> = {
  VALIDACION: {
    titulo: "No se pudo validar la serie",
    detalle:
      "La serie no cumple los requisitos para completar la operación en este momento (por ejemplo, disponibilidad de sala, horario próximo o estado de sus encuentros).",
    accionSugerida:
      "Abrí el detalle de la serie y verificá las fechas, el estado de los encuentros y las salas Zoom disponibles.",
  },
  ZOOM: {
    titulo: "No se pudo preparar la reunión en Zoom",
    detalle:
      "Hubo un problema al crear o verificar la reunión compartida en Zoom. Los encuentros actuales no cambiaron de proveedor.",
    accionSugerida:
      "Esperá unos segundos y volvé a intentar; si el problema continúa, revisá el estado de las cuentas de Zoom.",
  },
  CALENDAR: {
    titulo: "Quedaron citas pendientes en Google Calendar",
    detalle:
      "La reunión de Zoom está lista, pero no se pudieron actualizar o verificar todas las citas en Google Calendar. El avance quedó guardado.",
    accionSugerida:
      "Volvé a intentar para retomar únicamente las citas pendientes sin crear otra reunión de Zoom.",
  },
  CAMBIO_PROVEEDOR: {
    titulo: "No se pudo activar Zoom en los encuentros",
    detalle:
      "Las citas se prepararon, pero algún encuentro cambió de estado antes de guardar el cambio a Zoom y la operación se canceló para no dejar la serie a medias.",
    accionSugerida:
      "Refrescá la pantalla, revisá el detalle de la serie y volvé a intentar la conversión.",
  },
  VINCULACION: {
    titulo: "No se pudo vincular el enlace único a los encuentros",
    detalle:
      "La reunión de Zoom y las citas se prepararon, pero no se pudo guardar la vinculación final porque la serie o la disponibilidad de la sala cambió.",
    accionSugerida:
      "Revisá el detalle de la serie y reintentá la unificación para completar el paso final.",
  },
  AVISOS: {
    titulo: "El cambio se aplicó, pero faltaron avisos por correo",
    detalle:
      "Los encuentros ya tienen el enlace de Zoom actualizado, pero alguno de los correos de aviso a las personas invitadas no pudo enviarse.",
    accionSugerida:
      "Volvé a ejecutar la acción para reenviar solo los avisos pendientes sin duplicar los ya enviados.",
  },
  FINAL: {
    titulo: "Ocurrió un problema inesperado al procesar la serie",
    detalle:
      "La operación se detuvo por un fallo interno al procesar los datos de la serie.",
    accionSugerida:
      "Abrí el detalle de la serie para verificar en qué estado quedaron los encuentros; si no permite reintentar, consultá con soporte técnico.",
  },
};

export function esTextoNoReintentable(mensaje?: string): boolean {
  if (!mensaje) return false;
  return PATRONES_NO_REINTENTABLES.some((patron) => patron.test(mensaje));
}

/**
 * Traduce el resultado de migrar o unificar una serie a textos comprensibles
 * para Administración, ocultando errores técnicos de base de datos en un
 * detalle opcional y aplicando la regla determinista de reintento.
 */
export function describirResultadoSerie(
  entrada: EntradaResultadoSerie,
): MensajeResultadoSerie {
  const noReintentablePorTexto = esTextoNoReintentable(entrada.mensaje);

  if (entrada.resultado !== "ERROR") {
    const plantilla =
      MENSAJES_POR_RESULTADO[entrada.resultado] ?? MENSAJES_POR_RESULTADO.OMITIDA;
    const reintentable =
      Boolean(entrada.reintentable) && !noReintentablePorTexto;

    return {
      titulo: plantilla.titulo,
      detalle: plantilla.detalle,
      accionSugerida: plantilla.accionSugerida,
      reintentable,
    };
  }

  const plantillaError =
    (entrada.etapa ? MENSAJES_ERROR_POR_ETAPA[entrada.etapa] : undefined) ??
    MENSAJES_ERROR_POR_ETAPA.FINAL;
  const reintentableServicio = entrada.reintentable ?? true;
  const reintentable = reintentableServicio && !noReintentablePorTexto;
  const detalleTecnico =
    entrada.mensaje && entrada.mensaje.trim().length > 0
      ? entrada.mensaje
      : undefined;

  return {
    titulo: plantillaError.titulo,
    detalle: plantillaError.detalle,
    accionSugerida: plantillaError.accionSugerida,
    reintentable,
    ...(detalleTecnico !== undefined ? { detalleTecnico } : {}),
  };
}
