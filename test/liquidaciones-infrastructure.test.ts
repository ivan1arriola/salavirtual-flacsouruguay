import { describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import {
  crearExceljsPlanillaPagosAdapter,
  crearPrismaLiquidacionesRepositoryAdapter,
  crearPrismaTarifasRepositoryAdapter
} from "@/src/modules/liquidaciones/infrastructure";
import type { FilaPlanillaPago } from "@/src/modules/liquidaciones/domain";

describe("liquidaciones infrastructure", () => {
  describe("prisma tarifas repository adapter", () => {
    it("obtiene la tarifa vigente mapeando el decimal a number", async () => {
      const mockDb = {
        tarifaAsistenciaTecnica: {
          findFirst: vi.fn().mockResolvedValue({
            id: "tar-1",
            valorHora: { toNumber: () => 650 },
            moneda: "UYU"
          })
        }
      };

      const adapter = crearPrismaTarifasRepositoryAdapter(mockDb as any);
      const res = await adapter.obtenerTarifaVigente("HIBRIDA");

      expect(res).toEqual({ id: "tar-1", valorHora: 650, moneda: "UYU" });
      expect(mockDb.tarifaAsistenciaTecnica.findFirst).toHaveBeenCalledWith({
        where: { modalidad: "HIBRIDA" },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { id: true, valorHora: true, moneda: true }
      });
    });

    it("lanza un error claro cuando no existe tarifa configurada", async () => {
      const mockDb = {
        tarifaAsistenciaTecnica: {
          findFirst: vi.fn().mockResolvedValue(null)
        }
      };

      const adapter = crearPrismaTarifasRepositoryAdapter(mockDb as any);
      await expect(adapter.obtenerTarifaVigente("VIRTUAL")).rejects.toThrow(
        "No hay una tarifa configurada para asistencia técnica virtual."
      );
    });
  });

  describe("prisma liquidaciones repository adapter", () => {
    it("marca envio exitoso actualizando estado y fecha", async () => {
      const mockDb = {
        envioReporteMensualAsistencia: {
          update: vi.fn().mockResolvedValue({})
        }
      };

      const adapter = crearPrismaLiquidacionesRepositoryAdapter(mockDb as any);
      const ahora = new Date();
      await adapter.marcarEnvioReporteExitoso("envio-1", ahora);

      expect(mockDb.envioReporteMensualAsistencia.update).toHaveBeenCalledWith({
        where: { id: "envio-1" },
        data: { estado: "ENVIADO", enviadoAt: ahora, ultimoError: null }
      });
    });

    it("marca error truncando mensaje", async () => {
      const mockDb = {
        envioReporteMensualAsistencia: {
          update: vi.fn().mockResolvedValue({})
        }
      };

      const adapter = crearPrismaLiquidacionesRepositoryAdapter(mockDb as any);
      await adapter.marcarEnvioReporteError("envio-2", "Error al enviar");

      expect(mockDb.envioReporteMensualAsistencia.update).toHaveBeenCalledWith({
        where: { id: "envio-2" },
        data: { estado: "ERROR", ultimoError: "Error al enviar" }
      });
    });
  });

  describe("exceljs planilla pagos adapter", () => {
    it("genera un buffer de Excel valido con las hojas requeridas", async () => {
      const adapter = crearExceljsPlanillaPagosAdapter();
      const filas: readonly FilaPlanillaPago[] = [
        {
          asistente: "Carlos Rossi",
          programa: "Maestría en Educación",
          reunion: "Taller 1",
          fecha: new Date("2026-05-12T14:00:00Z"),
          minutos: 120,
          modalidad: "VIRTUAL",
          tarifaHora: 500,
          montoConfirmado: null,
          montoCalculado: 1000,
          moneda: "UYU"
        }
      ];

      const periodo = { clave: "2026-05", desdeMs: 1000, hastaMs: 2000 };
      const buffer = await adapter.generarPlanillaPagosExcel(periodo, filas);

      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(0);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer as any);
      expect(workbook.worksheets.map((s) => s.name)).toEqual([
        "Pagos por asistente",
        "Pagos por programa"
      ]);
    });
  });
});
