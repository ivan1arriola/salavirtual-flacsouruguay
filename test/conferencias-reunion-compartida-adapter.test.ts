import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { crearPrismaConferenciasRepository } from "../src/modules/conferencias/infrastructure/prisma/prisma-conferencias-repository.adapter";
import type { ClaimInfo } from "../src/modules/conferencias/ports";

const ahora = new Date("2026-11-10T12:00:00Z");

const claim: ClaimInfo = {
  event: {
    id: "evento-1",
    proveedorTipo: "ZOOM",
    externalEventId: null,
    solicitudSalaId: "sol-1",
    organizerEmail: "sala01@flacso.edu.uy",
    reunionProveedorId: "reunion-1",
    serieClave: "serie-abc",
    request: {
      titulo: "Seminario",
      inicio: new Date("2026-11-12T12:00:00Z"),
      fin: new Date("2026-11-12T14:00:00Z"),
      timezone: "America/Montevideo",
      calendarId: "sala01@flacso.edu.uy",
      calendarEventId: "evt-1"
    }
  },
  operacion: "PROVISIONAR",
  token: "claim-actual",
  at: new Date("2026-11-10T11:00:00Z")
};

function crearRepo(db: unknown) {
  return crearPrismaConferenciasRepository({
    db: db as PrismaClient,
    descifrarConfiguracion: (valor) => valor
  });
}

/** `$transaction` ejecuta el callback con el mismo doble. */
const conTransaccion = <T extends Record<string, unknown>>(tx: T) => ({
  ...tx,
  $transaction: async (cb: (t: T) => unknown) => cb(tx)
});

function dobleReclamo(opciones: {
  reunionDelEvento?: string | null;
  actualizados: number;
  estado: string;
  externalId?: string | null;
  joinUrl?: string | null;
  eventosSerie?: readonly { instancia: { id: string; inicioProgramadoAt: Date; finProgramadoAt: Date } }[];
}) {
  const updateMany = vi.fn(async (_arg: { where: unknown; data: unknown }) => ({ count: 0 }));
  updateMany.mockImplementation(async ({ where }: { where: unknown }) => {
    const esReinicio =
      JSON.stringify(where).includes('"ELIMINADA"') && !JSON.stringify(where).includes('"OR"');
    return { count: esReinicio ? 0 : opciones.actualizados };
  });
  const tx = {
    $executeRaw: vi.fn(async () => 1),
    eventoProveedor: {
      findUnique: vi.fn(async () =>
        opciones.reunionDelEvento === undefined
          ? { reunionProveedorId: "reunion-1" }
          : opciones.reunionDelEvento
            ? { reunionProveedorId: opciones.reunionDelEvento }
            : { reunionProveedorId: null }
      ),
      findMany: vi.fn(
        async () =>
          opciones.eventosSerie ?? [
            {
              instancia: {
                id: "i-1",
                inicioProgramadoAt: new Date("2026-11-12T12:00:00Z"),
                finProgramadoAt: new Date("2026-11-12T14:00:00Z")
              }
            }
          ]
      )
    },
    reunionProveedor: {
      updateMany,
      findUnique: vi.fn(async () => ({
        estadoCreacion: opciones.estado,
        externalId: opciones.externalId ?? null,
        joinUrl: opciones.joinUrl ?? null
      }))
    }
  };
  return { tx, db: conTransaccion(tx), updateMany };
}

