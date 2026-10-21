import { describe, it, expect, vi } from "vitest";
import { clasificarAccesosPropios, procesarRecordatorios24h } from "../src/modules/reuniones/recordatorios-24h.service";
import { construirRecordatorioReunion } from "../src/modules/reuniones/recordatorio-reunion-email.domain";

const inicio = new Date("2026-10-24T13:00:00.000Z");
const ahora = new Date("2026-10-23T13:02:00.000Z"); // faltan 23h58m
const meeting = {
  id: "inst-1",
  inicioProgramadoAt: inicio,
  finProgramadoAt: new Date("2026-10-24T15:00:00.000Z"),
  inicioAsistenciaTecnicaAt: new Date("2026-10-24T12:45:00.000Z"),
  finAsistenciaTecnicaAt: new Date("2026-10-24T15:00:00.000Z"),
  modalidadOverride: null,
  requiereAsistenciaTecnica: true,
  solicitud: {
    id: "req-1",
    titulo: "Seminario de ejemplo",
    modalidad: "VIRTUAL",
    creadaPorUsuarioId: "creator",
    docentePrograma: {
      docente: { usuarioId: "teacher" },
      programa: { nombre: "Programa Género" }
    }
  },
  asignaciones: [{ asistenteTecnico: { usuarioId: "assistant", cesadoHastaProximoInicioSesion: false } }],
  eventosProveedor: [{
    codigoReunion: "abc-defg-hij",
    joinUrl: "https://meet.google.com/abc-defg-hij",
    cuentaProveedor: { emailOrganizador: "sala01@flacso.edu.uy" }
  }]
};
const users = [
  { id: "creator", nombres: "Cora", emailPrincipal: "cora@flacso.edu.uy", cuentasGoogle: [], emailAliases: [], preferenciasNotificacion: [] },
  { id: "teacher", nombres: "Ana", emailPrincipal: "ana@flacso.edu.uy", cuentasGoogle: [{ email: "ana.personal@flacso.edu.uy" }], emailAliases: [], preferenciasNotificacion: [] },
  { id: "assistant", nombres: "Juan", emailPrincipal: "juan@flacso.edu.uy", cuentasGoogle: [], emailAliases: [], preferenciasNotificacion: [] }
];

function dbFake(rows: typeof meeting[] = [meeting], prefs = users) {
  const registro = new Map<string, string>();
  let seq = 0;
  const create = vi.fn(async ({ data }: any) => {
    const key = [data.instanciaSalaId, data.usuarioId, data.inicioProgramadoAt.toISOString()].join("|");
    if (registro.has(key)) throw Object.assign(new Error("duplicate"), { code: "P2002" });
    registro.set(key, String(++seq));
    return { id: String(seq) };
  });
  const update = vi.fn(async () => ({}));
  const findMany = vi.fn(async () => rows);
  const usuarios = vi.fn(async () => prefs);
  const findUnique = vi.fn(async () => ({ estado: "PROGRAMADA", inicioProgramadoAt: inicio, solicitud: { estado: "REGISTRADA" } }));
  const notificacion = vi.fn(async () => ({}));
  return { db: {
    instanciaSala: { findMany, findUnique },
    usuario: { findMany: usuarios },
    recordatorioReunion: { create, update },
    notificacion: { create: notificacion }
  } as any, create, update, findMany, usuarios, findUnique, notificacion };
}

