// @ts-nocheck
import { describe, expect, it, vi } from "vitest";
import {
  descartarOperacionPendiente,
  descartarOperacionesNoBloqueantesLote,
  reclasificarOperacionesPendientes
} from "../src/modules/meet/operaciones-integracion.service";

describe("operaciones-integracion.service", () => {
  it("descarta operacion pendiente individual y sincroniza si tiene Meet", async () => {
    const state = {
      id: "ev-1",
      joinUrl: "https://meet.google.com/abc-defg-hij",
      codigoReunion: "abc-defg-hij",
      operacionPendiente: "CONFIGURAR_MEET",
      estadoIntegracion: "ERROR",
      instancia: { solicitudSalaId: "req-1", estado: "PROGRAMADA" }
    };

    const db = {
      $transaction: async (fn: any) => fn(db),
      eventoProveedor: {
        findUnique: vi.fn(async () => state),
        update: vi.fn(async ({ data }: any) => {
          Object.assign(state, data);
          return state;
        })
      },
      instanciaSala: {
        findMany: vi.fn(async () => [{
          inicioProgramadoAt: new Date(),
          finProgramadoAt: new Date(),
          requiereAsistenciaTecnica: false,
          requiereGrabacion: false,
          eventosProveedor: [{ estadoIntegracion: "SINCRONIZADA" }]
        }])
      },
      solicitudSala: {
        update: vi.fn(async () => ({}))
      }
    };

    const res = await descartarOperacionPendiente(db as any, "ev-1");
    expect(res.descartada).toBe(true);
    expect(state.operacionPendiente).toBeNull();
    expect(state.estadoIntegracion).toBe("SINCRONIZADA");
    expect(state.errorIntegracion).toBeNull();
  });

  it("descarta operaciones en lote que ya tienen Meet", async () => {
    const candidates = [
      { id: "ev-1", instancia: { solicitudSalaId: "req-1", estado: "PROGRAMADA" } },
      { id: "ev-2", instancia: { solicitudSalaId: "req-2", estado: "PROGRAMADA" } }
    ];
    const updatedIds: string[] = [];

    const db = {
      $transaction: async (fn: any) => fn(db),
      eventoProveedor: {
        findMany: vi.fn(async () => candidates),
        updateMany: vi.fn(async ({ where }: any) => {
          updatedIds.push(...where.id.in);
          return { count: where.id.in.length };
        })
      },
      instanciaSala: {
        findMany: vi.fn(async () => [{
          inicioProgramadoAt: new Date(),
          finProgramadoAt: new Date(),
          requiereAsistenciaTecnica: false,
          requiereGrabacion: false,
          eventosProveedor: [{ estadoIntegracion: "SINCRONIZADA" }]
        }])
      },
      solicitudSala: {
        update: vi.fn(async () => ({}))
      }
    };

    const res = await descartarOperacionesNoBloqueantesLote(db as any);
    expect(res.totalDescartadas).toBe(2);
    expect(updatedIds).toEqual(["ev-1", "ev-2"]);
  });

  it("reclasifica PROVISIONAR a CONFIGURAR_MEET si ya existe enlace Meet", async () => {
    let updatedPayload: any = null;
    const db = {
      eventoProveedor: {
        updateMany: vi.fn(async ({ data }: any) => {
          updatedPayload = data;
          return { count: 5 };
        })
      }
    };

    const res = await reclasificarOperacionesPendientes(db as any);
    expect(res.totalReclasificadas).toBe(5);
    expect(updatedPayload.operacionPendiente).toBe("CONFIGURAR_MEET");
  });
});
