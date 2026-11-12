import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { obtenerDiagnosticosSeriesZoom } from "../src/modules/reuniones/diagnostico-serie-zoom.service";
import { claveSerieReunion } from "../src/modules/reuniones/serie-reunion.domain";

const ahora = new Date("2026-11-04T12:00:00Z");
const admin = { id: "admin", rol: "ADMINISTRACION" };
const solicitud = (serieReunionId: string | null) => ({
  serieReunionId,
  docenteProgramaId: "dp",
  titulo: "Seminario",
  createdAt: new Date("2026-10-01T00:00:00Z")
});
const evento = (tipo = "GOOGLE_MEET", n = 1) => ({
  proveedor: { tipo },
  joinUrl: tipo === "ZOOM" ? `https://zoom.us/j/${n}` : "https://meet.google.com/abc",
  externalEventId: `ext-${n}`,
  cuentaProveedorId: tipo === "ZOOM" ? "zoom-host" : "meet-host",
  reunionProveedorId: null as string | null
});
const instancia = (id: string, serie: string | null, proveedorActivoTipo: string | null = "GOOGLE_MEET") => ({
  id,
  estado: "PROGRAMADA",
  inicioProgramadoAt: new Date("2026-11-10T12:00:00Z"),
  proveedorActivoTipo,
  solicitud: solicitud(serie),
  eventosProveedor: [evento()]
});
const reunion = (serieClave: string, estadoCreacion = "CREADA") => ({
  serieClave,
  id: `r-${serieClave}`,
  estadoCreacion,
  externalId: "1",
  joinUrl: "https://zoom.us/j/1",
  cuentaProveedorId: "zoom-host"
});
const aviso = (serieClave: string, estado = "ACEPTADO") => ({
  serieClave,
  email: "ana@flacso.edu.uy",
  tipo: "MIGRACION_SERIE",
  estado
});

function base(
  instancias: ReturnType<typeof instancia>[] = [],
  reuniones: ReturnType<typeof reunion>[] = [],
  avisos: ReturnType<typeof aviso>[] = []
) {
  const escritura = vi.fn(() => {
    throw new Error("El diagnóstico no puede escribir");
  });
  const operaciones = {
    create: escritura,
    createMany: escritura,
    update: escritura,
    updateMany: escritura,
    upsert: escritura,
    delete: escritura,
    deleteMany: escritura
  };
  const db = {
    instanciaSala: { findMany: vi.fn(async () => instancias), ...operaciones },
    reunionProveedor: { findMany: vi.fn(async () => reuniones), ...operaciones },
    avisoEnlaceSerie: { findMany: vi.fn(async () => avisos), ...operaciones },
    eventoProveedor: operaciones,
    $transaction: escritura,
    $executeRaw: escritura,
    $executeRawUnsafe: escritura
  };
  return { db, cliente: db as unknown as PrismaClient, escritura };
}

