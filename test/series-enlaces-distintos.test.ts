import { describe, expect, it, vi } from "vitest";
import {
  detectarSerieClavesConEnlacesDistintos,
  detectarSeriesConEnlacesDistintos
} from "../src/modules/reuniones/series-enlaces-distintos.service";

const ahora = new Date("2026-11-03T12:00:00Z");
const dia = (n: number) => new Date(ahora.getTime() + n * 86_400_000);
const admin = { id: "a", rol: "ADMINISTRACION" };

const solicitud = (serie: string | null) => ({
  titulo: "Seminario",
  serieReunionId: serie,
  docenteProgramaId: "dp",
  createdAt: new Date("2026-10-01T00:00:00Z"),
  docentePrograma: {
    programa: { nombre: "Prog" },
    docente: { usuario: { nombres: "Ana", apellidos: "Paz" } }
  }
});
const zoom = (n: number, extra: object = {}) => ({
  joinUrl: `https://zoom.us/j/${n}`,
  externalEventId: `${n}`,
  cuentaProveedorId: "c1",
  reunionProveedorId: null,
  proveedor: { tipo: "ZOOM" },
  ...extra
});
const instancia = (n: number, serie: string | null, evento: object, extra: object = {}) => ({
  id: `i${n}`,
  estado: "PROGRAMADA",
  inicioProgramadoAt: dia(n),
  proveedorActivoTipo: "ZOOM",
  solicitud: solicitud(serie),
  eventosProveedor: [evento],
  ...extra
});
const dbCon = (instancias: object[]) =>
  ({
    instanciaSala: { findMany: vi.fn(async () => instancias) },
    solicitudSala: {
      findMany: vi.fn(async () => [
        { serieReunionId: "s1", docenteProgramaId: "dp", titulo: "Seminario", createdAt: new Date() }
      ])
    }
  }) as never;

describe("detectarSeriesConEnlacesDistintos", () => {
  it("lista la serie con tres enlaces distintos y omite la que comparte enlace, la unificada y la mixta", async () => {
    const db = dbCon([
      instancia(1, "a", zoom(1)),
      instancia(2, "a", zoom(2)),
      instancia(3, "a", zoom(3)),
      instancia(1, "b", zoom(9)),
      instancia(2, "b", zoom(9)),
      instancia(1, "c", zoom(1, { reunionProveedorId: "r" })),
      instancia(2, "c", zoom(2, { reunionProveedorId: "r" })),
      instancia(1, "d", zoom(1)),
      instancia(
        2,
        "d",
        { ...zoom(2), proveedor: { tipo: "GOOGLE_MEET" } },
        { proveedorActivoTipo: "GOOGLE_MEET" }
      )
    ]);
    const series = await detectarSeriesConEnlacesDistintos(db, admin, ahora);
    expect(series.map(({ serieClave }) => serieClave)).toEqual(["serie:a"]);
    expect(series[0]).toMatchObject({ enlacesDistintos: 3, docente: "Ana Paz", programa: "Prog" });
    expect(series[0].encuentros).toHaveLength(3);
  });

  it("agrupa una serie legada (sin serieReunionId) por docente-programa, título y creación", async () => {
    const db = dbCon([instancia(1, null, zoom(1)), instancia(2, null, zoom(2))]);
    const series = await detectarSeriesConEnlacesDistintos(db, admin, ahora);
    expect(series).toHaveLength(1);
    expect(series[0].serieClave).toContain("dp");
  });

  it("consulta solo encuentros futuros y programados", async () => {
    const db = dbCon([]) as unknown as { instanciaSala: { findMany: ReturnType<typeof vi.fn> } };
    await detectarSeriesConEnlacesDistintos(db as never, admin, ahora);
    expect(db.instanciaSala.findMany.mock.calls[0][0].where).toMatchObject({
      estado: "PROGRAMADA",
      inicioProgramadoAt: { gt: ahora }
    });
  });

  it("un usuario que no es Administración recibe Forbidden", async () => {
    await expect(
      detectarSeriesConEnlacesDistintos(dbCon([]), { id: "d", rol: "DOCENTE" }, ahora)
    ).rejects.toThrow();
  });
});

describe("detectarSerieClavesConEnlacesDistintos", () => {
  it("devuelve las claves de las series de las solicitudes dadas que necesitan corrección, sin exigir rol", async () => {
    const db = dbCon([instancia(1, "s1", zoom(1)), instancia(2, "s1", zoom(2))]);
    expect([...(await detectarSerieClavesConEnlacesDistintos(db, ["sol1"], ahora))]).toEqual(["serie:s1"]);
    expect((await detectarSerieClavesConEnlacesDistintos(db, [], ahora)).size).toBe(0);
  });
});
