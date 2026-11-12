/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from "vitest";
import {
  escaparCeldaPlanillaZoom,
  exportacionAsistenciaZoom,
  filasResumenPlanillaZoom,
  filasSesionesPlanillaZoom,
  type RegistroPlanillaZoom
} from "../src/modules/archivos/domain/planilla-asistencia-zoom.domain";
import { generarPlanillaAsistenciaZoomUseCase } from "../src/modules/archivos/application/generar-planilla-asistencia-zoom.use-case";

const t = (hhmm: string) => new Date(`2026-11-09T${hhmm}:00Z`);
const registro = (extra: Partial<RegistroPlanillaZoom> = {}): RegistroPlanillaZoom => ({
  nombre: "Ana",
  emailObservado: "ana@gmail.com",
  emailConfirmado: null,
  primeraEntradaAt: t("13:00"),
  ultimaSalidaAt: t("13:30"),
  minutos: 30,
  porcentaje: 50,
  sesiones: 2,
  estadoConciliacion: "SIN_CONCILIAR",
  rolComprobado: null,
  ...extra
});

describe("contenido de la planilla Zoom", () => {
  it("diferencia correo observado de correo confirmado, y muestra conciliación y rol comprobado", () => {
    const [cabecera, fila] = filasResumenPlanillaZoom([
      registro({
        emailConfirmado: "ana@flacso.edu.uy",
        estadoConciliacion: "CONCILIADO",
        rolComprobado: "HOST"
      })
    ]);
    expect(cabecera).toEqual(
      expect.arrayContaining([
        "Correo informado por Zoom",
        "Correo confirmado",
        "Conciliación",
        "Rol comprobado",
        "Minutos",
        "Conexiones"
      ])
    );
    expect(fila).toEqual(
      expect.arrayContaining(["ana@gmail.com", "ana@flacso.edu.uy", "Conciliado", "HOST", 30, 50, 2])
    );
  });

  it("sin confirmar, el correo confirmado queda vacío (el observado nunca se presenta como confirmado)", () => {
    const [, fila] = filasResumenPlanillaZoom([registro()]);
    const cabecera = filasResumenPlanillaZoom([])[0]!;
    expect(fila![cabecera.indexOf("Correo confirmado")]).toBe("");
  });

  it("las sesiones originales van separadas del resumen consolidado", () => {
    const sesiones = filasSesionesPlanillaZoom([
      {
        nombre: "Ana",
        email: null,
        entradaAt: t("13:00"),
        salidaAt: t("13:10"),
        status: "in_meeting",
        participanteId: "p1"
      }
    ]);
    expect(sesiones[0]).toContain("Entrada (UTC)");
    expect(sesiones[1]).toEqual(expect.arrayContaining(["2026-11-09T13:00:00.000Z", 600, "in_meeting"]));
    expect(filasResumenPlanillaZoom([registro()])[0]).not.toContain("Entrada (UTC)");
  });

  it("escapa fórmulas en nombres y correos externos (Sheets y CSV)", () => {
    for (const peligroso of ['=HYPERLINK("http://x")', "+1+1", "-2", "@SUM(A1)", "\tcmd", "  =1+1"]) {
      expect(escaparCeldaPlanillaZoom(peligroso).startsWith("'")).toBe(true);
    }
    expect(escaparCeldaPlanillaZoom("Ana Pérez")).toBe("Ana Pérez");
    const [, fila] = filasResumenPlanillaZoom([registro({ nombre: "=1+1", emailObservado: "@x" })]);
    expect(fila![0]).toBe("'=1+1");
    expect(fila![1]).toBe("'@x");
  });

  it("la exportación expone la fuente zoom con el conjunto pedido", () => {
    const r = exportacionAsistenciaZoom("resumen", [registro()], []);
    expect(r.fuente).toBe("zoom");
    expect(r.columnas).toContain("Minutos");
    expect(r.registros).toHaveLength(1);
    expect(exportacionAsistenciaZoom("sesiones", [registro()], []).registros).toHaveLength(0);
  });
});

describe("generarPlanillaAsistenciaZoomUseCase", () => {
  function crear(opciones: { datos?: any; error?: Error } = {}) {
    const datos =
      opciones.datos === undefined
        ? { titulo: "Clase", carpetaId: "carpeta", marcador: "m1", registros: [registro()], sesiones: [] }
        : opciones.datos;
    const lectura = { cargarDatosPlanilla: vi.fn(async () => datos) };
    const planillas = {
      crearOActualizar: vi.fn(async () => {
        if (opciones.error) {
          throw opciones.error;
        }
        return { webViewUrl: "https://docs.google.com/spreadsheets/d/x", creada: true };
      })
    };
    return {
      lectura,
      planillas,
      ejecutar: () => generarPlanillaAsistenciaZoomUseCase({ lectura, planillas } as any, "o1")
    };
  }

  it("con registros genera la planilla en la carpeta destino con ambas pestañas", async () => {
    const { planillas, ejecutar } = crear();
    expect(await ejecutar()).toEqual({ tipo: "OK", webViewUrl: "https://docs.google.com/spreadsheets/d/x" });
    const arg = (planillas.crearOActualizar.mock.calls[0] as any[])[0];
    expect(arg).toMatchObject({ carpetaId: "carpeta", marcador: "m1" });
    expect(arg.resumen[0]).toContain("Participante");
    expect(arg.sesiones[0]).toContain("Entrada (UTC)");
  });

  it("sin registro final no crea una lista vacía: queda pendiente", async () => {
    const { planillas, ejecutar } = crear({
      datos: { titulo: "Clase", carpetaId: "c", marcador: "m", registros: [], sesiones: [] }
    });
    expect(await ejecutar()).toEqual({ tipo: "PENDIENTE" });
    expect(planillas.crearOActualizar).not.toHaveBeenCalled();
  });

  it("sin carpeta destino: PENDIENTE de carpeta, sin llamar a Drive", async () => {
    const { planillas, ejecutar } = crear({
      datos: { titulo: "Clase", carpetaId: null, marcador: "m", registros: [registro()], sesiones: [] }
    });
    expect(await ejecutar()).toEqual({ tipo: "SIN_CARPETA" });
    expect(planillas.crearOActualizar).not.toHaveBeenCalled();
  });

  it("un error de Drive no se propaga ni filtra detalles, y deja el reintento disponible", async () => {
    const { ejecutar } = crear({ error: new Error("https://x?token=SECRETO") });
    const r = await ejecutar();
    expect(r).toMatchObject({ tipo: "ERROR" });
    expect(JSON.stringify(r)).not.toMatch(/SECRETO|https?:/);
    expect(await ejecutar()).toMatchObject({ tipo: "ERROR" });
  });

  it("ocurrencia inexistente", async () => {
    expect(await crear({ datos: null }).ejecutar()).toEqual({ tipo: "ERROR", codigo: "NO_ENCONTRADA" });
  });
});
