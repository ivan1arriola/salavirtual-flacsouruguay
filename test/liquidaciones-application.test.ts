import { describe, expect, it, vi } from "vitest";
import {
  consultarResumenAsistentesUseCase,
  consultarTarifaVigenteUseCase,
  enviarReportesMensualesUseCase,
  generarPlanillaPagosUseCase
} from "@/src/modules/liquidaciones/application";
import type {
  CandidatoReporteMensual,
  LiquidacionesRepositoryPort,
  PlanillaPagosExporterPort,
  TarifasRepositoryPort
} from "@/src/modules/liquidaciones/ports";
import type {
  FilaPlanillaPago,
  FilaResumenAsistente
} from "@/src/modules/liquidaciones/domain";

describe("liquidaciones application", () => {
  it("consulta la tarifa vigente delegando al puerto", async () => {
    const mockTarifasRepo: TarifasRepositoryPort = {
      obtenerTarifaVigente: vi.fn().mockResolvedValue({ id: "tar-1", valorHora: 500, moneda: "UYU" })
    };

    const res = await consultarTarifaVigenteUseCase({ tarifasRepo: mockTarifasRepo }, "VIRTUAL");
    expect(res).toEqual({ id: "tar-1", valorHora: 500, moneda: "UYU" });
    expect(mockTarifasRepo.obtenerTarifaVigente).toHaveBeenCalledWith("VIRTUAL");
  });

  it("genera la planilla de pagos orquestando repositorio y exportador", async () => {
    const filas: readonly FilaPlanillaPago[] = [
      {
        asistente: "Ana Silva",
        programa: "Diploma",
        reunion: "Clase 1",
        fecha: new Date("2026-05-10T10:00:00Z"),
        minutos: 60,
        modalidad: "VIRTUAL",
        tarifaHora: 500,
        montoConfirmado: null,
        montoCalculado: 500,
        moneda: "UYU"
      }
    ];
    const mockBuffer = Buffer.from("excel-content");
    const mockLiquidacionesRepo: Partial<LiquidacionesRepositoryPort> = {
      obtenerFilasPlanillaPagos: vi.fn().mockResolvedValue(filas)
    };
    const mockExporter: PlanillaPagosExporterPort = {
      generarPlanillaPagosExcel: vi.fn().mockResolvedValue(mockBuffer)
    };

    const periodo = { clave: "2026-05", desdeMs: 1000, hastaMs: 2000 };
    const res = await generarPlanillaPagosUseCase(
      {
        liquidacionesRepo: mockLiquidacionesRepo as LiquidacionesRepositoryPort,
        exporter: mockExporter
      },
      periodo
    );

    expect(res).toBe(mockBuffer);
    expect(mockLiquidacionesRepo.obtenerFilasPlanillaPagos).toHaveBeenCalledWith(periodo);
    expect(mockExporter.generarPlanillaPagosExcel).toHaveBeenCalledWith(periodo, filas);
  });

  it("consulta el resumen de asistentes delegando al repositorio", async () => {
    const mockFilas: readonly FilaResumenAsistente[] = [
      {
        id: "a-1",
        usuarioId: "u-1",
        slug: "ana",
        nombre: "Ana",
        email: "ana@flacso.edu.uy",
        activo: true,
        reuniones: 1,
        virtuales: 1,
        hibridas: 0,
        minutos: 60,
        montos: [{ moneda: "UYU", monto: 500 }],
        sinTarifa: 0
      }
    ];
    const mockRepo: Partial<LiquidacionesRepositoryPort> = {
      obtenerResumenAsistentes: vi.fn().mockResolvedValue(mockFilas)
    };

    const periodo = { clave: "2026-05", desdeMs: 0, hastaMs: 10, anterior: "2026-04", siguiente: "2026-06" };
    const res = await consultarResumenAsistentesUseCase(
      { liquidacionesRepo: mockRepo as LiquidacionesRepositoryPort },
      periodo
    );
    expect(res).toBe(mockFilas);
  });

  it("envia reportes mensuales con reservacion idempotente y manejo de fallos", async () => {
    const candidatoConEmail: CandidatoReporteMensual = {
      asistenteTecnicoId: "asist-1",
      usuarioId: "u-1",
      nombre: "Ana Silva",
      destinatario: "ana@flacso.edu.uy",
      activo: true,
      resumen: {
        reuniones: 1,
        minutosVirtuales: 60,
        minutosHibridos: 0,
        montoVirtual: 500,
        montoHibrido: 0,
        monto: 500
      }
    };
    const candidatoSinEmail: CandidatoReporteMensual = {
      asistenteTecnicoId: "asist-2",
      usuarioId: "u-2",
      nombre: "Juan Perez",
      destinatario: null,
      activo: true,
      resumen: {
        reuniones: 0,
        minutosVirtuales: 0,
        minutosHibridos: 0,
        montoVirtual: 0,
        montoHibrido: 0,
        monto: 0
      }
    };

    const mockRepo: Partial<LiquidacionesRepositoryPort> = {
      obtenerCandidatosReporteMensual: vi.fn().mockResolvedValue([candidatoConEmail, candidatoSinEmail]),
      obtenerCopiasAdministracion: vi.fn().mockResolvedValue(["admin@flacso.edu.uy"]),
      reservarEnvioReporte: vi.fn().mockResolvedValue({ id: "reserva-1" }),
      marcarEnvioReporteExitoso: vi.fn().mockResolvedValue(undefined),
      marcarEnvioReporteError: vi.fn().mockResolvedValue(undefined)
    };

    const mockEnviarCorreo = vi.fn().mockResolvedValue({ sent: true });

    const resultado = await enviarReportesMensualesUseCase(
      {
        liquidacionesRepo: mockRepo as LiquidacionesRepositoryPort,
        enviarCorreo: mockEnviarCorreo
      },
      new Date("2026-06-01T12:00:00Z")
    );

    expect(resultado.periodo).toBe("2026-05");
    expect(resultado.asistentes).toBe(2);
    expect(resultado.enviados).toBe(1);
    expect(resultado.sinCorreo).toBe(1);
    expect(mockRepo.marcarEnvioReporteExitoso).toHaveBeenCalledWith("reserva-1", expect.any(Date));
  });
});
