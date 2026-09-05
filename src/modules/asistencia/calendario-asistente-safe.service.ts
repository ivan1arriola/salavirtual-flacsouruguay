import type { ResultadoSincronizacionCalendarioAsistente } from "./calendario-asistente.service";

export type IntentoSincronizacionCalendarioAsistente = Readonly<{
  resultados: readonly ResultadoSincronizacionCalendarioAsistente[];
  error: string | null;
}>;

export async function intentarSincronizacionCalendarioAsistente(
  operation: () => Promise<readonly ResultadoSincronizacionCalendarioAsistente[]>,
): Promise<IntentoSincronizacionCalendarioAsistente> {
  try {
    return {
      resultados: await operation(),
      error: null,
    };
  } catch (error) {
    return {
      resultados: [],
      error: error instanceof Error
        ? error.message
        : "No se pudo sincronizar Google Calendar.",
    };
  }
}
