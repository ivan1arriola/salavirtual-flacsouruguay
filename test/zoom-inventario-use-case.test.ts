/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from "vitest";
import {
  barrerAnfitrionesZoomUseCase,
  diasDeBarridoZoom,
  inventariarOcurrenciasVencidasZoomUseCase,
  inventariarZoomUseCase,
  proximoInventarioZoom,
} from "../src/modules/archivos/application/inventariar-zoom.use-case";
import { procesarMantenimientoZoomUseCase } from "../src/modules/archivos/application/procesar-mantenimiento-zoom.use-case";

const AHORA = new Date("2026-11-09T12:00:00Z");
const MIN = 60_000;
const HORA = 60 * MIN;
const DIA = 24 * HORA;
const hace = (ms: number) => new Date(AHORA.getTime() - ms);
const ref = (inicio: Date, uuid = "u1") => ({
  cuentaZoomId: "c",
  uuid,
  meetingId: "1",
  anfitrionZoomId: "h1",
  inicioRealAt: inicio,
  titulo: "Clase",
});
const VACIO = { recursos: [], observaciones: [], procesamientoPendiente: false };

describe("proximoInventarioZoom (cadencia y corte)", () => {
  const p = (edad: number, pendiente = false, corteDias = 90) =>
    proximoInventarioZoom(hace(edad), AHORA, { procesamientoPendiente: pendiente, corteDias });
  it("menos de 48 h: cada 10 minutos", () =>
    expect(p(5 * HORA)?.getTime()).toBe(AHORA.getTime() + 10 * MIN));
  it("hasta 30 días: cada hora", () => expect(p(5 * DIA)?.getTime()).toBe(AHORA.getTime() + HORA));
  it("más antiguas: a diario", () => expect(p(40 * DIA)?.getTime()).toBe(AHORA.getTime() + DIA));
  it("pasado el corte se deja de reinventariar", () => expect(p(100 * DIA)).toBeNull());
  it("procesamiento pendiente en Zoom mantiene el seguimiento aun pasado el corte", () =>
    expect(p(100 * DIA, true)?.getTime()).toBe(AHORA.getTime() + DIA));
  it("pendiente reciente no se relaja", () =>
    expect(p(5 * DIA, true)?.getTime()).toBe(AHORA.getTime() + 10 * MIN));
});

describe("inventariarZoomUseCase", () => {
  it("guarda el inventario con la próxima fecha y la sala local", async () => {
    const repo: any = {
      guardarInventario: vi.fn(async () => ({
        ocurrenciaId: "o",
        nuevos: 1,
        actualizados: 0,
        requierenRevision: 0,
      })),
    };
    const origen: any = { obtenerInventario: vi.fn(async () => VACIO) };
    const r = await inventariarZoomUseCase(repo, origen, {
      referencia: ref(hace(5 * HORA)),
      cuentaProveedorId: "cp",
      ahora: AHORA,
      corteDias: 90,
    });
    expect(r.tipo).toBe("GUARDADO");
    expect(repo.guardarInventario.mock.calls[0][0]).toMatchObject({
      cuentaProveedorId: "cp",
      inventariadoAt: AHORA,
      proximoInventarioAt: new Date(AHORA.getTime() + 10 * MIN),
    });
  });

  it("404 de Zoom no se guarda como inventario vacío exitoso", async () => {
    const repo: any = { guardarInventario: vi.fn() };
    const origen: any = { obtenerInventario: vi.fn(async () => null) };
    const r = await inventariarZoomUseCase(repo, origen, {
      referencia: ref(hace(HORA)),
      cuentaProveedorId: null,
      ahora: AHORA,
      corteDias: 90,
    });
    expect(r.tipo).toBe("NO_ENCONTRADA");
    expect(repo.guardarInventario).not.toHaveBeenCalled();
  });

  it("una capacidad ausente (error de Zoom) se propaga y no escribe nada", async () => {
    const repo: any = { guardarInventario: vi.fn() };
    const origen: any = {
      obtenerInventario: vi.fn(async () => {
        throw new Error("Zoom: CAPACIDAD_PENDIENTE");
      }),
    };
    await expect(
      inventariarZoomUseCase(repo, origen, {
        referencia: ref(hace(HORA)),
        cuentaProveedorId: null,
        ahora: AHORA,
        corteDias: 90,
      }),
    ).rejects.toThrow(/CAPACIDAD/);
    expect(repo.guardarInventario).not.toHaveBeenCalled();
  });
});

