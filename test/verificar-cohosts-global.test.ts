import { describe, expect, it, vi } from "vitest";

vi.mock("@/src/modules/conferencias/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/src/modules/conferencias/api")>();
  return {
    ...actual,
    normalizeCohostEmails: (values: readonly string[]) => [
      ...new Set(values.map((v) => v.trim().toLowerCase()).filter(Boolean)),
    ],
  };
});

import {
  verificarCohostsGlobalPagina,
  COHOST_VERIFICATION_PAGE_SIZE,
} from "../src/modules/configuracion/verificar-cohosts-global.service";

const start = new Date("2027-01-01T13:00:00.000Z");
function row(id: string, code: string | null, cohosts: readonly string[] = ["docente@gmail.com"]) {
  return {
    id,
    inicioProgramadoAt: start,
    solicitud: { titulo: `Encuentro ${id}` },
    cohosts: [],
    cohostEmails: cohosts.map((email) => ({ email })),
    eventosProveedor: [
      {
        codigoReunion: code,
        cuentaProveedor: { emailOrganizador: "sala02@flacso.edu.uy" },
      },
    ],
  };
}

function setup(
  meetings: ReturnType<typeof row>[],
  behavior: (email: string, code: string) => Promise<readonly { email: string; role: string }[]>,
) {
  const read = vi.fn(
    async (credential: { serviceAccountEmail: string }, subject: string, code: string) => {
      expect(subject).toBe("sala02@flacso.edu.uy");
      return behavior(credential.serviceAccountEmail, code);
    },
  );
  const queries: Array<Record<string, any>> = [];
  const db = {
    instanciaSala: {
      findMany: vi.fn(async (query: Record<string, any>) => {
        queries.push(query);
        const index = query["cursor"]
          ? meetings.findIndex((item) => item.id === query["cursor"].id) + 1
          : 0;
        return meetings.slice(index, index + query["take"]);
      }),
    },
    configuracionGoogleWorkspace: {
      findUnique: vi.fn(async () => ({
        serviceAccountEmail: "principal@example.com",
        privateKeyCifrada: "secret",
      })),
    },
  };
  return {
    queries,
    read,
    deps: {
      db: db as any,
      descifrar: (_: string) => "private-key",
      listarLegacy: async () => [
        { id: "legacy:old", serviceAccountEmail: "legacy@example.com", privateKey: "other-key" },
      ],
      leerMiembros: read,
    },
  };
}

describe("verificación global de cohosts Google Meet", () => {
  it("reintenta con Legacy tras un 403 y registra la credencial que pudo leer", async () => {
    const fixture = setup([row("m1", "bxa-hoir-jub")], async (credential) => {
      if (credential === "principal@example.com") {
        throw { response: { status: 403 } };
      }
      return [{ email: "docente@gmail.com", role: "COHOST" }];
    });
    const response = await verificarCohostsGlobalPagina(fixture.deps);
    expect(response.resultados[0]).toMatchObject({
      estado: "CONFIRMADA",
      confirmados: 1,
      origen: "LEGACY",
      intentosLegacy: 1,
    });
    expect(fixture.read).toHaveBeenCalledTimes(2);
  });

  it("no trata un fallo de lectura como ausencia confirmada ni reintenta 5xx con Legacy", async () => {
    const fixture = setup([row("m1", "bxa-hoir-jub")], async () => {
      throw { response: { status: 503 } };
    });
    const response = await verificarCohostsGlobalPagina(fixture.deps);
    expect(response.resultados[0]).toMatchObject({
      estado: "NO_VERIFICABLE",
      confirmados: 0,
      faltantes: [],
      intentosLegacy: 0,
    });
    expect(fixture.read).toHaveBeenCalledTimes(1);
  });

  it("identifica cohosts faltantes y distingue encuentros sin asignaciones", async () => {
    const fixture = setup(
      [row("m1", "space-1", ["a@gmail.com", "b@gmail.com"]), row("m2", "space-2", [])],
      async () => [{ email: "a@gmail.com", role: "COHOST" }],
    );
    const response = await verificarCohostsGlobalPagina(fixture.deps);
    expect(response.resultados[0]).toMatchObject({
      estado: "INCOMPLETA",
      confirmados: 1,
      total: 2,
      faltantes: ["b@gmail.com"],
    });
    expect(response.resultados[1].estado).toBe("SIN_COHOSTS");
    expect(fixture.read).toHaveBeenCalledTimes(1);
  });

  it("reutiliza la lectura si varios encuentros comparten espacio y organizador", async () => {
    const fixture = setup([row("m1", "same-space"), row("m2", "same-space")], async () => [
      { email: "docente@gmail.com", role: "COHOST" },
    ]);
    const response = await verificarCohostsGlobalPagina(fixture.deps);
    expect(response.resultados.map((item) => item.estado)).toEqual(["CONFIRMADA", "CONFIRMADA"]);
    expect(fixture.read).toHaveBeenCalledTimes(1);
  });

  it("recorre todas las reuniones por cursor y no escribe datos locales ni llama a mutaciones Google", async () => {
    const meetings = Array.from({ length: COHOST_VERIFICATION_PAGE_SIZE + 2 }, (_, index) =>
      row(`m${index + 1}`, `space-${index}`),
    );
    const fixture = setup(meetings, async () => [{ email: "docente@gmail.com", role: "COHOST" }]);
    const first = await verificarCohostsGlobalPagina(fixture.deps);
    expect(first.resultados).toHaveLength(COHOST_VERIFICATION_PAGE_SIZE);
    expect(first.siguienteCursor).toBe(`m${COHOST_VERIFICATION_PAGE_SIZE}`);
    const second = await verificarCohostsGlobalPagina(fixture.deps, first.siguienteCursor!);
    expect(second.resultados).toHaveLength(2);
    expect(second.siguienteCursor).toBeNull();
    expect(fixture.queries[1]).toMatchObject({ cursor: { id: first.siguienteCursor }, skip: 1 });
  });
});
