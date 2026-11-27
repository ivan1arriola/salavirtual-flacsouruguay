import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { notificarMigracionZoom } from "../src/modules/reuniones/migracion-zoom-avisos.service";
import { construirAvisoMigracionZoom } from "../src/modules/reuniones/migracion-zoom-aviso-email.domain";
import { crearOutboxFake } from "./support/aviso-migracion-zoom-fake";

const ahora = new Date("2026-11-02T12:00:00Z");
const ZOOM = "https://us06web.zoom.us/j/123?pwd=xyz";

function escenario(over: Record<string, unknown> = {}) {
  const outbox = crearOutboxFake([
    { id: "creador", nombres: "Carla", emailPrincipal: "Carla@flacso.edu.uy" },
    { id: "docente", nombres: "Diego", emailPrincipal: "diego@flacso.edu.uy" },
    { id: "asist", nombres: "Ana", emailPrincipal: "ana@flacso.edu.uy" },
  ]);
  const instancia: Record<string, any> = {
    id: "i1",
    estado: "PROGRAMADA",
    proveedorActivoTipo: "ZOOM",
    inicioProgramadoAt: new Date("2026-11-10T12:00:00Z"),
    finProgramadoAt: new Date("2026-11-10T13:00:00Z"),
    eventosProveedor: [
      {
        joinUrl: "https://meet.google.com/abc-defg-hij",
        externalEventId: "cal-1",
        cuentaProveedor: { emailOrganizador: "sala01@flacso.edu.uy" },
        proveedor: { tipo: "GOOGLE_MEET" },
      },
      { joinUrl: ZOOM, proveedor: { tipo: "ZOOM" } },
    ],
    solicitud: {
      titulo: "Clase 3",
      estado: "APROBADA",
      creadaPorUsuarioId: "creador",
      docentePrograma: { docente: { usuarioId: "docente" }, programa: { nombre: "Maestría" } },
    },
    asignaciones: [
      { asistenteTecnico: { usuarioId: "asist", cesadoHastaProximoInicioSesion: false } },
    ],
    cohosts: [{ cuentaGoogle: { email: "cohost@flacso.edu.uy" } }],
    cohostEmails: [{ email: "externo-cohost@example.org" }, { email: "ANA@flacso.edu.uy" }],
    invitados: [
      { email: "invitada@example.org", nombre: "Inés" },
      { email: "diego@flacso.edu.uy", nombre: null },
      { email: "no-es-correo", nombre: null },
    ],
    ...over,
  };
  const db = {
    instanciaSala: { findUnique: vi.fn(async () => instancia) },
    usuario: outbox.usuario,
    avisoMigracionZoom: outbox.avisoMigracionZoom,
  } as unknown as PrismaClient;
  return { db, instancia, outbox };
}

const ok = () => vi.fn(async () => ({ sent: true }));

