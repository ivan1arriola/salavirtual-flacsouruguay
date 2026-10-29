import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { crearPrismaConferenciasRepository } from "../src/modules/conferencias/infrastructure/prisma/prisma-conferencias-repository.adapter";
import type { ClaimInfo } from "../src/modules/conferencias/ports";

const claim: ClaimInfo = {
  event: {
    id: "evento-1",
    proveedorTipo: "GOOGLE_MEET",
    externalEventId: null,
    solicitudSalaId: "sol-1",
    organizerEmail: "sala01@flacso.edu.uy",
    request: {
      titulo: "Seminario",
      inicio: new Date("2026-10-12T12:00:00Z"),
      fin: new Date("2026-10-12T14:00:00Z"),
      timezone: "America/Montevideo",
      calendarId: "sala01@flacso.edu.uy",
      calendarEventId: "evt-1"
    }
  },
  operacion: "PROVISIONAR",
  token: "claim-actual",
  at: new Date("2026-10-12T11:00:00Z")
};

describe("conferencias: protección de escrituras bajo claim", () => {
  it("impide que un worker obsoleto persista un ID externo", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const db = { eventoProveedor: { updateMany } } as unknown as PrismaClient;
    const repository = crearPrismaConferenciasRepository({ db, descifrarConfiguracion: (v) => v });

    await expect(repository.guardarExternalEventIdTemprano(claim, "google-1", { id: "google-1" }))
      .rejects.toThrow(/claim/);

    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        reclamoIntegracionToken: "claim-actual",
        reclamoIntegracionAt: claim.at,
        operacionPendiente: "PROVISIONAR",
        externalEventId: null
      })
    }));
  });

  it("impide actualizar Meet si otro worker cambió el claim", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const db = { eventoProveedor: { updateMany } } as unknown as PrismaClient;
    const repository = crearPrismaConferenciasRepository({ db, descifrarConfiguracion: (v) => v });
    await expect(repository.persistirMeetDetectado(claim, {
      externalEventId: "google-1",
      codigoReunion: "abc-defg-hij",
      joinUrl: "https://meet.google.com/abc-defg-hij",
      payload: {}
    })).rejects.toThrow(/claim/);
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        reclamoIntegracionToken: "claim-actual",
        externalEventId: "google-1"
      })
    }));
  });
});
