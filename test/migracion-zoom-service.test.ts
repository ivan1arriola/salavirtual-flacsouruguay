import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  actualizarExcepcionGoogleMeet,
  obtenerVistaPreviaMigracionZoom
} from "../src/modules/reuniones/migracion-zoom.service";

const ahora = new Date("2026-11-02T12:00:00Z");
const admin = { id: "admin", rol: "ADMINISTRACION" };
const docente = { id: "docente", rol: "DOCENTE" };

function instancia(over: Record<string, unknown> = {}) {
  return {
    id: "i1",
    estado: "PROGRAMADA",
    inicioProgramadoAt: new Date("2026-11-10T12:00:00Z"),
    finProgramadoAt: new Date("2026-11-10T13:00:00Z"),
    proveedorActivoTipo: "GOOGLE_MEET",
    conservarGoogleMeet: false,
    motivoConservarGoogleMeet: null,
    eventosProveedor: [{ proveedor: { tipo: "GOOGLE_MEET" } }],
    ...over
  };
}

function fakeDb(row: ReturnType<typeof instancia> | null) {
  const update = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "i1", ...data }));
  const audit = vi.fn(async () => ({}));
  const tx = {
    $executeRaw: vi.fn(async () => 1),
    instanciaSala: { findUnique: vi.fn(async () => row), update },
    auditoria: { create: audit }
  };
  const db = { $transaction: vi.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)) };
  return { db: db as unknown as PrismaClient, update, audit, transaction: db.$transaction };
}

describe("excepción Conservar en Google Meet", () => {
  it("rechaza a quien no es Administración sin tocar la base", async () => {
    const { db, transaction } = fakeDb(instancia());
    await expect(
      actualizarExcepcionGoogleMeet(
        db,
        docente,
        { instanciaId: "i1", conservar: true, motivo: "Evento externo" },
        ahora
      )
    ).rejects.toMatchObject({ status: 403 });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("marca un encuentro futuro programado con Meet activo y deja auditoría", async () => {
    const { db, update, audit } = fakeDb(instancia());
    await actualizarExcepcionGoogleMeet(
      db,
      admin,
      { instanciaId: "i1", conservar: true, motivo: "  Evento externo " },
      ahora
    );
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { conservarGoogleMeet: true, motivoConservarGoogleMeet: "Evento externo" }
      })
    );
    expect(audit).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorUsuarioId: "admin",
        accion: "EXCEPCION_GOOGLE_MEET_MARCADA",
        entidadId: "i1"
      })
    });
  });

  it("toma el bloqueo de la serie antes que el del encuentro, con la misma clave que la migración por serie", async () => {
    const fila = instancia({
      solicitud: {
        serieReunionId: "s-1",
        docenteProgramaId: "dp",
        titulo: "Clase",
        createdAt: new Date("2026-10-01T12:00:00Z")
      }
    });
    const bloqueos: string[] = [];
    const tx = {
      $executeRaw: vi.fn(async (_: unknown, clave: string) => {
        bloqueos.push(clave);
        return 1;
      }),
      instanciaSala: { findUnique: vi.fn(async () => fila), update: vi.fn(async () => ({ id: "i1" })) },
      auditoria: { create: vi.fn(async () => ({})) }
    };
    const db = {
      $transaction: vi.fn(async (cb: (t: typeof tx) => unknown) => cb(tx))
    } as unknown as PrismaClient;
    await actualizarExcepcionGoogleMeet(
      db,
      admin,
      { instanciaId: "i1", conservar: true, motivo: "Evento externo" },
      ahora
    );
    expect(bloqueos).toEqual(["flacso-meet:migracion-zoom-serie:serie:s-1", "flacso-meet:migracion-zoom:i1"]);
  });

  it("exige motivo al marcar y lo borra al quitar la excepción", async () => {
    const { db, update } = fakeDb(instancia({ conservarGoogleMeet: true, motivoConservarGoogleMeet: "x" }));
    await expect(
      actualizarExcepcionGoogleMeet(db, admin, { instanciaId: "i1", conservar: true, motivo: " " }, ahora)
    ).rejects.toMatchObject({ status: 400 });
    await actualizarExcepcionGoogleMeet(
      db,
      admin,
      { instanciaId: "i1", conservar: false, motivo: "ignorado" },
      ahora
    );
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { conservarGoogleMeet: false, motivoConservarGoogleMeet: null }
      })
    );
  });

  it.each([
    ["ya comenzó", { inicioProgramadoAt: new Date("2026-11-02T11:00:00Z") }],
    ["no está programada", { estado: "CANCELADA" }],
    [
      "el enlace vigente es Zoom",
      {
        proveedorActivoTipo: "ZOOM",
        eventosProveedor: [{ proveedor: { tipo: "GOOGLE_MEET" } }, { proveedor: { tipo: "ZOOM" } }]
      }
    ]
  ])("rechaza si %s", async (_nombre, over) => {
    const { db, update } = fakeDb(instancia(over));
    await expect(
      actualizarExcepcionGoogleMeet(
        db,
        admin,
        { instanciaId: "i1", conservar: true, motivo: "Motivo" },
        ahora
      )
    ).rejects.toMatchObject({ status: 400 });
    expect(update).not.toHaveBeenCalled();
  });

  it("responde 404 si el encuentro no existe", async () => {
    const { db } = fakeDb(null);
    await expect(
      actualizarExcepcionGoogleMeet(db, admin, { instanciaId: "x", conservar: true, motivo: "Motivo" }, ahora)
    ).rejects.toMatchObject({ status: 404 });
  });

  it("impide marcar una excepción cuando ya existe una conversión Zoom iniciada", async () => {
    const { db, update } = fakeDb(
      instancia({
        eventosProveedor: [{ proveedor: { tipo: "GOOGLE_MEET" } }, { proveedor: { tipo: "ZOOM" } }]
      })
    );
    await expect(
      actualizarExcepcionGoogleMeet(
        db,
        admin,
        { instanciaId: "i1", conservar: true, motivo: "Excepción" },
        ahora
      )
    ).rejects.toMatchObject({ status: 400 });
    expect(update).not.toHaveBeenCalled();
  });
});