describe("reunión compartida: reclamo de creación", () => {
  it("devuelve null si el evento no tiene reunión compartida", async () => {
    const { db } = dobleReclamo({ reunionDelEvento: null, actualizados: 0, estado: "PENDIENTE" });
    expect(await crearRepo(db).reclamarCreacionReunionCompartida!("evento-1", "t1", ahora)).toBeNull();
  });

  it("reclama con una actualización condicional que acepta PENDIENTE, reclamo vencido y el propio token", async () => {
    const eventosSerie = [
      {
        instancia: {
          id: "inst-1",
          inicioProgramadoAt: new Date("2026-11-12T12:00:00Z"),
          finProgramadoAt: new Date("2026-11-12T14:00:00Z")
        }
      },
      {
        instancia: {
          id: "inst-2",
          inicioProgramadoAt: new Date("2026-11-19T12:00:00Z"),
          finProgramadoAt: new Date("2026-11-19T14:00:00Z")
        }
      }
    ];
    const { db, updateMany } = dobleReclamo({ actualizados: 1, estado: "CREANDO", eventosSerie });
    const resultado = await crearRepo(db).reclamarCreacionReunionCompartida!("evento-1", "t1", ahora);
    expect(resultado).toMatchObject({
      reunionId: "reunion-1",
      resultado: "RECLAMADA",
      instanciasHorarios: [
        { id: "inst-1", inicio: new Date("2026-11-12T12:00:00Z"), fin: new Date("2026-11-12T14:00:00Z") },
        { id: "inst-2", inicio: new Date("2026-11-19T12:00:00Z"), fin: new Date("2026-11-19T14:00:00Z") }
      ]
    });
    const reclamo = updateMany.mock.calls
      .map(([arg]) => JSON.stringify(arg))
      .find((texto) => texto.includes('"reclamoToken":"t1"') && texto.includes('"CREANDO"'));
    expect(reclamo).toBeDefined();
    expect(reclamo).toContain('"PENDIENTE"');
    expect(reclamo).toContain('"reclamoAt":{"lt"');
    const vencimiento = Date.parse(JSON.parse(reclamo!).where.OR[1].reclamoAt.lt);
    expect(ahora.getTime() - vencimiento).toBe(5 * 60_000);
  });

  it("si otro worker tiene un reclamo vigente responde EN_CURSO_POR_OTRO", async () => {
    const { db } = dobleReclamo({ actualizados: 0, estado: "CREANDO" });
    const resultado = await crearRepo(db).reclamarCreacionReunionCompartida!("evento-1", "t2", ahora);
    expect(resultado).toMatchObject({ resultado: "EN_CURSO_POR_OTRO", externalId: null });
  });

  it("si la reunión ya está creada responde YA_CREADA con su enlace", async () => {
    const { db } = dobleReclamo({
      actualizados: 0,
      estado: "CREADA",
      externalId: "serie-1",
      joinUrl: "https://zoom.us/j/serie-1"
    });
    const resultado = await crearRepo(db).reclamarCreacionReunionCompartida!("evento-1", "t2", ahora);
    expect(resultado).toMatchObject({
      resultado: "YA_CREADA",
      externalId: "serie-1",
      joinUrl: "https://zoom.us/j/serie-1"
    });
  });

  it("una reunión eliminada vuelve a PENDIENTE sin ID antes de reclamarse (nuevo encuentro tras eliminarla)", async () => {
    const { db, updateMany } = dobleReclamo({ actualizados: 1, estado: "CREANDO" });
    await crearRepo(db).reclamarCreacionReunionCompartida!("evento-1", "t1", ahora);
    const primero = JSON.parse(JSON.stringify(updateMany.mock.calls[0][0]));
    expect(primero.where.estadoCreacion).toBe("ELIMINADA");
    expect(primero.data).toMatchObject({ estadoCreacion: "PENDIENTE", externalId: null, joinUrl: null });
  });
});

describe("reunión compartida: escrituras protegidas por el token del reclamo", () => {
  it("el ID temprano solo se guarda si el token sigue siendo el del reclamo", async () => {
    const updateMany = vi.fn(async (_arg: unknown) => ({ count: 0 }));
    const db = { reunionProveedor: { updateMany } };
    await expect(crearRepo(db).registrarExternalIdTemprano!("reunion-1", "viejo", "serie-1")).rejects.toThrow(
      /reclamo/
    );
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "reunion-1", estadoCreacion: "CREANDO", reclamoToken: "viejo" },
        data: { externalId: "serie-1" }
      })
    );
  });

  it("guardar la reunión creada la pasa a CREADA y copia el enlace a los eventos que todavía no lo tienen", async () => {
    const reunion = { updateMany: vi.fn(async (_arg: unknown) => ({ count: 1 })) };
    const evento = { updateMany: vi.fn(async (_arg: unknown) => ({ count: 2 })) };
    const db = conTransaccion({ reunionProveedor: reunion, eventoProveedor: evento });
    await crearRepo(db).guardarReunionCompartida!("reunion-1", "t1", {
      externalId: "serie-1",
      joinUrl: "https://zoom.us/j/serie-1"
    });
    expect(reunion.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "reunion-1", estadoCreacion: "CREANDO", reclamoToken: "t1" },
        data: expect.objectContaining({
          estadoCreacion: "CREADA",
          externalId: "serie-1",
          joinUrl: "https://zoom.us/j/serie-1",
          reclamoToken: null,
          reclamoAt: null
        })
      })
    );
    expect(evento.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { reunionProveedorId: "reunion-1", externalEventId: null },
        data: expect.objectContaining({
          externalEventId: "serie-1",
          codigoReunion: "serie-1",
          joinUrl: "https://zoom.us/j/serie-1"
        })
      })
    );
  });

  it("con otro token no guarda nada ni copia el enlace", async () => {
    const reunion = { updateMany: vi.fn(async (_arg: unknown) => ({ count: 0 })) };
    const evento = { updateMany: vi.fn(async (_arg: unknown) => ({ count: 0 })) };
    const db = conTransaccion({ reunionProveedor: reunion, eventoProveedor: evento });
    await expect(
      crearRepo(db).guardarReunionCompartida!("reunion-1", "otro", { externalId: "x", joinUrl: "y" })
    ).rejects.toThrow(/reclamo/);
    expect(evento.updateMany).not.toHaveBeenCalled();
  });

  it("vincular el evento reclamado es idempotente y solo con su claim vigente", async () => {
    const updateMany = vi.fn(async (_arg: unknown) => ({ count: 1 }));
    const db = { eventoProveedor: { updateMany } };
    await crearRepo(db).vincularEventoReunionCompartida!(claim, {
      externalId: "serie-1",
      joinUrl: "https://zoom.us/j/serie-1"
    });
    const arg = JSON.parse(JSON.stringify(updateMany.mock.calls[0][0]));
    expect(arg.where).toMatchObject({
      id: "evento-1",
      reclamoIntegracionToken: "claim-actual",
      operacionPendiente: "PROVISIONAR"
    });
    expect(arg.where.OR).toEqual([{ externalEventId: null }, { externalEventId: "serie-1" }]);
    expect(arg.data).toMatchObject({ externalEventId: "serie-1", codigoReunion: "serie-1" });
  });

  it("vincular con un claim caducado falla", async () => {
    const db = { eventoProveedor: { updateMany: vi.fn(async (_arg: unknown) => ({ count: 0 })) } };
    await expect(
      crearRepo(db).vincularEventoReunionCompartida!(claim, { externalId: "x", joinUrl: "y" })
    ).rejects.toThrow(/claim/);
  });

  it("liberar el reclamo del evento no toca su operación pendiente", async () => {
    const updateMany = vi.fn(async (_arg: unknown) => ({ count: 1 }));
    const db = { eventoProveedor: { updateMany } };
    await crearRepo(db).liberarReclamoEvento!(claim);
    const arg = JSON.parse(JSON.stringify(updateMany.mock.calls[0][0]));
    expect(arg.where).toMatchObject({ id: "evento-1", reclamoIntegracionToken: "claim-actual" });
    expect(arg.data).toEqual({ reclamoIntegracionAt: null, reclamoIntegracionToken: null });
  });
});

