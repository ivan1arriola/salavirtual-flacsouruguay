import {
  consolidarAsistenciaOcurrenciasZoom,
  type SesionObservadaZoom,
  type VentanaAsistenciaZoom
} from "../domain";
import type { AsistenciaZoomRepositoryPort, ResultadoSesionesZoom, SincronizacionAsistenciaZoomPort } from "../ports";

export type ProveedorSesionesZoom = Readonly<{ obtenerSesiones(uuidOcurrencia: string): Promise<ResultadoSesionesZoom> }>;

export type SincronizarAsistenciaZoomDeps = Readonly<{
  sync: SincronizacionAsistenciaZoomPort;
  repo: AsistenciaZoomRepositoryPort;
  provider: ProveedorSesionesZoom;
}>;

/** El estado del reporte de Zoom es independiente del de cualquier planilla de Workspace. */
export type ResultadoAsistenciaZoom =
  | Readonly<{ tipo: "OK"; estadoReporte: "DISPONIBLE"; participantes: number; sesionesNuevas: number }>
  | Readonly<{ tipo: "OK"; estadoReporte: "VACIO" }>
  /** Zoom todavía no tiene el reporte (404): se reintenta más tarde, no equivale a "nadie asistió". */
  | Readonly<{ tipo: "PENDIENTE"; estadoReporte: "NO_DISPONIBLE" }>
  | Readonly<{ tipo: "CONFLICTO"; motivo: "REPROGRAMADO" }>
  | Readonly<{ tipo: "ERROR"; codigo: string }>;

/** Código corto y seguro: nunca el mensaje de la excepción, que podría traer URLs o tokens. */
function codigoSeguro(error: unknown): string {
  if (error && typeof error === "object") {
    const { code, status, name } = error as { code?: unknown; status?: unknown; name?: unknown };
    if (typeof code === "string" && /^[A-Z0-9_]{1,60}$/.test(code)) {
      return typeof status === "number" ? `${code}:${status}` : code;
    }
    if (typeof name === "string" && /^[A-Za-z0-9_]{1,60}$/.test(name)) return name;
  }
  return "ERROR_DESCONOCIDO";
}

/** Sin encuentro vinculado no hay horario programado: se usa el rango realmente observado. */
function ventanaObservada(sesiones: readonly SesionObservadaZoom[]): VentanaAsistenciaZoom | null {
  const validas = sesiones.filter((s) => s.salidaAt.getTime() > s.entradaAt.getTime());
  if (validas.length === 0) return null;
  return {
    inicioAt: new Date(Math.min(...validas.map((s) => s.entradaAt.getTime()))),
    finAt: new Date(Math.max(...validas.map((s) => s.salidaAt.getTime())))
  };
}

/**
 * Obtiene el reporte de participantes de una ocurrencia y lo guarda primero en base de datos.
 * No usa Workspace ni toca la asistencia de Meet; un error o un 404 nunca borran lo ya guardado.
 */
export async function sincronizarAsistenciaZoomUseCase(
  deps: SincronizarAsistenciaZoomDeps,
  ocurrenciaId: string
): Promise<ResultadoAsistenciaZoom> {
  const ocurrencia = await deps.sync.cargarOcurrencia(ocurrenciaId);
  if (!ocurrencia) return { tipo: "ERROR", codigo: "OCURRENCIA_NO_ENCONTRADA" };

  const reporte = await deps.provider.obtenerSesiones(ocurrencia.uuid).catch((error: unknown) => ({ error }));
  if ("error" in reporte) {
    const codigo = codigoSeguro(reporte.error);
    await deps.sync.marcarEstadoReporte(ocurrenciaId, "ERROR", codigo);
    return { tipo: "ERROR", codigo };
  }
  if (reporte.estado === "NO_DISPONIBLE") {
    await deps.sync.marcarEstadoReporte(ocurrenciaId, "NO_DISPONIBLE", null);
    return { tipo: "PENDIENTE", estadoReporte: "NO_DISPONIBLE" };
  }
  if (reporte.estado === "VACIO") {
    await deps.sync.marcarEstadoReporte(ocurrenciaId, "VACIO", null);
    return { tipo: "OK", estadoReporte: "VACIO" };
  }

  // El reporte no informa roles. Solo se afirma lo comprobable: la sesión cuyo userId coincide con el del
  // anfitrión de la ocurrencia es HOST. Los co-anfitriones no se infieren (quedan sin rol, como hasta ahora).
  const nuevas = reporte.sesiones.map((s) =>
    s.rol === null && s.userId !== null && s.userId === ocurrencia.anfitrionZoomId ? { ...s, rol: "HOST" as const } : s
  );
  const ventanaProgramada = ocurrencia.inicioProgramadoAt && ocurrencia.finProgramadoAt
    ? { inicioAt: ocurrencia.inicioProgramadoAt, finAt: ocurrencia.finProgramadoAt }
    : null;

  // El resumen lo calcula el repositorio DENTRO de su transacción, serializada por encuentro: así nunca se
  // consolida con una lectura previa y obsoleta de las sesiones de otras ocurrencias del mismo encuentro.
  const guardado = await deps.repo.guardarSesionesYConsolidar(
    ocurrenciaId,
    {
      uuid: ocurrencia.uuid,
      eventoProveedorId: ocurrencia.eventoProveedorId,
      inicioProgramadoAt: ocurrencia.inicioProgramadoAt,
      finProgramadoAt: ocurrencia.finProgramadoAt
    },
    nuevas,
    (persistidas) => {
      // Sobre todo lo persistido del ámbito más lo recién observado, sin duplicar sesiones.
      const claves = new Set(nuevas.map((s) => s.claveSesion));
      const grupos = [
        ...persistidas.map((g) => g.ocurrenciaId === ocurrenciaId
          ? { ocurrenciaId: g.ocurrenciaId, sesiones: [...g.sesiones.filter((s) => !claves.has(s.claveSesion)), ...nuevas] }
          : g),
        ...(persistidas.some((g) => g.ocurrenciaId === ocurrenciaId) ? [] : [{ ocurrenciaId, sesiones: nuevas }])
      ];
      const ventana = ventanaProgramada ?? ventanaObservada(grupos.flatMap((g) => g.sesiones));
      if (!ventana) return null;
      // Todas las ocurrencias de un encuentro comparten su horario; la unión evita sumar solapes entre ejecuciones.
      return consolidarAsistenciaOcurrenciasZoom(grupos.map((g) => ({ sesiones: g.sesiones, ventana })));
    }
  );
  if (guardado.tipo === "SIN_VENTANA") {
    await deps.sync.marcarEstadoReporte(ocurrenciaId, "VACIO", null);
    return { tipo: "OK", estadoReporte: "VACIO" };
  }
  if (guardado.tipo === "REPROGRAMADO") return { tipo: "CONFLICTO", motivo: "REPROGRAMADO" };
  if (guardado.tipo === "OCURRENCIA_NO_ENCONTRADA") return { tipo: "ERROR", codigo: "OCURRENCIA_NO_ENCONTRADA" };

  await deps.sync.marcarEstadoReporte(ocurrenciaId, "DISPONIBLE", null);
  return { tipo: "OK", estadoReporte: "DISPONIBLE", participantes: guardado.registrosCreados + guardado.registrosActualizados, sesionesNuevas: guardado.sesionesNuevas };
}
