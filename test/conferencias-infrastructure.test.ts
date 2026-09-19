import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  crearGoogleConferenceProvider,
  crearPrismaConferenciasRepository,
} from "../src/modules/conferencias/infrastructure";

describe("conferencias/infrastructure", () => {
  describe("google-conference-provider.adapter", () => {
    it("crearGoogleConferenceProvider retorna un objeto con la interfaz ConferenceProvider", () => {
      const provider = crearGoogleConferenceProvider({
        serviceAccountEmail: "test@flacso.iam.gserviceaccount.com",
        privateKey: "pk-test",
        subject: "sala01@flacso.edu.uy",
      });

      expect(typeof provider.crearEventoCalendar).toBe("function");
      expect(typeof provider.obtenerEvento).toBe("function");
      expect(typeof provider.configurarEventoMeet).toBe("function");
      expect(typeof provider.cancelarEvento).toBe("function");
      expect(typeof provider.actualizarEvento).toBe("function");
      expect(typeof provider.compartirConferenciaCalendar).toBe("function");
      expect(typeof provider.configurarMeetExistente).toBe("function");
      expect(typeof provider.sincronizarCohostsExistente).toBe("function");
    });
  });

  describe("prisma-conferencias-repository.adapter", () => {
    it("obtenerCredencialesWorkspace lee de configuracionGoogleWorkspace y descifra la clave", async () => {
      const mockDb = {
        configuracionGoogleWorkspace: {
          findUnique: vi.fn().mockResolvedValue({
            id: "principal",
            activa: true,
            serviceAccountEmail: "principal@flacso.edu.uy",
            privateKeyCifrada: "cifrada:123",
          }),
        },
      } as unknown as PrismaClient;

      const descifrar = vi.fn((val: string) => `descifrada:${val}`);
      const repo = crearPrismaConferenciasRepository({
        db: mockDb,
        descifrarConfiguracion: descifrar,
      });

      const creds = await repo.obtenerCredencialesWorkspace();
      expect(creds.disponible).toBe(true);
      expect(creds.serviceAccountEmail).toBe("principal@flacso.edu.uy");
      expect(creds.privateKey).toBe("descifrada:cifrada:123");
      expect(descifrar).toHaveBeenCalledWith("cifrada:123");
    });

    it("obtenerSnapshotsEventos mapea correctamente registros de base de datos", async () => {
      const mockDb = {
        eventoProveedor: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "evt-1",
              estadoIntegracion: "PENDIENTE",
              operacionPendiente: "PROVISIONAR",
              reclamoIntegracionAt: null,
              errorIntegracion: null,
            },
          ]),
        },
      } as unknown as PrismaClient;

      const repo = crearPrismaConferenciasRepository({
        db: mockDb,
        descifrarConfiguracion: (v) => v,
      });

      const snapshots = await repo.obtenerSnapshotsEventos(["evt-1"]);
      expect(snapshots).toHaveLength(1);
      expect(snapshots[0].id).toBe("evt-1");
      expect(snapshots[0].operacionPendiente).toBe("PROVISIONAR");
    });
  });
});

