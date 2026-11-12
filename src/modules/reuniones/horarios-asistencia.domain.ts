/** Reglas de cobertura técnica según modalidad. */
export const MARGEN_ASISTENCIA_MINUTOS = 30;
export const ANTICIPACION_VIRTUAL_MINUTOS = 15;
export type ModalidadHorarioAsistencia = "HIBRIDA" | "VIRTUAL";
const MINUTOS_DIA = 24 * 60;

export type HorarioConAsistencia = Readonly<{
  horaInicio: string;
  horaFin: string;
  horaAsistenciaInicio: string;
  horaAsistenciaFin: string;
}>;

function minutos(value: string): number | null {
  if (!/^\d{2}:\d{2}$/.test(value)) {
    return null;
  }
  const [horas, minutos] = value.split(":").map(Number);
  return horas >= 0 && horas < 24 && minutos >= 0 && minutos < 60 ? horas * 60 + minutos : null;
}

function horaDesdeMinutos(value: number): string {
  const normalized = ((value % MINUTOS_DIA) + MINUTOS_DIA) % MINUTOS_DIA;
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
}

/** Sugerencia automática; el usuario puede ampliar la cobertura. */
export function sugerirHorarioAsistencia(
  horaInicio: string,
  horaFin: string,
  modalidad: ModalidadHorarioAsistencia = "HIBRIDA"
) {
  const inicio = minutos(horaInicio);
  const fin = minutos(horaFin);
  return {
    llegada:
      inicio === null
        ? ""
        : horaDesdeMinutos(
            inicio - (modalidad === "VIRTUAL" ? ANTICIPACION_VIRTUAL_MINUTOS : MARGEN_ASISTENCIA_MINUTOS)
          ),
    salida:
      fin === null ? "" : horaDesdeMinutos(fin + (modalidad === "VIRTUAL" ? 0 : MARGEN_ASISTENCIA_MINUTOS))
  };
}

/** Si el usuario personalizó una hora, no la pisamos al modificar el encuentro. */
export function sincronizarHorarioAsistencia<T extends HorarioConAsistencia>(
  anterior: T,
  nuevo: T,
  modalidad: ModalidadHorarioAsistencia = "HIBRIDA"
): T {
  const sugeridoAnterior = sugerirHorarioAsistencia(anterior.horaInicio, anterior.horaFin, modalidad);
  const sugeridoNuevo = sugerirHorarioAsistencia(nuevo.horaInicio, nuevo.horaFin, modalidad);
  if (modalidad === "VIRTUAL") {
    return { ...nuevo, horaAsistenciaInicio: sugeridoNuevo.llegada, horaAsistenciaFin: sugeridoNuevo.salida };
  }
  return {
    ...nuevo,
    horaAsistenciaInicio:
      !anterior.horaAsistenciaInicio || anterior.horaAsistenciaInicio === sugeridoAnterior.llegada
        ? sugeridoNuevo.llegada
        : anterior.horaAsistenciaInicio,
    horaAsistenciaFin:
      !anterior.horaAsistenciaFin || anterior.horaAsistenciaFin === sugeridoAnterior.salida
        ? sugeridoNuevo.salida
        : anterior.horaAsistenciaFin
  };
}

/** Compensa el cambio de día en coberturas que comienzan antes de medianoche o terminan después. */
export function desfaseDiaAsistencia(
  horaEvento: string,
  horaAsistencia: string,
  extremo: "LLEGADA" | "SALIDA"
): number {
  const evento = minutos(horaEvento);
  const asistencia = minutos(horaAsistencia);
  if (evento === null || asistencia === null) {
    return 0;
  }
  if (extremo === "LLEGADA" && asistencia > evento && evento < 720 && asistencia >= 720) {
    return -1;
  }
  if (extremo === "SALIDA" && asistencia < evento && evento >= 720 && asistencia < 720) {
    return 1;
  }
  return 0;
}

export function horarioAsistenciaCumpleMargen(
  horario: HorarioConAsistencia,
  modalidad: ModalidadHorarioAsistencia = "HIBRIDA"
): boolean {
  const inicio = minutos(horario.horaInicio);
  const fin = minutos(horario.horaFin);
  const llegada = minutos(horario.horaAsistenciaInicio);
  const salida = minutos(horario.horaAsistenciaFin);
  if (inicio === null || fin === null || llegada === null || salida === null || fin <= inicio) {
    return false;
  }
  const llegadaAbsoluta =
    llegada + desfaseDiaAsistencia(horario.horaInicio, horario.horaAsistenciaInicio, "LLEGADA") * MINUTOS_DIA;
  const salidaAbsoluta =
    salida + desfaseDiaAsistencia(horario.horaFin, horario.horaAsistenciaFin, "SALIDA") * MINUTOS_DIA;
  return modalidad === "VIRTUAL"
    ? inicio - llegadaAbsoluta === ANTICIPACION_VIRTUAL_MINUTOS && salidaAbsoluta === fin
    : inicio - llegadaAbsoluta >= MARGEN_ASISTENCIA_MINUTOS &&
        salidaAbsoluta - fin >= MARGEN_ASISTENCIA_MINUTOS;
}
