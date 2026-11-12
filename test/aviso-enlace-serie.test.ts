import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { notificarCambioEnlaceSerie } from "../src/modules/reuniones/aviso-enlace-serie.service";

const ahora = new Date("2026-11-03T12:00:00Z");
const URL_ZOOM = "https://flacso.zoom.us/j/123456789?pwd=abc";

type FilaAviso = {
  id: string;
  serieClave: string;
  email: string;
  tipo: string;
  estado: string;
  enviadoAt: Date | null;
};

function instancia(id: string, dia: number, extra: Record<string, unknown> = {}) {
  return {
    id,
    estado: "PROGRAMADA",
    inicioProgramadoAt: new Date(`2026-11-${String(dia).padStart(2, "0")}T12:00:00Z`),
    finProgramadoAt: new Date(`2026-11-${String(dia).padStart(2, "0")}T14:00:00Z`),
    proveedorActivoTipo: "ZOOM",
    eventosProveedor: [
      {
        joinUrl: URL_ZOOM,
        externalEventId: "serie-1",
        cuentaProveedor: { emailOrganizador: "sala01@flacso.edu.uy" },
        proveedor: { tipo: "ZOOM" }
      },
      {
        joinUrl: "https://meet.google.com/abc",
        externalEventId: `cal-${id}`,
        cuentaProveedor: { emailOrganizador: "meet@flacso.edu.uy" },
        proveedor: { tipo: "GOOGLE_MEET" }
      }
    ],
    solicitud: {
      titulo: "Seminario",
      estado: "APROBADA",
      creadaPorUsuarioId: "creador",
      docentePrograma: { docente: { usuarioId: "docente" }, programa: { nombre: "Maestría" } }
    },
    asignaciones: [],
    cohosts: [],
    cohostEmails: [],
    invitados: [{ email: "invitada@example.org", nombre: "Inés" }],
    ...extra
  };
}

function crearDb(instancias: ReturnType<typeof instancia>[]) {
  const filas: FilaAviso[] = [];
  let contador = 0;
  const estado = { instancias };
  const db = {
    instanciaSala: { findMany: vi.fn(async () => estado.instancias) },
    usuario: {
      findMany: vi.fn(async () => [
        { nombres: "Carla", emailPrincipal: "Carla@flacso.edu.uy" },
        { nombres: "Diego", emailPrincipal: "diego@flacso.edu.uy" }
      ])
    },
    avisoEnlaceSerie: {
      create: vi.fn(async ({ data }: { data: Omit<FilaAviso, "id" | "enviadoAt"> }) => {
        if (
          filas.some(
            (f) => f.serieClave === data.serieClave && f.email === data.email && f.tipo === data.tipo
          )
        ) {
          throw Object.assign(new Error("Unique"), { code: "P2002" });
        }
        const fila = { id: `av${++contador}`, enviadoAt: null, ...data };
        filas.push(fila);
        return { id: fila.id };
      }),
      findUnique: vi.fn(
        async ({
          where
        }: {
          where: { serieClave_email_tipo: { serieClave: string; email: string; tipo: string } };
        }) => {
          const { serieClave, email, tipo } = where.serieClave_email_tipo;
          return (
            filas.find((f) => f.serieClave === serieClave && f.email === email && f.tipo === tipo) ?? null
          );
        }
      ),
      updateMany: vi.fn(
        async ({ where, data }: { where: { id: string; estado: string }; data: Partial<FilaAviso> }) => {
          const fila = filas.find((f) => f.id === where.id && f.estado === where.estado);
          if (!fila) {
            return { count: 0 };
          }
          Object.assign(fila, data);
          return { count: 1 };
        }
      ),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<FilaAviso> }) => {
        Object.assign(
          filas.find((f) => f.id === where.id)!,
          data
        );
        return {};
      })
    }
  };
  return { db: db as unknown as PrismaClient, filas, estado };
}

const entrada = {
  serieClave: "serie:abc",
  instanciaIds: ["a", "b", "c"],
  tipo: "MIGRACION_SERIE" as const,
  joinUrl: URL_ZOOM
};

