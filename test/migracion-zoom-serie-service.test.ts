import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { obtenerVistaPreviaMigracionZoomPorSerie } from "../src/modules/reuniones/migracion-zoom-serie.service";

const ahora = new Date("2026-11-02T12:00:00Z");
const admin = { id: "admin", rol: "ADMINISTRACION" };
const docente = { id: "docente", rol: "DOCENTE" };

const meetOk = {
  joinUrl: "https://meet.google.com/abc",
  externalEventId: "calendar-event",
  estadoIntegracion: "SINCRONIZADA",
  operacionPendiente: null,
  cuentaProveedor: { emailOrganizador: "sala@flacso.edu.uy" },
  proveedor: { tipo: "GOOGLE_MEET" },
  reunionProveedorId: null,
  cuentaProveedorId: "meet-host"
};

function instancia(id: string, dia: number, serie: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    estado: "PROGRAMADA",
    proveedorActivoTipo: "GOOGLE_MEET",
    conservarGoogleMeet: false,
    motivoConservarGoogleMeet: null,
    inicioProgramadoAt: new Date(`2026-11-${String(dia).padStart(2, "0")}T12:00:00Z`),
    finProgramadoAt: new Date(`2026-11-${String(dia).padStart(2, "0")}T13:00:00Z`),
    solicitud: {
      titulo: `Clase ${serie}`,
      serieReunionId: serie,
      docenteProgramaId: "dp-1",
      createdAt: new Date("2026-10-01T12:00:00Z"),
      creadaPor: { emailPrincipal: "Admin@flacso.edu.uy" },
      docentePrograma: {
        programa: { nombre: "Maestría" },
        docente: { usuario: { emailPrincipal: "doc@flacso.edu.uy" } }
      }
    },
    asignaciones: [],
    cohostEmails: [{ email: "co@flacso.edu.uy" }],
    invitados: [{ email: `invitado-${id}@example.org` }],
    eventosProveedor: [meetOk],
    ...extra
  };
}

function crearDb(instancias: unknown[], opciones: { reservas?: unknown[]; hosts?: unknown[] } = {}) {
  const escritura = vi.fn();
  const db = {
    instanciaSala: { findMany: vi.fn(async () => instancias), update: escritura },
    cuentaProveedor: {
      findMany: vi.fn(
        async () =>
          opciones.hosts ?? [
            {
              id: "h1",
              nombre: "Sala 01",
              emailOrganizador: "sala01@flacso.edu.uy",
              prioridad: 1,
              limiteConcurrente: 1
            }
          ]
      )
    },
    eventoProveedor: {
      findMany: vi.fn(async () => opciones.reservas ?? []),
      update: escritura,
      create: escritura
    },
    auditoria: { create: escritura },
    $transaction: escritura
  } as unknown as PrismaClient;
  return { db, escritura };
}