describe("inventariarOcurrenciasVencidasZoomUseCase", () => {
  it("un fallo de una ocurrencia no detiene a las demás y se informa", async () => {
    const vencidas = [
      { referencia: ref(hace(HORA), "a"), cuentaProveedorId: null },
      { referencia: ref(hace(HORA), "b"), cuentaProveedorId: null },
      { referencia: ref(hace(HORA), "c"), cuentaProveedorId: null },
    ];
    const repo: any = {
      listarOcurrenciasPorInventariar: vi.fn(async () => vencidas),
      guardarInventario: vi.fn(async () => ({
        ocurrenciaId: "o",
        nuevos: 0,
        actualizados: 0,
        requierenRevision: 0,
      })),
    };
    const origen: any = {
      obtenerInventario: vi.fn(async (r: any) => {
        if (r.uuid === "b") {
          throw new Error("boom");
        }
        return VACIO;
      }),
    };
    const r = await inventariarOcurrenciasVencidasZoomUseCase(repo, origen, {
      ahora: AHORA,
      limite: 10,
      corteDias: 90,
    });
    expect(r).toMatchObject({ guardadas: 2, fallidas: 1 });
    expect(repo.listarOcurrenciasPorInventariar).toHaveBeenCalledWith(AHORA, 10);
  });
});

