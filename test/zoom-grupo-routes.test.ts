import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ZoomPermisosError } from "../src/integrations/zoom/zoom-grupos-client";

const state = vi.hoisted(() => ({
  session: null as null | { user: { id: string; email: string; role: string } },
  actor: null as null | { id: string; rol: string; activo: boolean },
  db: { marca: "db" },
  descifrar: (value: string) => value,
  listar: vi.fn(),
  elegir: vi.fn(),
  sincronizar: vi.fn(),
  previsualizar: vi.fn(),
}));

vi.mock("next/server", () => ({
  NextResponse: class {
    constructor(public body: unknown, public status = 200) {}
    static json(body: unknown, init?: { status?: number }) {
      return new this(body, init?.status ?? 200);
    }
  },
}));
vi.mock("@/auth", () => ({ auth: async () => state.session }));
vi.mock("@/src/lib/auth/session-actor.adapter", () => ({ resolveSessionActor: async () => state.actor }));
vi.mock("@/src/lib/db", () => ({ db: state.db }));
vi.mock("@/src/lib/config/encryption", () => ({ descifrarConfiguracion: state.descifrar }));
vi.mock("@/src/modules/configuracion/api", () => ({
  listarGruposZoom: state.listar,
  elegirGrupoZoom: state.elegir,
  sincronizarCuentasZoomConGrupo: state.sincronizar,
  previsualizarSincronizacionConGrupo: state.previsualizar,
}));

import { GET, POST, PUT } from "../app/api/v1/configuracion/zoom/grupo/route";
import * as periodica from "../app/api/v1/configuracion/zoom/grupo/sincronizar/route";

const URL_GRUPO = "http://localhost/api/v1/configuracion/zoom/grupo";
const URL_PERIODICA = "http://localhost/api/v1/configuracion/zoom/grupo/sincronizar";
const ERROR_GENERICO = "No se pudo sincronizar con el grupo de Zoom. Probá de nuevo más tarde.";
const AVISO_MASIVO = "Esta sincronización cambiaría muchas cuentas (3 de 4). Revisá la vista previa y confirmá para continuar.";
const VISTA_PREVIA = {
  ok: true,
  resumen: "1 nueva, 1 desactivada, 0 fuera del grupo con reuniones, 1 sin licencia",
  masivo: false,
  avisoMasivo: null,
  crear: ["nueva@flacso.edu.uy"],
  desactivar: ["sala02@flacso.edu.uy"],
  marcarFuera: [],
  sinLicencia: ["nueva@flacso.edu.uy"],
  pierdenLicencia: [],
};

const put = (body: unknown) => new Request(URL_GRUPO, {
  method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});
const post = (body?: unknown) => new Request(URL_GRUPO, body === undefined ? { method: "POST" } : {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});
const periodicaGet = (authorization?: string) => new Request(URL_PERIODICA, {
  headers: authorization ? { authorization } : {},
});