describe("vista previa de la migración por serie", () => {
  it("niega el acceso a quien no es administrador", async () => {
    const { db, escritura } = crearDb([]);
    await expect(obtenerVistaPreviaMigracionZoomPorSerie(db, docente, ahora)).rejects.toMatchObject({
      status: 403
    });
    expect(escritura).not.toHaveBeenCalled();
  });

  it("agrupa los encuentros por serie y propone una sola sala para todos sus horarios", async () => {
    const { db, escritura } = crearDb([
      instancia("a", 10, "s1"),
      instancia("b", 11, "s1"),
      instancia("c", 12, "s1")
    ]);
    const vista = await obtenerVistaPreviaMigracionZoomPorSerie(db, admin, ahora);

    expect(vista.modo).toBe("SERIE");
    expect(vista.filas).toHaveLength(1);
    const [fila] = vista.filas;
    expect(fila).toMatchObject({
      titulo: "Clase s1",
      programa: "Maestría",
      estado: "MIGRABLE",
      cambioEnlace: true,
      hostZoom: { id: "h1", nombre: "Sala 01" }
    });
    expect(fila.encuentros.map(({ id }) => id)).toEqual(["a", "b", "c"]);
    expect(fila.encuentros.every(({ migra }) => migra)).toBe(true);
    expect(vista.conteos).toMatchObject({ MIGRABLE: 1, SIN_SALA: 0 });
    expect(escritura).not.toHaveBeenCalled();
  });

  it("reúne a los destinatarios de todos los encuentros sin repetir", async () => {
    const { db } = crearDb([instancia("a", 10, "s1"), instancia("b", 11, "s1")]);
    const [fila] = (await obtenerVistaPreviaMigracionZoomPorSerie(db, admin, ahora)).filas;
    expect(fila.destinatarios).toEqual([
      "admin@flacso.edu.uy",
      "co@flacso.edu.uy",
      "doc@flacso.edu.uy",
      "invitado-a@example.org",
      "invitado-b@example.org"
    ]);
  });

  it("dos series simultáneas compiten por la misma sala: una migrable y la otra sin sala", async () => {
    const { db } = crearDb([instancia("a", 10, "s1"), instancia("b", 10, "s2")]);
    const vista = await obtenerVistaPreviaMigracionZoomPorSerie(db, admin, ahora);
    expect(vista.conteos).toMatchObject({ MIGRABLE: 1, SIN_SALA: 1 });
  });

  it("una serie con una excepción solo en algunos encuentros queda en revisión y sin destinatarios", async () => {
    const { db } = crearDb([
      instancia("a", 10, "s1", { conservarGoogleMeet: true, motivoConservarGoogleMeet: "Externo" }),
      instancia("b", 11, "s1")
    ]);
    const [fila] = (await obtenerVistaPreviaMigracionZoomPorSerie(db, admin, ahora)).filas;
    expect(fila).toMatchObject({ estado: "REVISAR", hostZoom: null, cambioEnlace: false, destinatarios: [] });
    expect(fila.encuentros.find(({ id }) => id === "a")).toMatchObject({
      conservarEnMeet: true,
      motivoExcepcion: "Externo"
    });
  });

  it("una serie cuyos encuentros en Zoom comparten reunión se migra en la misma sala", async () => {
    const zoomCompartido = {
      joinUrl: "https://flacso.zoom.us/j/1",
      externalEventId: "1",
      estadoIntegracion: "SINCRONIZADA",
      operacionPendiente: null,
      cuentaProveedor: { emailOrganizador: "sala02@flacso.edu.uy" },
      proveedor: { tipo: "ZOOM" },
      reunionProveedorId: "reunion-1",
      cuentaProveedorId: "h2"
    };
    const hosts = [
      {
        id: "h1",
        nombre: "Sala 01",
        emailOrganizador: "sala01@flacso.edu.uy",
        prioridad: 1,
        limiteConcurrente: 1
      },
      {
        id: "h2",
        nombre: "Sala 02",
        emailOrganizador: "sala02@flacso.edu.uy",
        prioridad: 2,
        limiteConcurrente: 1
      }
    ];
    const { db } = crearDb(
      [
        instancia("z", 10, "s1", { proveedorActivoTipo: "ZOOM", eventosProveedor: [meetOk, zoomCompartido] }),
        instancia("a", 11, "s1")
      ],
      { hosts }
    );
    const [fila] = (await obtenerVistaPreviaMigracionZoomPorSerie(db, admin, ahora)).filas;
    expect(fila).toMatchObject({ estado: "MIGRABLE", hostZoom: { id: "h2" } });
    expect(fila.encuentros.find(({ id }) => id === "z")).toMatchObject({ proveedor: "ZOOM", migra: false });
    expect(fila.encuentros.find(({ id }) => id === "a")).toMatchObject({
      proveedor: "GOOGLE_MEET",
      migra: true
    });
  });

  it("las reservas Zoom de otras reuniones se respetan y las de la propia serie no cuentan como colisión", async () => {
    const reservaAjena = {
      cuentaProveedorId: "h1",
      instanciaSalaId: "otra",
      instancia: {
        inicioProgramadoAt: new Date("2026-11-10T12:00:00Z"),
        finProgramadoAt: new Date("2026-11-10T13:00:00Z")
      }
    };
    const ajena = crearDb([instancia("a", 10, "s1")], { reservas: [reservaAjena] });
    expect((await obtenerVistaPreviaMigracionZoomPorSerie(ajena.db, admin, ahora)).conteos.SIN_SALA).toBe(1);

    const propia = crearDb([instancia("a", 10, "s1")], {
      reservas: [{ ...reservaAjena, instanciaSalaId: "a" }]
    });
    expect((await obtenerVistaPreviaMigracionZoomPorSerie(propia.db, admin, ahora)).conteos.MIGRABLE).toBe(1);
  });
});
