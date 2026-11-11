import { describe, expect, it, vi } from "vitest";
import {
  crearRecuperacionZoom,
  procesarPaginaRecuperacionZoom,
  vincularOcurrenciaZoom,
  type AnfitrionInventarioZoom
} from "../src/modules/archivos/application";
import type {
  AvanceBarridoZoom,
  BarridoZoom,
  BarridoZoomRepositoryPort,
  FalloBarridoZoom,
  LeaseBarridoZoom,
  NuevoBarridoZoom,
  ZoomArchivoRepositoryPort
} from "../src/modules/archivos/ports";
import type { ReferenciaOcurrenciaZoom, ResultadoPagina } from "../src/modules/archivos/domain";

const ADMIN = { id: "u1", rol: "ADMINISTRACION" } as const;
const DOCENTE = { id: "u2", rol: "DOCENTE" } as const;
const AHORA = new Date("2026-11-10T12:00:00Z");
const A1: AnfitrionInventarioZoom = { cuentaZoomId: "c", anfitrionZoomId: "h1", cuentaProveedorId: "p1" };
const A2: AnfitrionInventarioZoom = { cuentaZoomId: "c", anfitrionZoomId: "h2", cuentaProveedorId: null };

function ocurrencia(uuid: string, host = "h1"): ReferenciaOcurrenciaZoom {
  return { cuentaZoomId: "c", uuid, meetingId: "m", anfitrionZoomId: host, inicioRealAt: new Date("2026-01-15T10:00:00Z"), titulo: "t" };
}

/** Repositorio de barridos en memoria con la misma semántica de lease por versión. */
function repoBarridos(): BarridoZoomRepositoryPort & { estado: () => BarridoZoom; fallos: FalloBarridoZoom[] } {
  let b: BarridoZoom | null = null;
  let version = 0;
  const fallos: FalloBarridoZoom[] = [];
  const vigente = (l: LeaseBarridoZoom) => b !== null && l.version === version;
  return {
    fallos,
    estado: () => b!,
    async crear(n: NuevoBarridoZoom) {
      b = {
        id: "b1", cuentaZoomId: n.cuentaZoomId, anfitriones: n.anfitriones, desde: n.desde, hasta: n.hasta,
        posicion: { anfitrionIndice: 0, ventanaDesde: null, cursor: null }, estado: "PENDIENTE",
        paginasProcesadas: 0, ocurrenciasEncontradas: 0, intentos: 0, errorCodigo: null, completadoAt: null
      };
      return { id: "b1" };
    },
    async obtener() { return b; },
    async reclamar(_id, ahora, ms) {
      if (!b || b.estado === "COMPLETADO" || b.estado === "REQUIERE_REVISION" || b.estado === "CANCELADO") return null;
      version++;
      b = { ...b, estado: "EN_CURSO" };
      return { lease: { barridoId: "b1", version, venceAt: new Date(ahora.getTime() + ms) }, barrido: b };
    },
    async avanzar(l, av: AvanceBarridoZoom, ahora) {
      if (!vigente(l)) return false;
      b = {
        ...b!, posicion: av.siguiente ?? b!.posicion, paginasProcesadas: b!.paginasProcesadas + 1,
        ocurrenciasEncontradas: b!.ocurrenciasEncontradas + av.ocurrencias,
        estado: av.siguiente === null ? "COMPLETADO" : "PENDIENTE", completadoAt: av.siguiente === null ? ahora : null,
        errorCodigo: av.anfitrionOmitidoCodigo ?? b!.errorCodigo
      };
      return true;
    },
    async registrarFallo(l, f) {
      if (!vigente(l)) return false;
      fallos.push(f);
      const intentos = b!.intentos + 1;
      const revision = f.tipo === "REVISION" || (f.limiteIntentos != null && intentos >= f.limiteIntentos);
      b = {
        ...b!, intentos, errorCodigo: f.codigo, estado: revision ? "REQUIERE_REVISION" : "ERROR_REINTENTABLE",
        posicion: f.reiniciarCursor ? { ...b!.posicion, cursor: null } : b!.posicion
      };
      return true;
    },
    async listarPendientes() { return b && ["PENDIENTE", "ERROR_REINTENTABLE", "EN_CURSO"].includes(b.estado) ? ["b1"] : []; }
  };
}