describe("vista previa de migración a Zoom", () => {
  function previewDb(meetOverrides: Record<string, unknown> = {}, seriePorId: Record<string, string> = {}) {
    const meetOk = {
      joinUrl: "https://meet.google.com/abc",
      externalEventId: "calendar-event",
      estadoIntegracion: "SINCRONIZADA",
      operacionPendiente: null,
      cuentaProveedor: { emailOrganizador: "sala@flacso.edu.uy" },
      proveedor: { tipo: "GOOGLE_MEET" },
      ...meetOverrides
    };
    const base = {
      estado: "PROGRAMADA",
      proveedorActivoTipo: "GOOGLE_MEET",
      conservarGoogleMeet: false,
      motivoConservarGoogleMeet: null,
      solicitud: {
        titulo: "Clase",
        creadaPor: { emailPrincipal: "Admin@flacso.edu.uy" },
        docentePrograma: {
          programa: { nombre: "Programa de prueba" },
          docente: { usuario: { emailPrincipal: "doc@flacso.edu.uy" } }
        }
      },
      asignaciones: [],
      cohostEmails: [{ email: "co@flacso.edu.uy" }],
      invitados: [],
      eventosProveedor: [meetOk]
    };
    const at = (id: string, day: number) => ({
      ...base,
      solicitud: {
        ...base.solicitud,
        serieReunionId: seriePorId[id] ?? `serie-${id}`,
        docenteProgramaId: "dp-1",
        createdAt: new Date("2026-10-01T12:00:00Z")
      },
      id,
      inicioProgramadoAt: new Date(`2026-11-${String(day).padStart(2, "0")}T12:00:00Z`),
      finProgramadoAt: new Date(`2026-11-${String(day).padStart(2, "0")}T13:00:00Z`)
    });
    const instancias = [
      at("a", 10),
      at("b", 10),
      { ...at("c", 11), conservarGoogleMeet: true, motivoConservarGoogleMeet: "Externo" },
      at("d", 3)
    ];
    const findMany = vi.fn(async () => instancias);
    const write = vi.fn();
    const db = {
      instanciaSala: { findMany, update: write },
      cuentaProveedor: {
        findMany: vi.fn(async () => [
          {
            id: "h1",
            nombre: "Sala 01",
            emailOrganizador: "sala01@flacso.edu.uy",
            prioridad: 1,
            limiteConcurrente: 1
          }
        ])
      },
      eventoProveedor: { findMany: vi.fn(async () => []), update: write, create: write },
      auditoria: { create: write },
      $transaction: write
    } as unknown as PrismaClient;
    return { db, write };
  }

  it("niega el acceso a no administradores", async () => {
    const { db, write } = previewDb();
    await expect(obtenerVistaPreviaMigracionZoom(db, docente, ahora)).rejects.toMatchObject({ status: 403 });
    expect(write).not.toHaveBeenCalled();
  });

  it("clasifica excepciones, encuentros cercanos y colisiones del mismo host sin escribir", async () => {
    const { db, write } = previewDb();
    const vista = await obtenerVistaPreviaMigracionZoom(db, admin, ahora);
    const porId = Object.fromEntries(vista.filas.map((fila) => [fila.id, fila]));

    expect(porId.a).toMatchObject({ estado: "MIGRABLE", cambioEnlace: true, hostZoom: { id: "h1" } });
    expect(porId.a.destinatarios).toEqual(["admin@flacso.edu.uy", "co@flacso.edu.uy", "doc@flacso.edu.uy"]);
    expect(porId.b).toMatchObject({
      estado: "SIN_SALA",
      hostZoom: null,
      cambioEnlace: false,
      destinatarios: []
    });
    expect(porId.c).toMatchObject({ estado: "EXCEPCION", motivoExcepcion: "Externo", cambioEnlace: false });
    expect(porId.d.estado).toBe("CERCANO");
    expect(vista.conteos).toMatchObject({ MIGRABLE: 1, SIN_SALA: 1, EXCEPCION: 1, CERCANO: 1 });
    expect(write).not.toHaveBeenCalled();
  });

  it("bloquea todos los encuentros de una serie con varios encuentros futuros y no les asigna sala", async () => {
    const { db, write } = previewDb({}, { a: "serie-comun", b: "serie-comun", c: "serie-comun" });
    const vista = await obtenerVistaPreviaMigracionZoom(db, admin, ahora);
    const porId = Object.fromEntries(vista.filas.map((fila) => [fila.id, fila]));
    expect(porId.a).toMatchObject({
      estado: "SERIE",
      hostZoom: null,
      cambioEnlace: false,
      destinatarios: []
    });
    expect(porId.b).toMatchObject({ estado: "SERIE", hostZoom: null, cambioEnlace: false });
    expect(porId.c.estado).toBe("EXCEPCION");
    expect(vista.conteos.SERIE).toBe(2);
    expect(vista.conteos.MIGRABLE).toBe(0);
    expect(write).not.toHaveBeenCalled();
  });

  it("una serie con un solo encuentro futuro sigue siendo migrable", async () => {
    const { db } = previewDb();
    const vista = await obtenerVistaPreviaMigracionZoom(db, admin, ahora);
    expect(vista.conteos.SERIE).toBe(0);
    expect(vista.conteos.MIGRABLE).toBe(1);
  });

  it("incluye encuentros con Meet operativo y solo ajustes de cohosts pendientes", async () => {
    const { db } = previewDb({ estadoIntegracion: "PENDIENTE", operacionPendiente: "CONFIGURAR_MEET" });
    const vista = await obtenerVistaPreviaMigracionZoom(db, admin, ahora);
    expect(vista.conteos.MIGRABLE).toBe(1);
    expect(vista.conteos.REVISAR).toBe(0);
  });
});