describe("notificarMigracionZoom", () => {
  it("no envía nada ni reserva mientras el proveedor activo no sea Zoom", async () => {
    const e = escenario({ proveedorActivoTipo: "GOOGLE_MEET" });
    const enviarCorreo = ok();
    const r = await notificarMigracionZoom({ db: e.db, enviarCorreo, ahora: () => ahora }, "i1");
    expect(r).toMatchObject({ estado: "NO_APLICA", destinatarios: 0 });
    expect(enviarCorreo).not.toHaveBeenCalled();
    expect(e.outbox.filas).toHaveLength(0);
  });

  it("avisa de forma individual a creador, docente, asistentes, cohosts e invitados, sin duplicar correos", async () => {
    const e = escenario();
    const enviarCorreo = ok();
    const r = await notificarMigracionZoom({ db: e.db, enviarCorreo, ahora: () => ahora }, "i1");

    const destinos = enviarCorreo.mock.calls.map(([m]: any) => m.to);
    expect(destinos.every((to: string[]) => to.length === 1)).toBe(true);
    expect(destinos.flat().sort()).toEqual([
      "ana@flacso.edu.uy",
      "carla@flacso.edu.uy",
      "cohost@flacso.edu.uy",
      "diego@flacso.edu.uy",
      "externo-cohost@example.org",
      "invitada@example.org",
    ]);
    expect(r).toMatchObject({ estado: "COMPLETO", destinatarios: 6, enviados: 6, errores: 0 });
    expect(e.outbox.filas.every((f) => f.estado === "ACEPTADO" && f.enviadoAt)).toBe(true);
  });

  it("incluye invitados agregados solo en Calendar y los deduplica con Sala Virtual", async () => {
    const e = escenario();
    const enviarCorreo = ok();
    const leerInvitadosCalendar = vi.fn(async () => ["NUEVA@example.org", "invitada@example.org"]);
    const r = await notificarMigracionZoom(
      { db: e.db, enviarCorreo, leerInvitadosCalendar, ahora: () => ahora },
      "i1",
    );
    expect(leerInvitadosCalendar).toHaveBeenCalledWith("sala01@flacso.edu.uy", "cal-1");
    expect(r).toMatchObject({ estado: "COMPLETO", destinatarios: 7, enviados: 7 });
    expect(e.outbox.filas.filter((fila) => fila.email === "nueva@example.org")).toHaveLength(1);
  });

  it("permite completar después los invitados de Calendar si la lectura inicial falla", async () => {
    const e = escenario();
    const enviarCorreo = ok();
    const primera = await notificarMigracionZoom(
      {
        db: e.db,
        enviarCorreo,
        leerInvitadosCalendar: async () => {
          throw new Error("Calendar 503");
        },
        ahora: () => ahora,
      },
      "i1",
    );
    expect(primera).toMatchObject({ estado: "PARCIAL", enviados: 6 });
    expect(primera.motivo).toContain("Calendar");
    const segunda = await notificarMigracionZoom(
      {
        db: e.db,
        enviarCorreo,
        leerInvitadosCalendar: async () => ["tardia@example.org"],
        ahora: () => ahora,
      },
      "i1",
    );
    expect(segunda).toMatchObject({ estado: "COMPLETO", enviados: 1, yaEnviados: 6 });
  });

  it("incluye el join_url real de Zoom y la fecha, nunca el enlace Meet", async () => {
    const e = escenario();
    const enviarCorreo = ok();
    await notificarMigracionZoom({ db: e.db, enviarCorreo, ahora: () => ahora }, "i1");
    const mensaje: any = (enviarCorreo.mock.calls as any)[0][0];
    expect(mensaje.text).toContain(ZOOM);
    expect(mensaje.html).toContain("us06web.zoom.us/j/123");
    expect(mensaje.text).toMatch(/Fecha: .*2026/);
    expect(mensaje.text).not.toContain("meet.google.com");
    expect(mensaje.subject).toContain("Clase 3");
  });

  it("es idempotente: una segunda ejecución no reenvía a quienes ya fueron avisados", async () => {
    const e = escenario();
    const enviarCorreo = ok();
    await notificarMigracionZoom({ db: e.db, enviarCorreo, ahora: () => ahora }, "i1");
    const segunda = await notificarMigracionZoom(
      { db: e.db, enviarCorreo, ahora: () => ahora },
      "i1",
    );
    expect(enviarCorreo).toHaveBeenCalledTimes(6);
    expect(segunda).toMatchObject({ estado: "COMPLETO", enviados: 0, yaEnviados: 6 });
  });

  it("conserva el reintento: un fallo queda en ERROR y el reintento reenvía solo ese correo", async () => {
    const e = escenario();
    const enviarCorreo = vi.fn(async ({ to }: any) =>
      to[0] === "invitada@example.org" ? { sent: false, error: "SES_THROTTLED" } : { sent: true },
    );
    const primera = await notificarMigracionZoom(
      { db: e.db, enviarCorreo, ahora: () => ahora },
      "i1",
    );
    expect(primera).toMatchObject({ estado: "PARCIAL", enviados: 5, errores: 1 });
    expect(primera.detalle.find((d) => d.estado === "ERROR")).toMatchObject({
      email: "invitada@example.org",
      error: "SES_THROTTLED",
    });

    const sano = ok();
    const segunda = await notificarMigracionZoom(
      { db: e.db, enviarCorreo: sano, ahora: () => ahora },
      "i1",
    );
    expect(sano).toHaveBeenCalledTimes(1);
    expect((sano.mock.calls[0] as any)[0].to).toEqual(["invitada@example.org"]);
    expect(segunda).toMatchObject({ estado: "COMPLETO", enviados: 1, yaEnviados: 5, errores: 0 });
    expect(e.outbox.filas.find((f) => f.email === "invitada@example.org")).toMatchObject({
      estado: "ACEPTADO",
      intentos: 2,
    });
  });

  it("un transporte que lanza excepción queda retenido para revisión y evita un envío duplicado", async () => {
    const e = escenario();
    const falla = vi.fn(async () => {
      throw new Error("socket hang up");
    });
    const r = await notificarMigracionZoom(
      { db: e.db, enviarCorreo: falla, ahora: () => ahora },
      "i1",
    );
    expect(r).toMatchObject({ estado: "PARCIAL", enCurso: 6 });
    const sano = ok();
    expect(
      await notificarMigracionZoom({ db: e.db, enviarCorreo: sano, ahora: () => ahora }, "i1"),
    ).toMatchObject({ estado: "PARCIAL", enCurso: 6 });
    expect(sano).not.toHaveBeenCalled();
  });

  it("no envía dos veces con ejecuciones concurrentes (reserva única)", async () => {
    const e = escenario();
    const enviarCorreo = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 5));
      return { sent: true };
    });
    await Promise.all([
      notificarMigracionZoom({ db: e.db, enviarCorreo, ahora: () => ahora }, "i1"),
      notificarMigracionZoom({ db: e.db, enviarCorreo, ahora: () => ahora }, "i1"),
    ]);
    expect(enviarCorreo).toHaveBeenCalledTimes(6);
  });

  it("no envía si el enlace Zoom falta o no es de Zoom, ni si el encuentro fue cancelado", async () => {
    for (const over of [
      { eventosProveedor: [{ joinUrl: "https://evil.example/j/1", proveedor: { tipo: "ZOOM" } }] },
      { eventosProveedor: [{ joinUrl: null, proveedor: { tipo: "ZOOM" } }] },
      { estado: "CANCELADA" },
    ]) {
      const e = escenario(over);
      const enviarCorreo = ok();
      expect(
        (await notificarMigracionZoom({ db: e.db, enviarCorreo, ahora: () => ahora }, "i1")).estado,
      ).toBe("NO_APLICA");
      expect(enviarCorreo).not.toHaveBeenCalled();
    }
  });

  it("marca OBSOLETO y no envía si el encuentro cambió entre la reserva y el envío", async () => {
    const e = escenario();
    const original = e.instancia;
    let llamadas = 0;
    (e.db as any).instanciaSala.findUnique = vi.fn(async () =>
      ++llamadas === 1
        ? original
        : { ...original, estado: "CANCELADA", solicitud: { estado: "APROBADA" } },
    );
    const enviarCorreo = ok();
    const r = await notificarMigracionZoom({ db: e.db, enviarCorreo, ahora: () => ahora }, "i1");
    expect(enviarCorreo).not.toHaveBeenCalled();
    expect(r.detalle.every((d) => d.estado === "OBSOLETO")).toBe(true);
    expect(e.outbox.filas.every((f) => f.estado === "OBSOLETO")).toBe(true);
  });

  it("no reenvía filas en curso (RESERVADO) ni las trata como enviadas", async () => {
    const e = escenario();
    await e.outbox.avisoMigracionZoom.create({
      data: {
        instanciaSalaId: "i1",
        email: "ana@flacso.edu.uy",
        estado: "RESERVADO",
        joinUrl: ZOOM,
      },
    });
    const enviarCorreo = ok();
    const r = await notificarMigracionZoom({ db: e.db, enviarCorreo, ahora: () => ahora }, "i1");
    expect(enviarCorreo).toHaveBeenCalledTimes(5);
    expect(r).toMatchObject({ estado: "PARCIAL", enCurso: 1 });
  });
});

describe("construirAvisoMigracionZoom", () => {
  it("escapa el contenido y no incluye enlaces del anfitrión", () => {
    const c = construirAvisoMigracionZoom({
      nombre: "<b>X</b>",
      reunion: "A & B",
      fecha: "lunes",
      horario: "9–10 h",
      urlZoom: ZOOM,
    });
    expect(c.html).not.toContain("<b>X</b>");
    expect(c.html).toContain("A &amp; B");
    expect(c.html).toContain(ZOOM.replace(/&/g, "&amp;"));
    expect(c.text).not.toContain("start");
  });
});