type Pagina = ResultadoPagina<ReferenciaOcurrenciaZoom> | Error;

/** Zoom falso: claves `host|desde|cursor` → página (o error). */
function origenFalso(paginas: Record<string, Pagina>) {
  const llamadas: string[] = [];
  return {
    llamadas,
    async listarOcurrencias(a: AnfitrionInventarioZoom, v: { desde: string; hasta: string }, cursor: string | null) {
      const clave = `${a.anfitrionZoomId}|${v.desde}|${cursor ?? ""}`;
      llamadas.push(clave);
      const p = paginas[clave] ?? { elementos: [], siguiente: null };
      if (p instanceof Error) throw p;
      return p;
    },
    async obtenerInventario() { return { recursos: [], observaciones: [], procesamientoPendiente: false }; }
  };
}

function errorZoom(code: string, status: number | null, codigoZoom: number | null = null) {
  return Object.assign(new Error(code), { name: "ZoomApiError", code, status, codigoZoom });
}

const repoArchivos = () => ({ guardarInventario: vi.fn(async (o: { referencia: ReferenciaOcurrenciaZoom }) => ({ ocurrenciaId: `o-${o.referencia.uuid}`, nuevos: 0, actualizados: 0, requierenRevision: 0 })) });

describe("crearRecuperacionZoom", () => {
  const base = (over = {}) => ({
    origen: origenFalso({}), repoBarridos: repoBarridos(), cuentaZoomId: "c", ahora: () => AHORA,
    anfitriones: async () => [A1, A2], ...over
  });

  it("solo administración: otro rol no crea barrido ni consulta Zoom", async () => {
    const deps = base();
    const r = await crearRecuperacionZoom(deps, DOCENTE, { anfitrionIds: [], desde: "2026-01-01", hasta: "2026-02-01", dryRun: false });
    expect(r.tipo).toBe("PROHIBIDO");
    expect(deps.origen.llamadas).toEqual([]);
  });

  it("rechaza periodo invertido, futuro y anfitriones no configurados", async () => {
    const deps = base();
    const pedir = (x: object) => crearRecuperacionZoom(deps, ADMIN, { anfitrionIds: [], desde: "2026-01-01", hasta: "2026-02-01", dryRun: true, ...x });
    expect((await pedir({ desde: "2026-03-01", hasta: "2026-02-01" })).tipo).toBe("PETICION_INVALIDA");
    expect((await pedir({ hasta: "2026-12-31" })).tipo).toBe("PETICION_INVALIDA");
    expect((await pedir({ anfitrionIds: ["desconocido"] })).tipo).toBe("PETICION_INVALIDA");
    expect((await pedir({ desde: "ayer" })).tipo).toBe("PETICION_INVALIDA");
  });

  it("dry-run: cuenta ocurrencias y límites reales sin escribir ni crear barrido", async () => {
    const origen = origenFalso({
      "h1|2026-01-01|": { elementos: [ocurrencia("u1")], siguiente: "t2" },
      "h1|2026-01-01|t2": { elementos: [ocurrencia("u2")], siguiente: null },
      "h2|2026-01-01|": { elementos: [ocurrencia("u3", "h2")], siguiente: null }
    });
    const repo = repoBarridos();
    const crear = vi.spyOn(repo, "crear");
    const r = await crearRecuperacionZoom(base({ origen, repoBarridos: repo }), ADMIN, { anfitrionIds: [], desde: "2026-01-01", hasta: "2026-01-20", dryRun: true });
    expect(r).toMatchObject({ tipo: "DRY_RUN", anfitriones: 2, ocurrencias: 3, desde: "2026-01-01", hasta: "2026-01-20" });
    expect(crear).not.toHaveBeenCalled();
  });

  it("dry-run informa los anfitriones con error sin detener a los demás", async () => {
    const origen = origenFalso({
      "h1|2026-01-01|": errorZoom("SOLICITUD_RECHAZADA", 404, 1001),
      "h2|2026-01-01|": { elementos: [ocurrencia("u3", "h2")], siguiente: null }
    });
    const r = await crearRecuperacionZoom(base({ origen }), ADMIN, { anfitrionIds: [], desde: "2026-01-01", hasta: "2026-01-20", dryRun: true });
    expect(r).toMatchObject({ tipo: "DRY_RUN", ocurrencias: 1, errores: [{ anfitrionZoomId: "h1", codigo: "SOLICITUD_RECHAZADA:404:z1001" }] });
  });

  it("apply: crea el barrido con los anfitriones validados y el solicitante", async () => {
    const repo = repoBarridos();
    const r = await crearRecuperacionZoom(base({ repoBarridos: repo }), ADMIN, { anfitrionIds: ["h2"], desde: "2026-01-01", hasta: "2026-03-01", dryRun: false });
    expect(r).toMatchObject({ tipo: "ENCOLADA", barridoId: "b1", anfitriones: 1, ventanas: 3 });
    expect(repo.estado().anfitriones).toEqual([{ anfitrionZoomId: "h2", cuentaProveedorId: null }]);
  });
});

