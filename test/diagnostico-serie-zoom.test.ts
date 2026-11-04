import { describe, expect, it } from "vitest";
import {
  diagnosticarSerieZoom,
  type EntradaDiagnosticoSerie,
  type ReunionZoomSerie,
} from "../src/modules/reuniones/diagnostico-serie-zoom.domain";
import type { EncuentroEnlaceSerie } from "../src/modules/reuniones/series-enlaces-distintos.domain";

const ahora = new Date("2026-11-04T12:00:00Z");
const encuentro = (extra: Partial<EncuentroEnlaceSerie> = {}): EncuentroEnlaceSerie => ({
  instanciaId: "i1", inicio: new Date("2026-11-10T12:00:00Z"), estado: "PROGRAMADA",
  proveedor: "ZOOM", joinUrl: "https://zoom.us/j/1", externalEventId: "1",
  cuentaProveedorId: "c1", reunionProveedorId: null, ...extra,
});
const meet = () => encuentro({ proveedor: "GOOGLE_MEET", joinUrl: "https://meet.google.com/abc" });
const reunion = (estadoCreacion = "CREADA"): ReunionZoomSerie => ({
  id: "r1", estadoCreacion, externalId: "1", joinUrl: "https://zoom.us/j/1", cuentaProveedorId: "c1",
});
const diagnostico = (extra: Partial<EntradaDiagnosticoSerie> = {}) => diagnosticarSerieZoom({
  serieClave: "serie:s1", ahora, encuentros: [], reuniones: [], avisos: [], ...extra,
});