describe("reunión compartida: usos y eliminación", () => {
  it("lista los usos con el estado y el fin de cada encuentro", async () => {
    const fin = new Date("2026-11-12T14:00:00Z");
    const db = {
      reunionProveedor: {
        findUnique: vi.fn(async () => ({
          externalId: "serie-1",
          estadoCreacion: "CREADA",
          eventos: [
            { id: "e1", instancia: { estado: "PROGRAMADA", finProgramadoAt: fin } },
            { id: "e2", instancia: { estado: "CANCELADA", finProgramadoAt: fin } }
          ]
        }))
      }
    };
    const estado = await crearRepo(db).usosDeReunionCompartida!("reunion-1");
    expect(estado).toEqual({
      externalId: "serie-1",
      eliminada: false,
      usos: [
        { eventoProveedorId: "e1", instanciaEstado: "PROGRAMADA", instanciaFin: fin },
        { eventoProveedorId: "e2", instanciaEstado: "CANCELADA", instanciaFin: fin }
      ]
    });
  });

  it("una reunión inexistente no tiene usos y cuenta como eliminada", async () => {
    const db = { reunionProveedor: { findUnique: vi.fn(async () => null) } };
    expect(await crearRepo(db).usosDeReunionCompartida!("x")).toEqual({
      usos: [],
      externalId: null,
      eliminada: true
    });
  });

  it("marcar como eliminada es condicional y devuelve true solo la primera vez", async () => {
    const updateMany = vi.fn().mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    const repo = crearRepo({ reunionProveedor: { updateMany } });
    expect(await repo.marcarReunionCompartidaEliminada!("reunion-1")).toBe(true);
    expect(await repo.marcarReunionCompartidaEliminada!("reunion-1")).toBe(false);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "reunion-1", estadoCreacion: { not: "ELIMINADA" } } })
    );
  });
});

describe("reclamarEvento con reunión compartida", () => {
  it("informa la reunión compartida y la clave de serie del evento reclamado", async () => {
    const evento = {
      id: "evento-1",
      operacionPendiente: "PROVISIONAR",
      reclamoIntegracionAt: null,
      reclamoIntegracionToken: null,
      updatedAt: new Date(),
      externalEventId: null,
      payloadUltimo: null,
      reunionProveedorId: "reunion-1",
      reunionProveedor: { serieClave: "serie-abc" },
      proveedor: { tipo: "ZOOM" },
      cuentaProveedor: { emailOrganizador: "sala01@flacso.edu.uy" },
      instancia: {
        solicitudSalaId: "sol-1",
        descripcion: null,
        timezone: "America/Montevideo",
        inicioProgramadoAt: new Date("2026-11-12T12:00:00Z"),
        finProgramadoAt: new Date("2026-11-12T14:00:00Z"),
        requiereAsistenciaTecnica: false,
        requiereGrabacion: false,
        cohosts: [],
        cohostEmails: [],
        solicitud: { titulo: "Seminario", descripcion: null }
      }
    };
    const tx = {
      $executeRaw: vi.fn(async () => 1),
      eventoProveedor: {
        findUnique: vi.fn(async () => evento),
        updateMany: vi.fn(async () => ({ count: 1 }))
      }
    };
    const reclamado = await crearRepo(conTransaccion(tx)).reclamarEvento("evento-1");
    expect(reclamado?.event).toMatchObject({
      reunionProveedorId: "reunion-1",
      serieClave: "serie-abc",
      proveedorTipo: "ZOOM"
    });
    expect(JSON.stringify(tx.eventoProveedor.findUnique.mock.calls[0])).toContain("reunionProveedor");
  });
});