describe("procesarPaginaRecuperacionZoom", () => {
  async function preparar(paginas: Record<string, Pagina>, hasta = "2026-02-20", anfitriones = [A1, A2]) {
    const repo = repoBarridos();
    await repo.crear({
      cuentaZoomId: "c", solicitanteId: "u1", desde: "2026-01-01", hasta,
      anfitriones: anfitriones.map((a) => ({ anfitrionZoomId: a.anfitrionZoomId, cuentaProveedorId: a.cuentaProveedorId }))
    });
    const archivos = repoArchivos();
    const origen = origenFalso(paginas);
    const deps = { repoBarridos: repo, repoArchivos: archivos, origen, ahora: () => AHORA, leaseMs: 60_000, corteDias: 90, aleatorio: () => 0.5, limiteIntentos: 3, cuentaZoomId: "c" };
    return { repo, archivos, origen, deps };
  }

  it("recorre varias páginas, ventanas y anfitriones; guarda inventario antes de avanzar el cursor", async () => {
    const { repo, archivos, deps } = await preparar({
      "h1|2026-01-01|": { elementos: [ocurrencia("u1")], siguiente: "t2" },
      "h1|2026-01-01|t2": { elementos: [ocurrencia("u2")], siguiente: null },
      "h2|2026-01-01|": { elementos: [ocurrencia("u3", "h2")], siguiente: null }
    });
    const vistos: string[] = [];
    for (let i = 0; i < 20; i++) {
      const p = await procesarPaginaRecuperacionZoom(deps, "b1");
      vistos.push(p.tipo);
      if (p.tipo === "COMPLETADO") break;
      // Tras cada página, lo anunciado como encontrado ya está guardado.
      expect(archivos.guardarInventario.mock.calls.length).toBe(repo.estado().ocurrenciasEncontradas);
    }
    expect(vistos.at(-1)).toBe("COMPLETADO");
    expect(archivos.guardarInventario).toHaveBeenCalledTimes(3);
    expect(repo.estado()).toMatchObject({ estado: "COMPLETADO", ocurrenciasEncontradas: 3 });
  });

  it("una página vacía no detiene las ventanas siguientes (periodo de dos ventanas)", async () => {
    const { repo, archivos, deps, origen } = await preparar(
      { "h1|2026-01-29|": { elementos: [ocurrencia("u9")], siguiente: null } }, "2026-02-20", [A1]
    );
    while ((await procesarPaginaRecuperacionZoom(deps, "b1")).tipo !== "COMPLETADO") { /* avanza */ }
    expect(origen.llamadas).toEqual(["h1|2026-01-01|", "h1|2026-01-29|"]);
    expect(archivos.guardarInventario).toHaveBeenCalledTimes(1);
    expect(repo.estado().estado).toBe("COMPLETADO");
  });

  it("error en la segunda página: el cursor no avanza, se reintenta y reanuda sin repetir la primera", async () => {
    const { repo, deps, origen } = await preparar({
      "h1|2026-01-01|": { elementos: [ocurrencia("u1")], siguiente: "t2" },
      "h1|2026-01-01|t2": errorZoom("ERROR_RED", null)
    }, "2026-01-20", [A1]);
    expect((await procesarPaginaRecuperacionZoom(deps, "b1")).tipo).toBe("AVANZO");
    const fallo = await procesarPaginaRecuperacionZoom(deps, "b1");
    expect(fallo.tipo).toBe("ERROR_REINTENTABLE");
    expect(repo.estado().posicion).toEqual({ anfitrionIndice: 0, ventanaDesde: "2026-01-01", cursor: "t2" });
    expect(repo.fallos[0]).toMatchObject({ tipo: "REINTENTABLE", codigo: "ERROR_RED" });
    expect(origen.llamadas.filter((l) => l === "h1|2026-01-01|")).toHaveLength(1);
  });

  it("tras agotar los intentos pasa a REQUIERE_REVISION y deja de reclamarse", async () => {
    const { repo, deps } = await preparar({ "h1|2026-01-01|": errorZoom("ERROR_RED", null) }, "2026-01-20", [A1]);
    for (let i = 0; i < 3; i++) await procesarPaginaRecuperacionZoom(deps, "b1");
    expect(repo.estado().estado).toBe("REQUIERE_REVISION");
    expect((await procesarPaginaRecuperacionZoom(deps, "b1")).tipo).toBe("NO_DISPONIBLE");
  });

  it("anfitrión inexistente en Zoom (404:z1001) se omite y los demás se procesan", async () => {
    const { repo, deps, archivos } = await preparar({
      "h1|2026-01-01|": errorZoom("SOLICITUD_RECHAZADA", 404, 1001),
      "h2|2026-01-01|": { elementos: [ocurrencia("u3", "h2")], siguiente: null }
    }, "2026-01-20");
    let p;
    do { p = await procesarPaginaRecuperacionZoom(deps, "b1"); } while (p.tipo !== "COMPLETADO");
    expect(archivos.guardarInventario).toHaveBeenCalledTimes(1);
    expect(repo.estado().errorCodigo).toBe("SOLICITUD_RECHAZADA:404:z1001");
  });

  it("cursor vencido (400 con cursor): reinicia la ventana consumiendo un intento", async () => {
    const { repo, deps } = await preparar({
      "h1|2026-01-01|": { elementos: [ocurrencia("u1")], siguiente: "viejo" },
      "h1|2026-01-01|viejo": errorZoom("SOLICITUD_RECHAZADA", 400)
    }, "2026-01-20", [A1]);
    await procesarPaginaRecuperacionZoom(deps, "b1");
    const r = await procesarPaginaRecuperacionZoom(deps, "b1");
    expect(r.tipo).toBe("ERROR_REINTENTABLE");
    expect(repo.fallos[0]).toMatchObject({ reiniciarCursor: true });
    expect(repo.estado()).toMatchObject({ intentos: 1, posicion: { cursor: null } });
  });

  it("un cursor repetido no entra en bucle: se trata como fallo reintentable", async () => {
    const { deps, repo } = await preparar({
      "h1|2026-01-01|": { elementos: [], siguiente: "t" },
      "h1|2026-01-01|t": { elementos: [], siguiente: "t" }
    }, "2026-01-20", [A1]);
    await procesarPaginaRecuperacionZoom(deps, "b1");
    const r = await procesarPaginaRecuperacionZoom(deps, "b1");
    expect(r.tipo).toBe("ERROR_REINTENTABLE");
    expect(repo.fallos[0]!.codigo).toBe("CURSOR_REPETIDO");
  });

  it("si el inventario de una ocurrencia falla, la página se repite sin avanzar el cursor", async () => {
    const { deps, repo, archivos } = await preparar({
      "h1|2026-01-01|": { elementos: [ocurrencia("u1")], siguiente: null }
    }, "2026-01-20", [A1]);
    archivos.guardarInventario.mockRejectedValueOnce(new Error("db caída"));
    const r = await procesarPaginaRecuperacionZoom(deps, "b1");
    expect(r.tipo).toBe("ERROR_REINTENTABLE");
    expect(repo.estado().posicion.cursor).toBeNull();
    expect(repo.estado().paginasProcesadas).toBe(0);
  });

  it("un worker con lease obsoleto no confirma el avance", async () => {
    const { deps, repo } = await preparar({ "h1|2026-01-01|": { elementos: [ocurrencia("u1")], siguiente: null } }, "2026-01-20", [A1]);
    const reclamar = repo.reclamar.bind(repo);
    // Otro worker reclama justo después de que este lee la página.
    deps.origen.listarOcurrencias = async (...args) => {
      await reclamar("b1", AHORA, 60_000);
      return { elementos: [], siguiente: null, ...(args.length ? {} : {}) };
    };
    const r = await procesarPaginaRecuperacionZoom(deps, "b1");
    expect(r.tipo).toBe("LEASE_OBSOLETO");
    expect(repo.estado().paginasProcesadas).toBe(0);
  });
});

