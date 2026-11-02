import { describe, expect, it, vi } from "vitest";
import { procesarRecordatorios24h } from "../src/modules/reuniones/recordatorios-24h.service";
import { construirRecordatorioReunion } from "../src/modules/reuniones/recordatorio-reunion-email.domain";
import { construirCorreoParticipacion } from "../src/modules/reuniones/avisos-participacion.domain";
import { actualizarInvitadosSerie } from "../src/modules/reuniones/invitados-serie.service";
import { reunionEmailText } from "../src/modules/notificaciones/domain/notificacion-email.domain";
import { construirHtmlResumenMonitoreo } from "../src/modules/asistencia/correo-monitoreo.domain";
import { seleccionarEventoProveedorActivo } from "../src/modules/reuniones/evento-proveedor-activo.domain";

const MEET_URL = "https://meet.google.com/abc-defg-hij";
const ZOOM_URL = "https://us06web.zoom.us/j/81234567890?pwd=abc";
const inicio = new Date("2026-10-24T13:00:00.000Z");
const fin = new Date("2026-10-24T15:00:00.000Z");
const ahora = new Date("2026-10-23T13:02:00.000Z");

const eventoMeet = {
  id: "ev-meet", externalEventId: "cal-1",
  proveedor: { tipo: "GOOGLE_MEET" }, codigoReunion: "abc-defg-hij", joinUrl: MEET_URL,
  cuentaProveedor: { emailOrganizador: "sala01@flacso.edu.uy" }
};
const eventoZoom = {
  id: "ev-zoom", externalEventId: null,
  proveedor: { tipo: "ZOOM" }, codigoReunion: "81234567890", joinUrl: ZOOM_URL,
  cuentaProveedor: { emailOrganizador: "zoom01@flacso.edu.uy" }
};

describe("selector de proveedor activo en consumidores de enlaces", () => {
  it("elige Zoom aunque Meet siga registrado primero (conversión terminada)", () => {
    const activo = seleccionarEventoProveedorActivo({
      proveedorActivoTipo: "ZOOM", eventosProveedor: [eventoMeet, eventoZoom]
    });
    expect(activo?.joinUrl).toBe(ZOOM_URL);
  });
});

describe("recordatorio de 24 horas con proveedor activo", () => {
  function dbFake(meeting: unknown) {
    const create = vi.fn(async () => ({ id: "rec-1" }));
    return {
      create,
      db: {
        instanciaSala: {
          findMany: vi.fn(async () => [meeting]),
          findUnique: vi.fn(async () => ({ estado: "PROGRAMADA", inicioProgramadoAt: inicio, solicitud: { estado: "REGISTRADA" } }))
        },
        usuario: { findMany: vi.fn(async () => [{
          id: "teacher", nombres: "Ana", emailPrincipal: "ana@flacso.edu.uy",
          cuentasGoogle: [], emailAliases: [], preferenciasNotificacion: []
        }]) },
        recordatorioReunion: { create, update: vi.fn(async () => ({})) },
        notificacion: { create: vi.fn(async () => ({})) }
      } as any
    };
  }
  const base = {
    id: "inst-1", inicioProgramadoAt: inicio, finProgramadoAt: fin,
    inicioAsistenciaTecnicaAt: null, finAsistenciaTecnicaAt: null,
    modalidadOverride: null, requiereAsistenciaTecnica: false,
    solicitud: {
      id: "req-1", titulo: "Seminario", modalidad: "VIRTUAL", creadaPorUsuarioId: "teacher",
      docentePrograma: { docente: { usuarioId: "teacher" }, programa: { nombre: "Programa" } }
    },
    asignaciones: [], invitados: []
  };

  it("envía el enlace de Zoom y no consulta cohosts de Meet cuando Zoom está activo", async () => {
    const { db } = dbFake({ ...base, proveedorActivoTipo: "ZOOM", eventosProveedor: [eventoMeet, eventoZoom] });
    const verificarCohosts = vi.fn(async () => new Set<string>());
    const enviarCorreo = vi.fn(async () => ({ sent: true }));

    const resultado = await procesarRecordatorios24h(db, { verificarCohosts, enviarCorreo }, ahora);

    expect(resultado).toMatchObject({ enviados: 1, errores: 0, verificacionesFallidas: 0 });
    expect(verificarCohosts).not.toHaveBeenCalled();
    const [mail] = enviarCorreo.mock.calls[0] as unknown as [{ text: string; html: string }];
    expect(mail.text).toContain(ZOOM_URL);
    expect(mail.text).not.toContain(MEET_URL);
    expect(mail.html).toContain("Ingresar a Zoom");
    expect(mail.html).not.toContain("Google Meet");
  });

  it("mantiene Meet y su verificación para encuentros con Meet activo", async () => {
    const { db } = dbFake({ ...base, proveedorActivoTipo: "GOOGLE_MEET", eventosProveedor: [eventoZoom, eventoMeet] });
    const verificarCohosts = vi.fn(async () => new Set<string>());
    const enviarCorreo = vi.fn(async () => ({ sent: true }));

    await procesarRecordatorios24h(db, { verificarCohosts, enviarCorreo }, ahora);

    expect(verificarCohosts).toHaveBeenCalledWith("sala01@flacso.edu.uy", "abc-defg-hij");
    const [mail] = enviarCorreo.mock.calls[0] as unknown as [{ text: string }];
    expect(mail.text).toContain(MEET_URL);
    expect(mail.text).not.toContain(ZOOM_URL);
  });
});