describe("aviso de cambio de enlace por serie", () => {
  it("envía un solo correo por destinatario aunque esté en varios encuentros, con todos los encuentros", async () => {
    const { db, filas } = crearDb([instancia("a", 10), instancia("b", 17), instancia("c", 24)]);
    const enviarCorreo = vi.fn(async () => ({ sent: true }));
    const resumen = await notificarCambioEnlaceSerie({ db, enviarCorreo, ahora: () => ahora }, entrada);

    expect(resumen).toMatchObject({ estado: "COMPLETO", destinatarios: 3, enviados: 3, errores: 0 });
    expect(enviarCorreo).toHaveBeenCalledTimes(3);
    expect(filas.map(({ email }) => email).sort()).toEqual([
      "carla@flacso.edu.uy",
      "diego@flacso.edu.uy",
      "invitada@example.org"
    ]);
    const [llamada] = enviarCorreo.mock.calls[0] as unknown as [{ to: string[]; text: string }];
    for (const fecha of ["10 de noviembre", "17 de noviembre", "24 de noviembre"]) {
      expect(llamada.text).toContain(fecha);
    }
  });

  it("un reintento no vuelve a enviar los ya aceptados", async () => {
    const { db } = crearDb([instancia("a", 10), instancia("b", 17)]);
    const enviarCorreo = vi.fn(async () => ({ sent: true }));
    await notificarCambioEnlaceSerie({ db, enviarCorreo, ahora: () => ahora }, entrada);
    const segundo = await notificarCambioEnlaceSerie({ db, enviarCorreo, ahora: () => ahora }, entrada);
    expect(enviarCorreo).toHaveBeenCalledTimes(3);
    expect(segundo).toMatchObject({ estado: "COMPLETO", enviados: 0, yaEnviados: 3 });
  });

  it("reintenta solo los destinatarios con error", async () => {
    const { db } = crearDb([instancia("a", 10)]);
    const enviarCorreo = vi.fn(async ({ to }: { to: readonly string[] }) =>
      to[0] === "diego@flacso.edu.uy" ? { sent: false, error: "SMTP" } : { sent: true }
    );
    const primero = await notificarCambioEnlaceSerie({ db, enviarCorreo, ahora: () => ahora }, entrada);
    expect(primero).toMatchObject({ estado: "PARCIAL", enviados: 2, errores: 1 });

    enviarCorreo.mockImplementation(async () => ({ sent: true }));
    const segundo = await notificarCambioEnlaceSerie({ db, enviarCorreo, ahora: () => ahora }, entrada);
    expect(segundo).toMatchObject({ estado: "COMPLETO", enviados: 1, yaEnviados: 2, errores: 0 });
  });

  it("los tipos de aviso son independientes: una corrección posterior sí se envía", async () => {
    const { db } = crearDb([instancia("a", 10)]);
    const enviarCorreo = vi.fn(async () => ({ sent: true }));
    await notificarCambioEnlaceSerie({ db, enviarCorreo, ahora: () => ahora }, entrada);
    const correccion = await notificarCambioEnlaceSerie(
      { db, enviarCorreo, ahora: () => ahora },
      { ...entrada, tipo: "CORRECCION_ENLACE" }
    );
    expect(correccion).toMatchObject({ enviados: 3, yaEnviados: 0 });
    expect(enviarCorreo).toHaveBeenCalledTimes(6);
  });

  it("marca el aviso como obsoleto si la serie dejó de estar en Zoom entre la reserva y el envío", async () => {
    const { db, filas, estado } = crearDb([instancia("a", 10)]);
    let llamadas = 0;
    (db.instanciaSala.findMany as unknown as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      llamadas += 1;
      return llamadas === 1
        ? estado.instancias
        : [instancia("a", 10, { proveedorActivoTipo: "GOOGLE_MEET" })];
    });
    const enviarCorreo = vi.fn(async () => ({ sent: true }));
    const resumen = await notificarCambioEnlaceSerie({ db, enviarCorreo, ahora: () => ahora }, entrada);
    expect(enviarCorreo).not.toHaveBeenCalled();
    expect(resumen.detalle.every(({ estado }) => estado === "OBSOLETO")).toBe(true);
    expect(filas.every(({ estado }) => estado === "OBSOLETO")).toBe(true);
  });

  it("no aplica si no hay encuentros vigentes en Zoom o si el enlace no es de Zoom", async () => {
    const enviarCorreo = vi.fn(async () => ({ sent: true }));
    const sinVigentes = crearDb([
      instancia("a", 10, { proveedorActivoTipo: "GOOGLE_MEET" }),
      instancia("b", 2)
    ]);
    expect(
      await notificarCambioEnlaceSerie({ db: sinVigentes.db, enviarCorreo, ahora: () => ahora }, entrada)
    ).toMatchObject({ estado: "NO_APLICA", destinatarios: 0 });

    const ok = crearDb([instancia("a", 10)]);
    expect(
      await notificarCambioEnlaceSerie(
        { db: ok.db, enviarCorreo, ahora: () => ahora },
        { ...entrada, joinUrl: "https://example.com/j/1" }
      )
    ).toMatchObject({ estado: "NO_APLICA" });
    expect(enviarCorreo).not.toHaveBeenCalled();
  });

  it("un fallo al leer Calendar deja el resultado parcial sin cortar el envío", async () => {
    const { db } = crearDb([instancia("a", 10)]);
    const enviarCorreo = vi.fn(async () => ({ sent: true }));
    const resumen = await notificarCambioEnlaceSerie(
      {
        db,
        enviarCorreo,
        ahora: () => ahora,
        leerInvitadosCalendar: async () => {
          throw new Error("Calendar caído");
        }
      },
      entrada
    );
    expect(resumen.estado).toBe("PARCIAL");
    expect(resumen.motivo).toContain("Calendar caído");
    expect(resumen.enviados).toBe(3);
  });

  it("incluye como destinatarios a los invitados de las citas de Calendar", async () => {
    const { db } = crearDb([instancia("a", 10)]);
    const enviarCorreo = vi.fn(async () => ({ sent: true }));
    const resumen = await notificarCambioEnlaceSerie(
      {
        db,
        enviarCorreo,
        ahora: () => ahora,
        leerInvitadosCalendar: async (calendarId, eventId) =>
          calendarId === "meet@flacso.edu.uy" && eventId === "cal-a" ? ["Extra@Example.org"] : []
      },
      entrada
    );
    expect(resumen.detalle.map(({ email }) => email)).toContain("extra@example.org");
  });

  it("una excepción del transporte deja el aviso reservado y no lo reenvía solo", async () => {
    const { db, filas } = crearDb([instancia("a", 10)]);
    const enviarCorreo = vi.fn(async () => {
      throw new Error("Timeout");
    });
    const resumen = await notificarCambioEnlaceSerie({ db, enviarCorreo, ahora: () => ahora }, entrada);
    expect(resumen).toMatchObject({ estado: "PARCIAL", enCurso: 3 });
    expect(filas.every(({ estado }) => estado === "RESERVADO")).toBe(true);
    const reintento = await notificarCambioEnlaceSerie(
      { db, enviarCorreo: vi.fn(async () => ({ sent: true })), ahora: () => ahora },
      entrada
    );
    expect(reintento.enCurso).toBe(3);
  });

  it("el correo nunca incluye el enlace de inicio del anfitrión", async () => {
    const { db } = crearDb([instancia("a", 10)]);
    const enviarCorreo = vi.fn(
      async (_correo: { to: readonly string[]; subject: string; text: string; html: string }) => ({
        sent: true
      })
    );
    await notificarCambioEnlaceSerie({ db, enviarCorreo, ahora: () => ahora }, entrada);
    const [correo] = enviarCorreo.mock.calls[0];
    expect(`${correo.text}${correo.html}`).not.toMatch(/zak=|start_url/);
  });
});
