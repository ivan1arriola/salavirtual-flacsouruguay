/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from "vitest";
import { sincronizarAsistenciaZoomUseCase } from "../src/modules/archivos/application/sincronizar-asistencia-zoom.use-case";
import type { SesionObservadaZoom } from "../src/modules/archivos/domain";

const t = (hhmm: string) => new Date(`2026-11-09T${hhmm}:00Z`);
const OCURRENCIA = {
  ocurrenciaId: "o1",
  uuid: "u1",
  anfitrionZoomId: "host-1",
  eventoProveedorId: "e1",
  inicioProgramadoAt: t("10:00"),
  finProgramadoAt: t("11:00")
};
const ses = (clave: string, entra: string, sale: string, participanteId = "p1"): SesionObservadaZoom => ({
  claveSesion: clave,
  participanteId,
  userId: "u",
  nombre: "Ana",
  email: null,
  entradaAt: t(entra),
  salidaAt: t(sale),
  status: "in_meeting",
  rol: null
});

function crear(
  opciones: { ocurrencia?: any; reporte?: any; error?: Error; guardado?: any; persistidas?: any[] } = {}
) {
  const ocurrencia = opciones.ocurrencia === undefined ? OCURRENCIA : opciones.ocurrencia;
  const sync = {
    cargarOcurrencia: vi.fn(async () => ocurrencia),
    listarSesionesDelAmbito: vi.fn(
      async () => opciones.persistidas ?? [{ ocurrenciaId: "o1", sesiones: [ses("c1", "10:00", "10:30")] }]
    ),
    marcarEstadoReporte: vi.fn(async () => undefined)
  };
  // El repositorio real calcula el resumen DENTRO de su transacción, con las sesiones del ámbito ya bloqueadas.
  const capturado: { resumen: any[] | null } = { resumen: null };
  const repo = {
    guardarSesionesYConsolidar: vi.fn(
      async (_id: string, _v: unknown, _s: unknown, consolidar: (a: any[]) => any[] | null) => {
        capturado.resumen = consolidar(
          opciones.persistidas ?? [{ ocurrenciaId: "o1", sesiones: [ses("c1", "10:00", "10:30")] }]
        );
        if (capturado.resumen === null) {
          return { tipo: "SIN_VENTANA" };
        }
        return (
          opciones.guardado ?? {
            tipo: "GUARDADO",
            sesionesNuevas: 1,
            registrosCreados: 1,
            registrosActualizados: 0
          }
        );
      }
    )
  };
  const provider = {
    obtenerSesiones: vi.fn(async () => {
      if (opciones.error) {
        throw opciones.error;
      }
      return opciones.reporte ?? { estado: "DISPONIBLE", sesiones: [ses("c1", "10:00", "10:30")] };
    })
  };
  return {
    sync,
    repo,
    provider,
    capturado,
    ejecutar: () => sincronizarAsistenciaZoomUseCase({ sync, repo, provider } as any, "o1")
  };
}