describe("plantillas de correo por proveedor", () => {
  it("el recordatorio de Zoom no menciona permisos ni verificación de Google Meet", () => {
    const correo = construirRecordatorioReunion({
      nombre: "Ana", reunion: "Seminario", programa: "Programa", fecha: "sábado 24 de octubre",
      horarioClase: "10:00–12:00 h", modalidad: "Virtual", urlMeet: ZOOM_URL, proveedor: "ZOOM",
      urlDetalle: "https://salavirtual.flacso.edu.uy/reuniones/req-1",
      acceso: { estado: "NO_VERIFICABLE", cuentasConfirmadas: [], cuentasSinPermiso: [] }
    });
    expect(correo.text).toContain("Enlace de Zoom: " + ZOOM_URL);
    expect(correo.html).toContain("Ingresar a Zoom");
    expect(correo.text + correo.html).not.toMatch(/Google Meet|coanfitri/i);
  });

  it("invitaciones y avisos de enlace rotulan Zoom solo si todos los encuentros son Zoom", () => {
    const zoom = { id: "a", titulo: "Seminario", inicio, fin, urlMeet: ZOOM_URL, proveedor: "ZOOM" as const };
    const meet = { id: "b", titulo: "Seminario", inicio, fin, urlMeet: MEET_URL };

    const soloZoom = construirCorreoParticipacion("ENLACE_CAMBIADO", [zoom], "INVITADO");
    expect(soloZoom.html).toContain("Abrir Zoom");
    expect(soloZoom.text).toContain("enlace de Zoom");
    expect(soloZoom.text).not.toContain("Google Meet");

    const mixto = construirCorreoParticipacion("INVITACION", [zoom, meet], "INVITADO");
    expect(mixto.html).toContain("Abrir Zoom");
    expect(mixto.html).toContain("Abrir Google Meet");

    const legado = construirCorreoParticipacion("INVITACION", [meet], "INVITADO");
    expect(legado.html).toContain("Abrir Google Meet");
  });

  it("el aviso de creación indica ID de Zoom y evita instrucciones de Google Meet", () => {
    const texto = reunionEmailText({
      titulo: "Seminario", requiereAsistenciaTecnica: false,
      instancias: [{ inicio: "Sáb 24 oct, 10:00", fin: "12:00", meet: "81234567890", joinUrl: ZOOM_URL, proveedor: "ZOOM" }]
    });
    expect(texto).toContain("ID de Zoom: 81234567890");
    expect(texto).toContain(ZOOM_URL);
    expect(texto).not.toContain("Google Meet");
    expect(texto).not.toContain("Código de Meet");
  });

  it("el cronograma de monitoreo acepta enlaces de Zoom solo del proveedor declarado", () => {
    const reunion = {
      fecha: "24/10", titulo: "Seminario", inicioMonitoreo: "09:45", finMonitoreo: "12:00",
      inicioClase: "10:00", finClase: "12:00", modalidad: "Virtual", programa: "Programa", docente: "Ana"
    };
    const zoom = construirHtmlResumenMonitoreo({
      variante: "asignadas", reuniones: [{ ...reunion, meetUrl: ZOOM_URL, proveedor: "ZOOM" }]
    });
    expect(zoom).toContain("Ingresar a Zoom");
    expect(zoom).toContain("zoom.us/j/81234567890");

    const cruzado = construirHtmlResumenMonitoreo({
      variante: "asignadas", reuniones: [{ ...reunion, meetUrl: ZOOM_URL, proveedor: "GOOGLE_MEET" }]
    });
    expect(cruzado).not.toContain("zoom.us");
  });
});

describe("invitaciones de serie con proveedor activo", () => {
  it("usa Calendar de Meet para sincronizar pero envía el enlace de Zoom activo", async () => {
    const meeting = {
      id: "inst-1", inicioProgramadoAt: new Date("2030-10-24T13:00:00Z"), finProgramadoAt: new Date("2030-10-24T15:00:00Z"),
      invitados: [], cohosts: [], cohostEmails: [],
      proveedorActivoTipo: "ZOOM", eventosProveedor: [eventoMeet, eventoZoom]
    };
    const db: any = {
      solicitudSala: { findUnique: vi.fn().mockResolvedValue({
        id: "req-1", titulo: "Seminario", serieReunionId: "serie1", docenteProgramaId: "dp",
        createdAt: new Date("2030-01-01T00:00:00Z"), docentePrograma: { programaId: "programa" }
      }) },
      instanciaSala: { findMany: vi.fn().mockResolvedValue([meeting]) },
      invitadoReunion: { deleteMany: vi.fn(), createMany: vi.fn() },
      auditoria: { create: vi.fn() },
      $transaction: vi.fn(async (fn: (tx: any) => Promise<unknown>) => fn(db))
    };
    const enviarCorreo = vi.fn().mockResolvedValue(true);
    const leerCalendario = vi.fn().mockResolvedValue({ attendees: [] });
    const actualizarCalendario = vi.fn();

    const resultado = await actualizarInvitadosSerie(
      { db, leerCalendario, actualizarCalendario, enviarCorreo } as any,
      { id: "admin", rol: "ADMINISTRACION", activo: true } as any,
      "req-1",
      { emails: ["invitado@ejemplo.com"] }
    );

    expect(resultado.correosEnviados).toBe(1);
    expect(leerCalendario).toHaveBeenCalledWith("sala01@flacso.edu.uy", "cal-1");
    const [, correo] = enviarCorreo.mock.calls[0];
    expect(correo.text).toContain(ZOOM_URL);
    expect(correo.text).not.toContain(MEET_URL);
  });
});
