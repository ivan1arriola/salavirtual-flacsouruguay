// @ts-nocheck -- fake Prisma/client dependencies keep the test focused on orchestration.
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

const serviceUrl = new URL("../src/modules/meet/live-participants.service.ts", import.meta.url);
const componentUrl = new URL("../src/components/dashboard/admin/live-participants-indicator.tsx", import.meta.url);
const routeUrl = new URL(
  "../app/api/v1/reuniones/instancias/[instanciaId]/participantes-activos/route.ts",
  import.meta.url
);

describe("participantes activos de Google Meet", () => {
  it("consulta Google con la cuenta organizadora de la instancia", async () => {
    expect(existsSync(serviceUrl)).toBe(true);

    const { obtenerParticipantesActivosInstancia } = await import(
      "../src/modules/meet/live-participants.service"
    );
    const obtenerParticipantesActivos = vi.fn(async () => ({
      conferenciaExiste: true,
      conferenceName: "conferenceRecords/actual",
      participantesActivos: [
        { nombre: "Docente Uno", user: "users/1", tipo: "CUENTA_GOOGLE" }
      ]
    }));
    const crearClient = vi.fn(() => ({ obtenerParticipantesActivos }));
    const db = {
      eventoProveedor: {
        findFirst: vi.fn(async () => ({
          codigoReunion: "abc-defg-hij",
          cuentaProveedor: { emailOrganizador: "sala04@flacso.edu.uy" },
          instancia: {
            inicioProgramadoAt: new Date("2026-09-12T13:00:00.000Z"),
            finProgramadoAt: new Date("2026-09-12T15:00:00.000Z")
          }
        }))
      },
      configuracionGoogleWorkspace: {
        findUnique: vi.fn(async () => ({
          activa: true,
          serviceAccountEmail: "service@project.iam.gserviceaccount.com",
          privateKeyCifrada: "encrypted-key"
        }))
      }
    };

    const result = await obtenerParticipantesActivosInstancia(
      {
        db,
        descifrar: (value: string) => `decrypted:${value}`,
        crearClient
      },
      "instancia-1"
    );

    expect(crearClient).toHaveBeenCalledWith({
      serviceAccountEmail: "service@project.iam.gserviceaccount.com",
      privateKey: "decrypted:encrypted-key",
      subject: "sala04@flacso.edu.uy"
    });
    expect(obtenerParticipantesActivos).toHaveBeenCalledWith(
      "abc-defg-hij",
      new Date("2026-09-12T13:00:00.000Z"),
      new Date("2026-09-12T15:00:00.000Z")
    );
    expect(result).toEqual({
      estado: "OK",
      conferenciaExiste: true,
      conferenceName: "conferenceRecords/actual",
      participantes: [
        { nombre: "Docente Uno", user: "users/1", tipo: "CUENTA_GOOGLE" }
      ]
    });
  });

  it("expone un endpoint autenticado y limita la consulta al rol de administración", () => {
    expect(existsSync(routeUrl)).toBe(true);

    const source = readFileSync(routeUrl, "utf8");
    expect(source).toContain("await auth()");
    expect(source).toContain('actor.rol !== "ADMINISTRACION"');
    expect(source).toContain("obtenerParticipantesActivosInstancia");
  });

  it("actualiza automáticamente el indicador mientras la reunión está en vivo", () => {
    expect(existsSync(componentUrl)).toBe(true);

    const source = readFileSync(componentUrl, "utf8");
    expect(source).toContain('"use client"');
    expect(source).toContain("setInterval");
    expect(source).toContain("15_000");
    expect(source).toContain("participantes-activos");
    expect(source).toContain("conectados");
  });
});