describe("sincronizarAsistenciaZoomUseCase", () => {
  it("reporte disponible: guarda en base sin requerir Workspace y marca DISPONIBLE", async () => {
    const { repo, sync, capturado, ejecutar } = crear();
    const r = await ejecutar();
    expect(r).toMatchObject({ tipo: "OK", estadoReporte: "DISPONIBLE" });
    expect(repo.guardarSesionesYConsolidar).toHaveBeenCalledTimes(1);
    const [id, version, sesiones] = repo.guardarSesionesYConsolidar.mock.calls[0] as any[];
    const resumen = capturado.resumen!;
    expect(id).toBe("o1");
    expect(version).toEqual({
      uuid: "u1",
      eventoProveedorId: "e1",
      inicioProgramadoAt: t("10:00"),
      finProgramadoAt: t("11:00")
    });
    expect(sesiones).toHaveLength(1);
    expect(resumen[0]).toMatchObject({ claveParticipante: "id:p1", minutos: 30, porcentaje: 50 });
    expect(sync.marcarEstadoReporte).toHaveBeenCalledWith("o1", "DISPONIBLE", null);
  });

  it("reporte ausente (404) es PENDIENTE: no escribe sesiones ni registros", async () => {
    const { repo, sync, ejecutar } = crear({ reporte: { estado: "NO_DISPONIBLE" } });
    expect(await ejecutar()).toEqual({ tipo: "PENDIENTE", estadoReporte: "NO_DISPONIBLE" });
    expect(repo.guardarSesionesYConsolidar).not.toHaveBeenCalled();
    expect(sync.marcarEstadoReporte).toHaveBeenCalledWith("o1", "NO_DISPONIBLE", null);
  });

  it("reporte vacío es OK/VACIO y distinto de ausente: no borra nada", async () => {
    const { repo, ejecutar } = crear({ reporte: { estado: "VACIO" } });
    expect(await ejecutar()).toEqual({ tipo: "OK", estadoReporte: "VACIO" });
    expect(repo.guardarSesionesYConsolidar).not.toHaveBeenCalled();
  });

  it("reporte parcial o error de Zoom: ERROR saneado, estado ERROR y nada escrito", async () => {
    const { repo, sync, ejecutar } = crear({ error: new Error("https://api.zoom.us/x?token=SECRETO") });
    const r = await ejecutar();
    expect(r).toMatchObject({ tipo: "ERROR" });
    expect(JSON.stringify(r)).not.toMatch(/SECRETO|https?:/);
    expect(repo.guardarSesionesYConsolidar).not.toHaveBeenCalled();
    expect(sync.marcarEstadoReporte).toHaveBeenCalledWith("o1", "ERROR", expect.any(String));
    expect(String((sync.marcarEstadoReporte.mock.calls[0] as any[])[2])).not.toMatch(/SECRETO|https?:/);
  });

  it("reprogramación concurrente: CONFLICTO y no se marca como disponible", async () => {
    const { sync, ejecutar } = crear({ guardado: { tipo: "REPROGRAMADO" } });
    expect(await ejecutar()).toEqual({ tipo: "CONFLICTO", motivo: "REPROGRAMADO" });
    expect(sync.marcarEstadoReporte).not.toHaveBeenCalledWith("o1", "DISPONIBLE", null);
  });

  it("ocurrencia sin encuentro vinculado: calcula sobre el horario real observado, sin ventana programada", async () => {
    const { capturado, ejecutar } = crear({
      ocurrencia: { ...OCURRENCIA, eventoProveedorId: null, inicioProgramadoAt: null, finProgramadoAt: null },
      persistidas: [
        { ocurrenciaId: "o1", sesiones: [ses("c1", "10:00", "10:30"), ses("c2", "10:20", "11:00")] }
      ]
    });
    await ejecutar();
    const resumen = capturado.resumen!;
    expect(resumen[0]).toMatchObject({ minutos: 60, porcentaje: 100 });
  });

  it("dos ejecuciones legítimas dentro de una misma clase se unen sin sumar el solapamiento", async () => {
    const { capturado, ejecutar } = crear({
      persistidas: [
        { ocurrenciaId: "o1", sesiones: [ses("c1", "10:00", "10:40")] },
        { ocurrenciaId: "o2", sesiones: [ses("c2", "10:30", "11:00")] }
      ]
    });
    await ejecutar();
    const resumen = capturado.resumen!;
    expect(resumen).toHaveLength(1);
    expect(resumen[0]).toMatchObject({ minutos: 60, sesiones: 2 });
  });

  it("el resumen se calcula con las sesiones que entrega el repositorio bajo bloqueo, no con una lectura previa fuera de la transacción", async () => {
    const { sync, capturado, ejecutar } = crear({
      // Simula la sincronización concurrente de otra ocurrencia del mismo encuentro ya confirmada.
      persistidas: [
        { ocurrenciaId: "o1", sesiones: [ses("c1", "10:00", "10:20")] },
        { ocurrenciaId: "o2", sesiones: [ses("c9", "10:30", "10:50")] }
      ]
    });
    await ejecutar();
    expect(sync.listarSesionesDelAmbito).not.toHaveBeenCalled();
    // c1 (del reporte, 10:00-10:30) reemplaza a la persistida; c9 (otra ocurrencia, 10:30-10:50) se suma: 50 min.
    expect(capturado.resumen![0]).toMatchObject({ minutos: 50, sesiones: 2 });
  });

  it("sin ventana programada ni sesiones válidas: VACIO y no se guarda nada", async () => {
    const { sync, ejecutar } = crear({
      ocurrencia: { ...OCURRENCIA, eventoProveedorId: null, inicioProgramadoAt: null, finProgramadoAt: null },
      persistidas: [{ ocurrenciaId: "o1", sesiones: [] }],
      reporte: { estado: "DISPONIBLE", sesiones: [] }
    });
    expect(await ejecutar()).toEqual({ tipo: "OK", estadoReporte: "VACIO" });
    expect(sync.marcarEstadoReporte).toHaveBeenCalledWith("o1", "VACIO", null);
  });

  it("la sesión cuyo userId es el del anfitrión de la ocurrencia se guarda como HOST; las demás no cambian", async () => {
    const delAnfitrion = { ...ses("c1", "10:00", "10:30", "p1"), userId: "host-1" };
    const otra = { ...ses("c2", "10:05", "10:25", "p2"), userId: "otro-usuario" };
    const anonima = { ...ses("c3", "10:10", "10:20", "p3"), userId: null };
    const { repo, ejecutar } = crear({
      reporte: { estado: "DISPONIBLE", sesiones: [delAnfitrion, otra, anonima] }
    });
    await ejecutar();
    const guardadas = (repo.guardarSesionesYConsolidar.mock.calls[0] as any[])[2] as SesionObservadaZoom[];
    expect(guardadas.map((x) => [x.claveSesion, x.rol])).toEqual([
      ["c1", "HOST"],
      ["c2", null],
      ["c3", null]
    ]);
  });

  it("ocurrencia inexistente: ERROR sin llamar a Zoom", async () => {
    const { provider, ejecutar } = crear({ ocurrencia: null });
    expect(await ejecutar()).toEqual({ tipo: "ERROR", codigo: "OCURRENCIA_NO_ENCONTRADA" });
    expect(provider.obtenerSesiones).not.toHaveBeenCalled();
  });
});