describe("diagnosticarSerieZoom", () => {
  it("clasifica SANA con solo VER_DETALLE cuando comparte reunión y enlace", () => {
    expect(diagnostico({ encuentros: [encuentro({ reunionProveedorId: "r1" }), encuentro({ reunionProveedorId: "r1" })], reuniones: [reunion()] }))
      .toMatchObject({ serieClave: "serie:s1", clasificacion: "SANA", acciones: ["VER_DETALLE"] });
  });

  it("clasifica MIGRABLE con MIGRAR cuando todos siguen en Meet sin reunión", () => {
    expect(diagnostico({ encuentros: [meet()] })).toMatchObject({ clasificacion: "MIGRABLE", acciones: ["MIGRAR"] });
  });

  it.each(["CREADA", "CREANDO"])("prioriza MEZCLADA sobre una reunión %s y, con los encuentros Zoom ya unificados, ofrece MIGRAR", (estado) => {
    expect(diagnostico({ encuentros: [encuentro({ reunionProveedorId: "r1" }), meet()], reuniones: [reunion(estado)] }))
      .toMatchObject({ clasificacion: "MEZCLADA", acciones: ["MIGRAR", "VER_DETALLE"] });
  });

  it("una serie MEZCLADA cuyos encuentros en Zoom no comparten reunión ofrece primero UNIFICAR_ENLACE", () => {
    expect(diagnostico({ encuentros: [encuentro(), encuentro({ instanciaId: "i2", joinUrl: "https://zoom.us/j/2" }), meet()] }))
      .toMatchObject({ clasificacion: "MEZCLADA", acciones: ["UNIFICAR_ENLACE", "VER_DETALLE"] });
    expect(diagnostico({ encuentros: [encuentro(), meet()] }))
      .toMatchObject({ clasificacion: "MEZCLADA", acciones: ["UNIFICAR_ENLACE", "VER_DETALLE"] });
  });

  it("clasifica ENLACES_DISTINTOS y ofrece UNIFICAR_ENLACE y VER_DETALLE", () => {
    expect(diagnostico({ encuentros: [encuentro(), encuentro({ joinUrl: "https://zoom.us/j/2" })] }))
      .toMatchObject({ clasificacion: "ENLACES_DISTINTOS", acciones: ["UNIFICAR_ENLACE", "VER_DETALLE"] });
  });

  it.each(["PENDIENTE", "CREANDO"])("prioriza RETOMABLE sobre todos en Zoom con reunión %s", (estado) => {
    expect(diagnostico({ encuentros: [encuentro()], reuniones: [reunion(estado)] }))
      .toMatchObject({ clasificacion: "RETOMABLE", acciones: ["REANUDAR", "VER_DETALLE"] });
  });

  it("una reunión CREADA con todos en Meet es RETOMABLE para reutilizarla", () => {
    expect(diagnostico({ encuentros: [meet()], reuniones: [reunion()] }))
      .toMatchObject({ clasificacion: "RETOMABLE", acciones: ["REANUDAR", "VER_DETALLE"] });
  });

  it("sin futuros y con reunión activa es HUERFANA aunque esté CREANDO", () => {
    expect(diagnostico({ reuniones: [reunion("CREANDO")] }))
      .toMatchObject({ clasificacion: "HUERFANA", acciones: ["VER_DETALLE"], conteos: { total: 0, reunionesZoomDistintas: 1 } });
  });

  it("sin encuentros ni reuniones es SIN_FUTUROS y solo ofrece VER_DETALLE", () => {
    expect(diagnostico()).toEqual({
      serieClave: "serie:s1", clasificacion: "SIN_FUTUROS", acciones: ["VER_DETALLE"],
      conteos: { total: 0, enZoom: 0, enMeet: 0, reunionesZoomDistintas: 0, enlacesDistintos: 0 },
      avisos: { enviados: 0, pendientes: 0, conError: 0, repetidos: 0 },
    });
  });

  it("ignora cancelados, pasados y encuentros que empiezan justo ahora", () => {
    expect(diagnostico({ encuentros: [
      encuentro({ estado: "CANCELADA" }), encuentro({ inicio: new Date("2026-11-03T12:00:00Z") }),
      encuentro({ inicio: ahora }), encuentro({ estado: "EN_CURSO" }),
    ] })).toMatchObject({ clasificacion: "SIN_FUTUROS", conteos: { total: 0 } });
  });

  it("una reunión ELIMINADA no convierte la serie sin futuros en HUERFANA", () => {
    expect(diagnostico({ reuniones: [reunion("ELIMINADA")] }))
      .toMatchObject({ clasificacion: "SIN_FUTUROS", acciones: ["VER_DETALLE"], conteos: { reunionesZoomDistintas: 0 } });
  });

  it("una reunión ELIMINADA no convierte la serie Meet en RETOMABLE", () => {
    expect(diagnostico({ encuentros: [meet()], reuniones: [reunion("ELIMINADA")] }))
      .toMatchObject({ clasificacion: "MIGRABLE", acciones: ["MIGRAR"] });
  });

  it("cuenta proveedores, enlaces Zoom y reuniones distintas sin duplicar referencias", () => {
    expect(diagnostico({ encuentros: [
      encuentro({ reunionProveedorId: "r1" }), encuentro({ reunionProveedorId: "r1" }),
      encuentro({ reunionProveedorId: "r2", joinUrl: "https://zoom.us/j/2" }),
      encuentro({ joinUrl: null }), meet(), encuentro({ estado: "CANCELADA", reunionProveedorId: "r3" }),
    ], reuniones: [reunion()] }).conteos)
      .toEqual({ total: 5, enZoom: 4, enMeet: 1, reunionesZoomDistintas: 2, enlacesDistintos: 2 });
  });

  it("reutiliza la evaluación existente: una reunión compartida prevalece sobre enlaces divergentes", () => {
    expect(diagnostico({ encuentros: [
      encuentro({ reunionProveedorId: "r1" }), encuentro({ reunionProveedorId: "r1", joinUrl: "https://zoom.us/j/2" }),
    ] })).toMatchObject({ clasificacion: "SANA", acciones: ["VER_DETALLE"] });
  });

  it("detecta cuentas distintas aun si el enlace coincide", () => {
    expect(diagnostico({ encuentros: [encuentro(), encuentro({ cuentaProveedorId: "c2" })] }))
      .toMatchObject({ clasificacion: "ENLACES_DISTINTOS", acciones: ["UNIFICAR_ENLACE", "VER_DETALLE"] });
  });

  it("cuenta estados de avisos y repeticiones por correo y tipo más allá del primero", () => {
    const aviso = { email: "ana@flacso.edu.uy", tipo: "MIGRACION_SERIE", estado: "ACEPTADO" };
    expect(diagnostico({ avisos: [aviso, aviso, { ...aviso, estado: "RESERVADO" },
      { ...aviso, tipo: "CORRECCION_ENLACE", estado: "FALLIDO" },
      { ...aviso, email: "otra@flacso.edu.uy", estado: "OTRO" },
    ] }).avisos).toEqual({ enviados: 2, pendientes: 1, conError: 2, repetidos: 2 });
  });
});