describe("recordatorios de reuniones 24 horas antes", () => {
  it("consulta Google Meet antes de enviar e informa cuentas verificadas por destinatario, sin copiar las ajenas", async () => {
    const mock = dbFake();
    const orden: string[] = [];
    const verificarCohosts = vi.fn(async () => {
      orden.push("verificar");
      return new Set(["ana.personal@flacso.edu.uy", "juan@flacso.edu.uy"]);
    });
    const enviarCorreo = vi.fn(async (mail: any) => {
      orden.push("enviar");
      expect(mail.html).toContain("FLACSO Uruguay");
      if (mail.to[0] === "ana@flacso.edu.uy") {
        expect(mail.html).toContain("ana.personal@flacso.edu.uy");
        expect(mail.html).not.toContain("juan@flacso.edu.uy");
      }
      if (mail.to[0] === "juan@flacso.edu.uy") {
        expect(mail.html).toContain("Monitoreo:");
        expect(mail.html).toContain("juan@flacso.edu.uy");
        expect(mail.html).not.toContain("ana.personal@flacso.edu.uy");
      }
      return { sent: true };
    });
    const run = await procesarRecordatorios24h(mock.db, { verificarCohosts, enviarCorreo }, ahora);
    expect(run).toMatchObject({ reuniones: 1, enviados: 3, errores: 0 });
    expect(verificarCohosts).toHaveBeenCalledTimes(1);
    expect(orden[0]).toBe("verificar");
    expect(mock.create).toHaveBeenCalledTimes(3);
    expect(mock.notificacion).toHaveBeenCalledTimes(3);
    expect(mock.findMany.mock.calls[0][0].where.inicioProgramadoAt.lte).toEqual(new Date(ahora.getTime() + 24 * 60 * 60 * 1000));

    // Un worker concurrente / segunda ejecución no puede volver a enviar.
    const second = await procesarRecordatorios24h(mock.db, { verificarCohosts, enviarCorreo }, ahora);
    expect(second.enviados).toBe(0);
    expect(enviarCorreo).toHaveBeenCalledTimes(3);
  });

  it("no presenta cuentas locales como habilitadas cuando Meet no responde", () => {
    expect(clasificarAccesosPropios(["a@flacso.edu.uy"], null, null)).toEqual({
      estado: "NO_VERIFICABLE", cuentasConfirmadas: [], cuentasSinPermiso: []
    });
    const noPermitida = clasificarAccesosPropios(["a@flacso.edu.uy"], new Set(), null);
    expect(noPermitida.estado).toBe("SIN_PERMISOS");
    expect(noPermitida.cuentasSinPermiso).toEqual(["a@flacso.edu.uy"]);
  });

  it("separa la cuenta organizadora y normaliza las verificadas", () => {
    const res = clasificarAccesosPropios(
      ["SALa01@flacso.edu.uy", " ANA@FLACSO.EDU.UY ", "ana@flacso.edu.uy"],
      new Set(["ana@flacso.edu.uy"]),
      "sala01@flacso.edu.uy"
    );
    expect(res.cuentasConfirmadas).toEqual(["ana@flacso.edu.uy"]);
    expect(res.cuentasSinPermiso).toEqual([]);
  });

  it("no envía recordatorios cancelados ni más de 24h antes", async () => {
    const mock = dbFake([]);
    const send = vi.fn();
    await procesarRecordatorios24h(mock.db, { verificarCohosts: vi.fn(), enviarCorreo: send }, ahora);
    expect(send).not.toHaveBeenCalled();
    expect(mock.findMany.mock.calls[0][0].where.estado).toBe("PROGRAMADA");
    expect(mock.findMany.mock.calls[0][0].where.solicitud.estado.not).toBe("CANCELADA");
  });

  it("detiene un envío si la reunión fue reprogramada luego de la reserva", async () => {
    const mock = dbFake();
    mock.findUnique.mockResolvedValue({
      estado: "PROGRAMADA", inicioProgramadoAt: new Date(inicio.getTime() + 3600_000),
      solicitud: { estado: "REGISTRADA" }
    });
    const send = vi.fn();
    const run = await procesarRecordatorios24h(mock.db, {
      verificarCohosts: async () => new Set(), enviarCorreo: send
    }, ahora);
    expect(run.enviados).toBe(0);
    expect(send).not.toHaveBeenCalled();
    expect(mock.update).toHaveBeenCalledWith(expect.objectContaining({ data: { estado: "OBSOLETO" } }));
  });

  it("respeta preferencias de correo y no reintenta automáticamente rechazos inciertos", async () => {
    const prefs = users.map(u => ({
      ...u, preferenciasNotificacion: [{ email: u.id !== "assistant", push: false }]
    }));
    const mock = dbFake([meeting], prefs);
    const send = vi.fn(async () => ({ sent: false, error: "No confirmado" }));
    const result = await procesarRecordatorios24h(mock.db, {
      verificarCohosts: async () => null, enviarCorreo: send
    }, ahora);
    expect(result).toMatchObject({ errores: 2, enviados: 0, verificacionesFallidas: 1 });
    expect(send).toHaveBeenCalledTimes(2);
    expect(mock.notificacion).not.toHaveBeenCalled();
  });

  it("el correo HTML de Meet es seguro y distingue verificación fallida", () => {
    const mail = construirRecordatorioReunion({
      nombre: "Ana <script>",
      reunion: "Taller <x>",
      programa: "FLACSO & MIEM",
      fecha: "sábado, 24 de octubre de 2026",
      horarioClase: "10:00–12:00 h",
      modalidad: "Virtual",
      urlDetalle: "https://salavirtual.flacso.edu.uy/reuniones/123",
      acceso: { estado: "NO_VERIFICABLE", cuentasConfirmadas: [], cuentasSinPermiso: [] }
    });
    expect(mail.html).toContain("No pudimos verificar los accesos");
    expect(mail.html).toContain("FLACSO &amp; MIEM");
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("10:00–12:00 h");
  });
});