beforeEach(() => {
  state.session = { user: { id: "admin", email: "admin@flacso.edu.uy", role: "ADMINISTRACION" } };
  state.actor = { id: "admin", rol: "ADMINISTRACION", activo: true };
  state.listar.mockReset().mockResolvedValue([{ id: "g1", nombre: "Anfitriones", totalMiembros: 3 }]);
  state.elegir.mockReset().mockResolvedValue(undefined);
  state.sincronizar.mockReset().mockResolvedValue({ ok: true, resumen: "2 nuevas, 0 desactivadas, 0 fuera del grupo con reuniones" });
  state.previsualizar.mockReset().mockResolvedValue(VISTA_PREVIA);
  vi.stubEnv("CRON_SECRET", "secreto-cron");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("rutas del grupo de Zoom", () => {
  it("no administradores reciben 403", async () => {
    state.session = { user: { id: "doc", email: "doc@flacso.edu.uy", role: "DOCENTE" } };

    expect(((await GET()) as any).status).toBe(403);
    expect(((await PUT(put({ grupoId: "g1", grupoNombre: "Anfitriones" }))) as any).status).toBe(403);
    expect(((await POST(post())) as any).status).toBe(403);
    expect(((await POST(post({ vistaPrevia: true }))) as any).status).toBe(403);

    state.session = null;
    expect(((await GET()) as any).status).toBe(403);
    expect(((await POST(post())) as any).status).toBe(403);

    expect(state.listar).not.toHaveBeenCalled();
    expect(state.elegir).not.toHaveBeenCalled();
    expect(state.sincronizar).not.toHaveBeenCalled();
    expect(state.previsualizar).not.toHaveBeenCalled();
  });

  it("una sesión desactualizada recibe 401", async () => {
    state.actor = { id: "admin", rol: "ADMINISTRACION", activo: false };

    expect(((await PUT(put({ grupoId: "g1", grupoNombre: "Anfitriones" }))) as any).status).toBe(401);
    expect(state.elegir).not.toHaveBeenCalled();
  });

  it("GET lista los grupos de Zoom", async () => {
    const response = await GET() as any;

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ grupos: [{ id: "g1", nombre: "Anfitriones", totalMiembros: 3 }] });
    expect(state.listar).toHaveBeenCalledWith(state.db, state.descifrar);
  });

  it("GET informa la falta de permisos de Zoom tal cual con 502", async () => {
    state.listar.mockRejectedValue(new ZoomPermisosError());

    const response = await GET() as any;

    expect(response.status).toBe(502);
    expect(response.body.error).toBe(new ZoomPermisosError().message);
  });

  it("GET no expone el detalle de otros errores de Zoom", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    state.listar.mockRejectedValue(new Error("Zoom API error al listar grupos (500): token=abc"));

    const response = await GET() as any;

    expect(response.status).toBe(502);
    expect(response.body.error).not.toContain("token=abc");
    expect(response.body.error).toMatch(/grupos de Zoom/);
  });

  it("PUT guarda el grupo elegido", async () => {
    const response = await PUT(put({ grupoId: "  g1  ", grupoNombre: " Anfitriones " })) as any;

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ grupoId: "g1", grupoNombre: "Anfitriones" });
    expect(state.elegir).toHaveBeenCalledWith(state.db, { grupoId: "g1", grupoNombre: "Anfitriones", actorId: "admin" });
  });

  it("PUT rechaza un grupo vacío o inválido con 400", async () => {
    for (const body of [
      { grupoId: "   ", grupoNombre: "Anfitriones" },
      { grupoId: "g1", grupoNombre: "" },
      { grupoId: 7, grupoNombre: "Anfitriones" },
      { grupoNombre: "Anfitriones" },
      { grupoId: "g".repeat(201), grupoNombre: "Anfitriones" },
      null,
    ]) {
      const response = await PUT(put(body)) as any;

      expect(response.status).toBe(400);
      expect(typeof response.body.error).toBe("string");
      expect(response.body.error).not.toMatch(/Invalid|expected/i);
    }

    const malformado = await PUT(new Request(URL_GRUPO, { method: "PUT", body: "{no es json" })) as any;
    expect(malformado.status).toBe(400);
    expect(state.elegir).not.toHaveBeenCalled();
  });

  it("POST devuelve el resumen", async () => {
    const response = await POST(post()) as any;

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true, resumen: "2 nuevas, 0 desactivadas, 0 fuera del grupo con reuniones" });
    expect(state.sincronizar).toHaveBeenCalledWith(state.db, state.descifrar, expect.any(Date), { actorId: "admin", confirmar: false });
    expect(state.previsualizar).not.toHaveBeenCalled();
  });

  it("POST con el cuerpo vacío sincroniza sin confirmar", async () => {
    const response = await POST(new Request(URL_GRUPO, { method: "POST", body: "" })) as any;

    expect(response.status).toBe(200);
    expect(state.sincronizar).toHaveBeenCalledWith(state.db, state.descifrar, expect.any(Date), { actorId: "admin", confirmar: false });
  });

  it("POST con confirmar pasa la revisión y el actor de la sesión, nunca el del cuerpo", async () => {
    const revision = "a".repeat(64);
    const response = await POST(post({ confirmar: true, revision, actorId: "otra-persona" })) as any;

    expect(response.status).toBe(200);
    expect(state.sincronizar).toHaveBeenCalledWith(state.db, state.descifrar, expect.any(Date), { actorId: "admin", confirmar: true, revision });
  });

  it("POST con vistaPrevia devuelve lo que cambiaría y no sincroniza", async () => {
    const response = await POST(post({ vistaPrevia: true })) as any;

    expect(response.status).toBe(200);
    expect(response.body).toEqual(VISTA_PREVIA);
    expect(state.previsualizar).toHaveBeenCalledWith(state.db, state.descifrar, expect.any(Date));
    expect(state.sincronizar).not.toHaveBeenCalled();

    // Aunque también pida confirmar, una vista previa nunca escribe.
    await POST(post({ vistaPrevia: true, confirmar: true }));
    expect(state.sincronizar).not.toHaveBeenCalled();
  });

  it("POST con vistaPrevia devuelve el aviso con 200 cuando no se pudo armar", async () => {
    const aviso = { ...VISTA_PREVIA, ok: false, resumen: "El grupo de Zoom no tiene miembros.", crear: [], desactivar: [], sinLicencia: [] };
    state.previsualizar.mockResolvedValue(aviso);

    const response = await POST(post({ vistaPrevia: true })) as any;

    expect(response.status).toBe(200);
    expect(response.body).toEqual(aviso);
  });

  it("POST con vistaPrevia responde 502 con un mensaje genérico si falla de forma inesperada", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    state.previsualizar.mockRejectedValue(new Error("connect ECONNREFUSED 10.0.0.5:5432"));

    const response = await POST(post({ vistaPrevia: true })) as any;

    expect(response.status).toBe(502);
    expect(response.body).toEqual({ ok: false, resumen: ERROR_GENERICO });
  });

  it("POST rechaza opciones inválidas con 400", async () => {
    for (const body of [{ confirmar: "si" }, { vistaPrevia: 1 }, null, [true], "confirmar"]) {
      const response = await POST(post(body)) as any;

      expect(response.status).toBe(400);
      expect(typeof response.body.error).toBe("string");
      expect(response.body.error).not.toMatch(/Invalid|expected/i);
    }

    const malformado = await POST(new Request(URL_GRUPO, { method: "POST", body: "{no es json" })) as any;
    expect(malformado.status).toBe(400);
    expect(state.sincronizar).not.toHaveBeenCalled();
    expect(state.previsualizar).not.toHaveBeenCalled();
  });

  it("POST devuelve el aviso cuando la sincronización no se hizo", async () => {
    state.sincronizar.mockResolvedValue({ ok: false, resumen: "Ya hay una sincronización en curso." });

    const response = await POST(post()) as any;

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: false, resumen: "Ya hay una sincronización en curso." });
  });

  it("POST responde 502 con un mensaje genérico si la sincronización falla de forma inesperada", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    state.sincronizar.mockRejectedValue(new Error("connect ECONNREFUSED 10.0.0.5:5432"));

    const response = await POST(post()) as any;

    expect(response.status).toBe(502);
    expect(response.body).toEqual({ ok: false, resumen: ERROR_GENERICO });
  });
});