describe("obtenerDiagnosticosSeriesZoom", () => {
  it.each(["DOCENTE", "ASISTENTE_TECNICO", "admin"])(
    "rechaza el rol %s con 403 antes de leer",
    async (rol) => {
      const { db, cliente, escritura } = base();
      await expect(obtenerDiagnosticosSeriesZoom(cliente, { id: "u", rol }, ahora)).rejects.toMatchObject({
        status: 403
      });
      expect(db.instanciaSala.findMany).not.toHaveBeenCalled();
      expect(db.reunionProveedor.findMany).not.toHaveBeenCalled();
      expect(db.avisoEnlaceSerie.findMany).not.toHaveBeenCalled();
      expect(escritura).not.toHaveBeenCalled();
    }
  );

  it("agrupa por la clave explícita y la clave legada vigente sin mezclar series", async () => {
    const { cliente } = base([
      instancia("i1", "s1"),
      instancia("i2", "s1"),
      instancia("i3", "s2"),
      instancia("i4", null),
      instancia("i5", null),
      { ...instancia("i6", null), solicitud: { ...solicitud(null), titulo: "Otro" } }
    ]);
    const resultado = await obtenerDiagnosticosSeriesZoom(cliente, admin, ahora);
    expect([...resultado.keys()]).toEqual([
      "serie:s1",
      "serie:s2",
      claveSerieReunion(solicitud(null)),
      claveSerieReunion({ ...solicitud(null), titulo: "Otro" })
    ]);
    expect([...resultado.values()].map(({ conteos }) => conteos.total)).toEqual([2, 1, 2, 1]);
  });

  it("hace una consulta de encuentros y una de reuniones y avisos para todas las claves", async () => {
    const { db, cliente, escritura } = base(
      [instancia("i1", "s1"), instancia("i2", "s2"), instancia("i3", "s1")],
      [reunion("serie:s1")],
      [aviso("serie:s2"), aviso("serie:s1", "RESERVADO")]
    );
    const resultado = await obtenerDiagnosticosSeriesZoom(cliente, admin, ahora);
    expect(db.instanciaSala.findMany).toHaveBeenCalledTimes(1);
    expect(db.instanciaSala.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { estado: "PROGRAMADA", inicioProgramadoAt: { gt: ahora } }
      })
    );
    expect(db.reunionProveedor.findMany).toHaveBeenCalledTimes(1);
    expect(db.reunionProveedor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { serieClave: { in: ["serie:s1", "serie:s2"] }, proveedor: { tipo: "ZOOM" } }
      })
    );
    expect(db.avisoEnlaceSerie.findMany).toHaveBeenCalledTimes(1);
    expect(db.avisoEnlaceSerie.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { serieClave: { in: ["serie:s1", "serie:s2"] } }
      })
    );
    expect(resultado.get("serie:s1")).toMatchObject({
      clasificacion: "RETOMABLE",
      acciones: ["REANUDAR", "VER_DETALLE"],
      conteos: { total: 2, reunionesZoomDistintas: 1 },
      avisos: { enviados: 0, pendientes: 1 }
    });
    expect(resultado.get("serie:s2")).toMatchObject({
      clasificacion: "MIGRABLE",
      acciones: ["MIGRAR"],
      avisos: { enviados: 1, pendientes: 0 }
    });
    expect(escritura).not.toHaveBeenCalled();
  });

  it("elige el evento del proveedor activo y conserva el fallback de las instancias legadas", async () => {
    const zoom = evento("ZOOM");
    const { cliente } = base([
      { ...instancia("i1", "s1", "ZOOM"), eventosProveedor: [evento(), zoom] },
      { ...instancia("i2", "s2", null), eventosProveedor: [zoom, evento()] },
      { ...instancia("i3", "s3", null), eventosProveedor: [zoom] }
    ]);
    const resultado = await obtenerDiagnosticosSeriesZoom(cliente, admin, ahora);
    expect(resultado.get("serie:s1")).toMatchObject({
      clasificacion: "SANA",
      conteos: { enZoom: 1, enMeet: 0, enlacesDistintos: 1 }
    });
    expect(resultado.get("serie:s2")).toMatchObject({
      clasificacion: "MIGRABLE",
      conteos: { enZoom: 0, enMeet: 1, enlacesDistintos: 0 }
    });
    expect(resultado.get("serie:s3")).toMatchObject({
      clasificacion: "SANA",
      conteos: { enZoom: 1, enMeet: 0 }
    });
  });

  it("alimenta el dominio con los enlaces y referencias de los eventos Zoom", async () => {
    const { cliente } = base([
      { ...instancia("i1", "s1", "ZOOM"), eventosProveedor: [evento("ZOOM", 1)] },
      { ...instancia("i2", "s1", "ZOOM"), eventosProveedor: [evento("ZOOM", 2)] }
    ]);
    expect((await obtenerDiagnosticosSeriesZoom(cliente, admin, ahora)).get("serie:s1")).toMatchObject({
      clasificacion: "ENLACES_DISTINTOS",
      conteos: { enlacesDistintos: 2 },
      acciones: ["UNIFICAR_ENLACE", "VER_DETALLE"]
    });
  });

  it("devuelve un mapa vacío sin escrituras aunque no haya series", async () => {
    const { cliente, escritura } = base();
    expect((await obtenerDiagnosticosSeriesZoom(cliente, admin, ahora)).size).toBe(0);
    expect(escritura).not.toHaveBeenCalled();
  });

  it("usa la fecha actual cuando no se pasa ahora", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(ahora);
    try {
      const { db, cliente } = base();
      await obtenerDiagnosticosSeriesZoom(cliente, admin);
      expect(db.instanciaSala.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { estado: "PROGRAMADA", inicioProgramadoAt: { gt: ahora } }
        })
      );
    } finally {
      vi.useRealTimers();
    }
  });

  describe("series huérfanas", () => {
    it("por defecto no las busca: solo diagnostica las series con encuentros futuros", async () => {
      const { db, cliente } = base([instancia("i1", "s1")], [reunion("serie:s1"), reunion("serie:vieja")]);
      const resultado = await obtenerDiagnosticosSeriesZoom(cliente, admin, ahora);
      expect([...resultado.keys()]).toEqual(["serie:s1"]);
      expect(db.reunionProveedor.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { serieClave: { in: ["serie:s1"] }, proveedor: { tipo: "ZOOM" } }
        })
      );
    });

    it("con incluirHuerfanas suma las series con reunión activa y sin encuentros futuros, con una sola consulta de reuniones", async () => {
      const { db, cliente, escritura } = base(
        [instancia("i1", "s1")],
        [reunion("serie:s1"), reunion("serie:vieja"), reunion("legacy:dp|x|y")],
        [aviso("serie:vieja")]
      );
      const resultado = await obtenerDiagnosticosSeriesZoom(cliente, admin, ahora, {
        incluirHuerfanas: true
      });
      expect([...resultado.keys()].sort()).toEqual(["legacy:dp|x|y", "serie:s1", "serie:vieja"]);
      expect(resultado.get("serie:vieja")).toMatchObject({
        clasificacion: "HUERFANA",
        acciones: ["VER_DETALLE"],
        conteos: { total: 0, enZoom: 0, enMeet: 0 },
        avisos: { enviados: 1 }
      });
      expect(db.reunionProveedor.findMany).toHaveBeenCalledTimes(1);
      expect(db.reunionProveedor.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            proveedor: { tipo: "ZOOM" },
            OR: [
              { serieClave: { in: ["serie:s1"] } },
              {
                serieClave: { notIn: ["serie:s1"] },
                estadoCreacion: { in: ["PENDIENTE", "CREANDO", "CREADA"] }
              }
            ]
          }
        })
      );
      expect(db.avisoEnlaceSerie.findMany).toHaveBeenCalledTimes(1);
      expect(db.avisoEnlaceSerie.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { serieClave: { in: expect.arrayContaining(["serie:s1", "serie:vieja", "legacy:dp|x|y"]) } }
        })
      );
      expect(escritura).not.toHaveBeenCalled();
    });
  });
});
