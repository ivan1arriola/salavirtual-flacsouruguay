import { describe, expect, it, vi } from "vitest";
import { recuperarEnlaceSerie } from "../src/modules/reuniones/recuperacion-enlace-serie.service";
import { actualizarInvitadosSerie } from "../src/modules/reuniones/invitados-serie.service";

const admin = { id: "admin-1", rol: "ADMINISTRACION", activo: true } as const;
const start = new Date("2030-10-24T13:00:00Z");
const end = new Date("2030-10-24T15:00:00Z");
const event = {
  id: "provider1",
  externalEventId: "cal-1",
  proveedor: { tipo: "GOOGLE_MEET" },
  joinUrl: "https://meet.google.com/old-aaaa-bbb",
  codigoReunion: "old-aaaa-bbb",
  cuentaProveedor: { emailOrganizador: "sala02@flacso.edu.uy" },
};
const meeting = {
  id: "inst-1",
  inicioProgramadoAt: start,
  finProgramadoAt: end,
  invitados: [{ email: "invitado@ejemplo.com" }],
  cohosts: [{ cuentaGoogle: { email: "cohost@flacso.edu.uy" } }],
  cohostEmails: [{ email: "otro@flacso.edu.uy" }],
  asignaciones: [],
  eventosProveedor: [event],
};
const request = {
  id: "request1",
  titulo: "Seminario",
  serieReunionId: "serie1",
  docenteProgramaId: "dp",
  createdAt: new Date("2030-01-01T00:00:00Z"),
  docentePrograma: { programaId: "programa" },
};

function setup() {
  const db: any = {
    solicitudSala: { findUnique: vi.fn().mockResolvedValue(request) },
    instanciaSala: { findMany: vi.fn().mockResolvedValue([meeting]) },
    invitadoReunion: { deleteMany: vi.fn(), createMany: vi.fn() },
    eventoProveedor: { update: vi.fn() },
    auditoria: { create: vi.fn() },
    $executeRaw: vi.fn(),
    $transaction: vi.fn(async (fn: (tx: any) => Promise<unknown>) => fn(db)),
  };
  return db;
}

describe("gestión real de serie", () => {
  it("cambia solamente futuros, invalida verificación y notifica individualmente a cohosts e invitados", async () => {
    const db = setup();
    const enviado = vi.fn().mockResolvedValue(true);
    const patch = vi.fn().mockResolvedValue({
      location: "https://meet.google.com/abc-defg-hij",
      description: "Acceso Google Meet: https://meet.google.com/abc-defg-hij",
    });
    const result = await recuperarEnlaceSerie(
      {
        db,
        comprobarMeet: vi.fn().mockResolvedValue(undefined),
        leerCalendario: vi
          .fn()
          .mockResolvedValue({ location: event.joinUrl, description: "Viejo" }),
        reemplazarEnCalendar: patch,
        restaurarEnCalendar: vi.fn(),
        enviarCorreo: enviado,
      },
      admin,
      request.id,
      "https://meet.google.com/abc-defg-hij",
    );
    expect(result).toMatchObject({
      encuentros: 1,
      cohostsNotificados: 2,
      invitadosNotificados: 1,
      erroresCorreo: 0,
    });
    const recipients = enviado.mock.calls.map(([email]) => email);
    expect(recipients).toEqual(
      expect.arrayContaining([
        "cohost@flacso.edu.uy",
        "otro@flacso.edu.uy",
        "invitado@ejemplo.com",
      ]),
    );
    for (const [, mail] of enviado.mock.calls) {
      expect(mail.text).toContain("https://meet.google.com/abc-defg-hij");
    }
    const update = db.eventoProveedor.update.mock.calls[0][0];
    expect(update.data.joinUrl).toBe("https://meet.google.com/abc-defg-hij");
    expect(update.data.payloadUltimo.salaVirtual.cohostVerification).toBeNull();
    expect(db.instanciaSala.findMany.mock.calls[0][0].where).toMatchObject({
      estado: "PROGRAMADA",
      inicioProgramadoAt: { gt: expect.any(Date) },
    });
  });

  it("no envía correos si Calendar falla antes de guardar el nuevo link", async () => {
    const db = setup();
    const send = vi.fn();
    await expect(
      recuperarEnlaceSerie(
        {
          db,
          comprobarMeet: vi.fn(),
          leerCalendario: vi.fn().mockResolvedValue({}),
          reemplazarEnCalendar: vi.fn().mockRejectedValue(new Error("Calendar falló")),
          restaurarEnCalendar: vi.fn(),
          enviarCorreo: send,
        },
        admin,
        request.id,
        "https://meet.google.com/abc-defg-hij",
      ),
    ).rejects.toThrow("Calendar falló");
    expect(send).not.toHaveBeenCalled();
    expect(db.eventoProveedor.update).not.toHaveBeenCalled();
  });

  it("invita participantes sin conceder cohost y sin reenviar correos a los anteriores", async () => {
    const db = setup();
    const send = vi.fn().mockResolvedValue(true);
    const update = vi.fn();
    const result = await actualizarInvitadosSerie(
      {
        db,
        leerCalendario: vi.fn().mockResolvedValue({
          attendees: [{ email: "cohost@flacso.edu.uy" }, { email: "invitado@ejemplo.com" }],
        }),
        actualizarCalendario: update,
        enviarCorreo: send,
      },
      admin,
      request.id,
      { emails: ["invitado@ejemplo.com", "nuevo@ejemplo.com"] },
    );
    expect(result).toMatchObject({ invitados: 2, correosEnviados: 1 });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toBe("nuevo@ejemplo.com");
    expect(update.mock.calls[0][2].map((item: { email: string }) => item.email)).toEqual([
      "cohost@flacso.edu.uy",
      "invitado@ejemplo.com",
      "nuevo@ejemplo.com",
    ]);
    expect(db.invitadoReunion.createMany).toHaveBeenCalled();
  });
});