describe("sincronización periódica del grupo de Zoom", () => {
  it("el GET periódico sin secreto devuelve 401", async () => {
    expect(((await periodica.GET(periodicaGet())) as any).status).toBe(401);
    expect(((await periodica.GET(periodicaGet("Bearer otro"))) as any).status).toBe(401);
    expect(((await periodica.GET(periodicaGet("secreto-cron"))) as any).status).toBe(401);

    vi.stubEnv("CRON_SECRET", "");
    expect(((await periodica.GET(periodicaGet("Bearer "))) as any).status).toBe(401);
    expect(((await periodica.GET(periodicaGet("Bearer undefined"))) as any).status).toBe(401);

    expect(state.sincronizar).not.toHaveBeenCalled();
  });

  it("el GET periódico con secreto sincroniza", async () => {
    const response = await periodica.GET(periodicaGet("Bearer secreto-cron")) as any;

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ resumen: "2 nuevas, 0 desactivadas, 0 fuera del grupo con reuniones" });
    // Sin actor y sin confirmar: una sincronización masiva nunca se aplica sola.
    expect(state.sincronizar).toHaveBeenCalledWith(state.db, state.descifrar, expect.any(Date), { actorId: null, confirmar: false });
  });

  it("el GET periódico responde 502 cuando la sincronización necesita confirmación", async () => {
    state.sincronizar.mockResolvedValue({ ok: false, resumen: AVISO_MASIVO });

    const response = await periodica.GET(periodicaGet("Bearer secreto-cron")) as any;

    expect(response.status).toBe(502);
    expect(response.body).toEqual({ resumen: AVISO_MASIVO });
  });

  it("el GET periódico responde 502 si la sincronización no se hizo", async () => {
    state.sincronizar.mockResolvedValue({ ok: false, resumen: "El grupo de Zoom no tiene miembros." });

    const response = await periodica.GET(periodicaGet("Bearer secreto-cron")) as any;

    expect(response.status).toBe(502);
    expect(response.body).toEqual({ resumen: "El grupo de Zoom no tiene miembros." });
  });

  it("el GET periódico responde 502 con un mensaje genérico si la sincronización falla de forma inesperada", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    state.sincronizar.mockRejectedValue(new Error("connect ECONNREFUSED 10.0.0.5:5432"));

    const response = await periodica.GET(periodicaGet("Bearer secreto-cron")) as any;

    expect(response.status).toBe(502);
    expect(response.body).toEqual({ resumen: ERROR_GENERICO });
  });

  it("el GET periódico no se guarda en caché", () => {
    expect(periodica.dynamic).toBe("force-dynamic");
  });
});
