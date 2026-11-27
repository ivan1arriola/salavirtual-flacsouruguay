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

    it("reutiliza la conferencia Google Meet de la misma serie, incluso si pertenece a otra solicitud", async () => {
      const createdAt = new Date("2026-10-08T12:00:00Z");
      const conferenceData = {
        conferenceId: "abc-defg-hij",
        entryPoints: [{ entryPointType: "video", uri: "https://meet.google.com/abc-defg-hij" }],
      };
      const findUnique = vi.fn().mockResolvedValue({
        docenteProgramaId: "docente-programa-1",
        titulo: "Taller",
        createdAt,
      });
      const findMany = vi
        .fn()
        .mockResolvedValue([
          { payloadUltimo: { id: "evento-incompleto" } },
          { payloadUltimo: { conferenceData } },
        ]);
      const mockDb = {
        solicitudSala: { findUnique },
        eventoProveedor: { findMany },
      } as unknown as PrismaClient;

      const repo = crearPrismaConferenciasRepository({
        db: mockDb,
        descifrarConfiguracion: (v) => v,
      });
      await expect(
        repo.buscarConferenceDataCompartida("solicitud-2", "evento-actual"),
      ).resolves.toEqual(conferenceData);
      expect(findUnique).toHaveBeenCalledWith({
        where: { id: "solicitud-2" },
        select: { serieReunionId: true, docenteProgramaId: true, titulo: true, createdAt: true },
      });
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { not: "evento-actual" },
            proveedor: { tipo: "GOOGLE_MEET" },
            instancia: {
              estado: "PROGRAMADA",
              solicitud: { docenteProgramaId: "docente-programa-1", titulo: "Taller", createdAt },
            },
            estadoIntegracion: "SINCRONIZADA",
            operacionPendiente: null,
          }),
        }),
      );
    });

    it("no busca conferencias de otras series si la solicitud no existe", async () => {
      const findMany = vi.fn();
      const mockDb = {
        solicitudSala: { findUnique: vi.fn().mockResolvedValue(null) },
        eventoProveedor: { findMany },
      } as unknown as PrismaClient;
      const repo = crearPrismaConferenciasRepository({
        db: mockDb,
        descifrarConfiguracion: (v) => v,
      });
      await expect(
        repo.buscarConferenceDataCompartida("inexistente", "evento-actual"),
      ).resolves.toBeUndefined();
      expect(findMany).not.toHaveBeenCalled();
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
      expect(mockDb.eventoProveedor.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: ["evt-1"] } },
        }),
      );
    });
  });
});
