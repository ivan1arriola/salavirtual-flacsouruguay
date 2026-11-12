import { describe, expect, it, vi } from "vitest";
import { procesarRecordatorios24h } from "../src/modules/reuniones/recordatorios-24h.service";

const inicio = new Date("2030-10-24T13:00:00Z");
const ahora = new Date("2030-10-23T13:05:00Z");

describe("recordatorios de invitados externos", () => {
  it("envía un único correo a cada invitado, sin reclamar permisos cohost", async () => {
    let reservado = false;
    const db: any = {
      instanciaSala: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "inst",
            inicioProgramadoAt: inicio,
            finProgramadoAt: new Date("2030-10-24T15:00:00Z"),
            inicioAsistenciaTecnicaAt: null,
            finAsistenciaTecnicaAt: null,
            modalidadOverride: null,
            requiereAsistenciaTecnica: false,
            invitados: [{ email: "persona@ejemplo.com" }],
            solicitud: {
              id: "req",
              titulo: "Seminario",
              modalidad: "VIRTUAL",
              creadaPorUsuarioId: "u1",
              docentePrograma: { docente: { usuarioId: "u2" }, programa: { nombre: "Género" } }
            },
            asignaciones: [],
            eventosProveedor: [
              {
                proveedor: { tipo: "GOOGLE_MEET" },
                codigoReunion: "abc-defg-hij",
                joinUrl: "https://meet.google.com/abc-defg-hij",
                cuentaProveedor: { emailOrganizador: "sala@flacso.edu.uy" }
              }
            ]
          }
        ]),
        findUnique: vi.fn().mockResolvedValue({
          estado: "PROGRAMADA",
          inicioProgramadoAt: inicio,
          solicitud: { estado: "REGISTRADA" },
          invitados: [{ id: "guest" }]
        })
      },
      usuario: { findMany: vi.fn().mockResolvedValue([]) },
      recordatorioInvitadoReunion: {
        create: vi.fn().mockImplementation(async () => {
          if (reservado) {
            throw Object.assign(new Error("unique"), { code: "P2002" });
          }
          reservado = true;
          return { id: "reminder-1" };
        }),
        update: vi.fn().mockResolvedValue({})
      }
    };
    const enviarCorreo = vi.fn().mockResolvedValue({ sent: true });
    const deps = { verificarCohosts: vi.fn().mockResolvedValue(new Set()), enviarCorreo };
    const first = await procesarRecordatorios24h(db, deps, ahora);
    expect(first).toMatchObject({ enviados: 1, errores: 0, destinatarios: 1 });
    expect(enviarCorreo).toHaveBeenCalledTimes(1);
    expect(enviarCorreo.mock.calls[0][0].html).toContain("no te concede permisos de coanfitrión");
    expect(enviarCorreo.mock.calls[0][0].text).toContain("abc-defg-hij");
    const second = await procesarRecordatorios24h(db, deps, ahora);
    expect(second.enviados).toBe(0);
    expect(enviarCorreo).toHaveBeenCalledTimes(1);
  });
});