describe("barrerAnfitrionesZoomUseCase", () => {
  const anfitriones = [
    { cuentaZoomId: "c", anfitrionZoomId: "h1", cuentaProveedorId: "p1" },
    { cuentaZoomId: "c", anfitrionZoomId: "h2", cuentaProveedorId: "p2" },
  ];

  it("recorre todas las páginas y ventanas de cada anfitrión, incluidos los inactivos del snapshot, e inventaría cada ocurrencia", async () => {
    const paginas: Record<string, any> = {
      "h1:": { elementos: [ref(hace(HORA), "a")], siguiente: "p2" },
      "h1:p2": { elementos: [ref(hace(2 * HORA), "b")], siguiente: null },
      "h2:": { elementos: [], siguiente: null },
    };
    const origen: any = {
      listarOcurrencias: vi.fn(async (a: any, v: any, cursor: string | null) =>
        v.papelera
          ? { elementos: [], siguiente: null }
          : paginas[`${a.anfitrionZoomId}:${cursor ?? ""}`],
      ),
      obtenerInventario: vi.fn(async () => VACIO),
    };
    const repo: any = {
      guardarInventario: vi.fn(async () => ({
        ocurrenciaId: "o",
        nuevos: 0,
        actualizados: 0,
        requierenRevision: 0,
      })),
    };
    const r = await barrerAnfitrionesZoomUseCase(repo, origen, {
      anfitriones,
      ahora: AHORA,
      diasAtras: 3,
      corteDias: 90,
    });
    expect(r).toMatchObject({ ocurrencias: 2, anfitrionesConError: 0 });
    expect(repo.guardarInventario).toHaveBeenCalledTimes(2);
    // Una sola ventana de 3 días en hora de Montevideo.
    expect(origen.listarOcurrencias.mock.calls[0][1]).toEqual({
      desde: "2026-11-06",
      hasta: "2026-11-09",
    });
  });

  it("un anfitrión que ya no existe en Zoom (404:z1001) se omite sin contarlo como error y los demás se procesan", async () => {
    const inexistente = Object.assign(new Error("no existe"), {
      name: "ZoomApiError",
      code: "NO_ENCONTRADO",
      status: 404,
      codigoZoom: 1001,
    });
    const origen: any = {
      listarOcurrencias: vi.fn(async (a: any, v: any) => {
        if (a.anfitrionZoomId === "h1") {
          throw inexistente;
        }
        return { elementos: v.papelera ? [] : [ref(hace(HORA), "x")], siguiente: null };
      }),
      obtenerInventario: vi.fn(async () => VACIO),
    };
    const repo: any = {
      guardarInventario: vi.fn(async () => ({
        ocurrenciaId: "o",
        nuevos: 0,
        actualizados: 0,
        requierenRevision: 0,
      })),
    };
    const r = await barrerAnfitrionesZoomUseCase(repo, origen, {
      anfitriones,
      ahora: AHORA,
      diasAtras: 3,
      corteDias: 90,
    });
    expect(r).toMatchObject({
      ocurrencias: 1,
      anfitrionesConError: 0,
      anfitrionesInexistentes: 1,
      errores: [],
    });
  });

  it("el barrido reciente también consulta la papelera de cada ventana e inventaría lo hallado", async () => {
    const origen: any = {
      listarOcurrencias: vi.fn(async (_a: any, v: any) => ({
        elementos: v.papelera ? [ref(hace(HORA), "borrada")] : [],
        siguiente: null,
      })),
      obtenerInventario: vi.fn(async () => VACIO),
    };
    const repo: any = {
      guardarInventario: vi.fn(async () => ({
        ocurrenciaId: "o",
        nuevos: 0,
        actualizados: 0,
        requierenRevision: 0,
      })),
    };
    const r = await barrerAnfitrionesZoomUseCase(repo, origen, {
      anfitriones: [anfitriones[0]!],
      ahora: AHORA,
      diasAtras: 3,
      corteDias: 90,
    });
    expect(r).toMatchObject({ ocurrencias: 1, ocurrenciasPapelera: 1 });
    expect(repo.guardarInventario).toHaveBeenCalledTimes(1);
    expect(origen.listarOcurrencias.mock.calls.map((c: any[]) => Boolean(c[1].papelera))).toEqual([
      false,
      true,
    ]);
  });

  it("un anfitrión que falla no impide barrer al siguiente ni cierra el barrido como completo", async () => {
    const origen: any = {
      listarOcurrencias: vi.fn(async (a: any, v: any) => {
        if (a.anfitrionZoomId === "h1") {
          throw new Error("403");
        }
        return { elementos: v.papelera ? [] : [ref(hace(HORA), "z")], siguiente: null };
      }),
      obtenerInventario: vi.fn(async () => VACIO),
    };
    const repo: any = {
      guardarInventario: vi.fn(async () => ({
        ocurrenciaId: "o",
        nuevos: 0,
        actualizados: 0,
        requierenRevision: 0,
      })),
    };
    const r = await barrerAnfitrionesZoomUseCase(repo, origen, {
      anfitriones,
      ahora: AHORA,
      diasAtras: 3,
      corteDias: 90,
    });
    expect(r).toMatchObject({ ocurrencias: 1, anfitrionesConError: 1 });
  });

  it("informa el código (no el mensaje) del error de cada anfitrión para poder diagnosticar", async () => {
    const error403 = Object.assign(
      new Error(
        "Zoom: CAPACIDAD_PENDIENTE (grabaciones.listado, HTTP 403) https://secreto?token=1",
      ),
      { name: "ZoomApiError", code: "CAPACIDAD_PENDIENTE", status: 403 },
    );
    const origen: any = {
      listarOcurrencias: vi.fn(async (a: any) => {
        if (a.anfitrionZoomId === "h1") {
          throw error403;
        }
        throw new TypeError("fetch failed");
      }),
      obtenerInventario: vi.fn(),
    };
    const r = await barrerAnfitrionesZoomUseCase({} as any, origen, {
      anfitriones,
      ahora: AHORA,
      diasAtras: 3,
      corteDias: 90,
    });
    expect(r.errores).toEqual([
      { anfitrionZoomId: "h1", codigo: "CAPACIDAD_PENDIENTE:403" },
      { anfitrionZoomId: "h2", codigo: "TypeError" },
    ]);
    expect(JSON.stringify(r)).not.toContain("secreto");
  });

  it("agrega el código numérico de Zoom al código del anfitrión cuando existe", async () => {
    const rechazo = Object.assign(new Error("x"), {
      name: "ZoomApiError",
      code: "SOLICITUD_RECHAZADA",
      status: 400,
      codigoZoom: 300,
    });
    const origen: any = {
      listarOcurrencias: vi.fn(async () => {
        throw rechazo;
      }),
      obtenerInventario: vi.fn(),
    };
    const r = await barrerAnfitrionesZoomUseCase({} as any, origen, {
      anfitriones: [anfitriones[0]!],
      ahora: AHORA,
      diasAtras: 3,
      corteDias: 90,
    });
    expect(r.errores[0]).toEqual({ anfitrionZoomId: "h1", codigo: "SOLICITUD_RECHAZADA:400:z300" });
  });

  it("un barrido de más de 28 días se parte en ventanas consecutivas sin huecos", async () => {
    const origen: any = {
      listarOcurrencias: vi.fn(async () => ({ elementos: [], siguiente: null })),
      obtenerInventario: vi.fn(),
    };
    await barrerAnfitrionesZoomUseCase({} as any, origen, {
      anfitriones: [anfitriones[0]!],
      ahora: AHORA,
      diasAtras: 60,
      corteDias: 90,
    });
    // Cada ventana se consulta dos veces (activas y papelera): la continuidad se comprueba sobre las activas.
    const todas = origen.listarOcurrencias.mock.calls.map((c: any[]) => c[1]);
    const ventanas = todas.filter((v: any) => !v.papelera);
    expect(todas.length).toBe(ventanas.length * 2);
    expect(ventanas.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < ventanas.length; i++) {
      const previo = new Date(`${ventanas[i - 1].hasta}T00:00:00Z`).getTime() + DIA;
      expect(new Date(`${ventanas[i].desde}T00:00:00Z`).getTime()).toBe(previo);
    }
  });
});