describe("vincularOcurrenciaZoom", () => {
  const repo = (resultado: unknown) => ({ vincularOcurrencia: vi.fn(async () => resultado) }) as unknown as Pick<ZoomArchivoRepositoryPort, "vincularOcurrencia">;

  it("solo administración: no llega al repositorio", async () => {
    const r = repo({ tipo: "VINCULADA", referenciasCreadas: 1 });
    expect(await vincularOcurrenciaZoom({ repo: r }, DOCENTE, "o1", "e1")).toEqual({ tipo: "PROHIBIDO" });
    expect(r.vincularOcurrencia).not.toHaveBeenCalled();
  });

  it("vincula pasando el actor y devuelve el resultado del repositorio", async () => {
    const r = repo({ tipo: "VINCULADA", referenciasCreadas: 2 });
    expect(await vincularOcurrenciaZoom({ repo: r }, ADMIN, "o1", "e1")).toEqual({ tipo: "VINCULADA", referenciasCreadas: 2 });
    expect(r.vincularOcurrencia).toHaveBeenCalledWith("o1", "e1", { id: "u1" });
  });

  it("un archivo de Drive ya referenciado por Meet se informa como conflicto, no como error 500", async () => {
    const r = { vincularOcurrencia: vi.fn(async () => { throw Object.assign(new Error("x"), { code: "P2002" }); }) } as unknown as Pick<ZoomArchivoRepositoryPort, "vincularOcurrencia">;
    expect(await vincularOcurrenciaZoom({ repo: r }, ADMIN, "o1", "e1")).toEqual({ tipo: "CONFLICTO_DRIVE" });
  });

  it("otros errores se propagan", async () => {
    const r = { vincularOcurrencia: vi.fn(async () => { throw new Error("boom"); }) } as unknown as Pick<ZoomArchivoRepositoryPort, "vincularOcurrencia">;
    await expect(vincularOcurrenciaZoom({ repo: r }, ADMIN, "o1", "e1")).rejects.toThrow("boom");
  });
});