describe("procesarMantenimientoZoomUseCase (equidad)", () => {
  it("el mantenimiento (inventario y asistencia) avanza aunque todos los carriles de transferencia estén ocupados", async () => {
    const control = new AbortController();
    const ciclos: string[] = [];
    const bloqueada = new Promise<void>(() => undefined); // un archivo enorme que nunca termina
    const mantenimiento = procesarMantenimientoZoomUseCase(
      {
        tareas: [
          {
            nombre: "recientes",
            ejecutar: async () => {
              ciclos.push("recientes");
            },
          },
          {
            nombre: "historico",
            ejecutar: async () => {
              ciclos.push("historico");
            },
          },
          {
            nombre: "reintentos",
            ejecutar: async () => {
              ciclos.push("reintentos");
              if (ciclos.length >= 6) {
                control.abort();
              }
            },
          },
        ],
        esperar: async () => undefined,
        intervaloMs: 1,
      },
      { signal: control.signal },
    );
    await Promise.race([Promise.all([mantenimiento, bloqueada]), mantenimiento]);
    expect(ciclos.slice(0, 3)).toEqual(["recientes", "historico", "reintentos"]);
    expect(ciclos.length).toBeGreaterThanOrEqual(6);
  });

  it("el fallo de una tarea no detiene a las otras ni al ciclo", async () => {
    const control = new AbortController();
    const hechas: string[] = [];
    const errores: string[] = [];
    await procesarMantenimientoZoomUseCase(
      {
        tareas: [
          {
            nombre: "mala",
            ejecutar: async () => {
              throw new Error("x");
            },
          },
          {
            nombre: "buena",
            ejecutar: async () => {
              hechas.push("b");
              control.abort();
            },
          },
        ],
        esperar: async () => undefined,
        intervaloMs: 1,
        alFallar: (n: string) => errores.push(n),
      },
      { signal: control.signal },
    );
    expect(hechas).toEqual(["b"]);
    expect(errores).toEqual(["mala"]);
  });
});

describe("diasDeBarridoZoom", () => {
  it("cubre desde el inicio del histórico hasta hoy, no solo los últimos días", () => {
    expect(diasDeBarridoZoom(AHORA, "2026-11-01", 3)).toBe(9);
  });
  it("nunca baja del mínimo (inicio muy reciente o fecha futura)", () => {
    expect(diasDeBarridoZoom(AHORA, "2026-11-08", 3)).toBe(3);
    expect(diasDeBarridoZoom(AHORA, "2027-01-01", 3)).toBe(3);
  });
});
