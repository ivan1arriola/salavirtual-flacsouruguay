import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import { trasladarAsistenciaAlEncuentro } from "../src/modules/archivos/infrastructure/prisma/zoom-asistencia-traslado";

const fila = (id: string, clave: string, humano = false) => ({
  id,
  claveParticipante: clave,
  version: 3,
  estadoConciliacion: humano ? "CONCILIADO" : "SIN_CONCILIAR",
  invitadoReunionId: humano ? "inv1" : null,
  esExterno: null,
  notasOperador: null,
});

function tx(origen: ReturnType<typeof fila>[], destino: ReturnType<typeof fila>[], conteo = 1) {
  const r = {
    findMany: vi.fn(async ({ where }: { where: { claveAmbito: string } }) =>
      where.claveAmbito.startsWith("ocurrencia:") ? origen : destino,
    ),
    updateMany: vi.fn(async () => ({ count: conteo })),
    deleteMany: vi.fn(async () => ({ count: conteo })),
  };
  const ocurrencia = { updateMany: vi.fn() };
  const raw = vi.fn();
  return {
    r,
    ocurrencia,
    raw,
    cliente: {
      $executeRaw: raw,
      registroAsistenciaZoom: r,
      ocurrenciaArchivoZoom: ocurrencia,
    } as unknown as Prisma.TransactionClient,
  };
}

describe("trasladarAsistenciaAlEncuentro", () => {
  it("toma el bloqueo de asistencia del origen y del destino antes de leer", async () => {
    const { r, raw, cliente } = tx([], []);
    await trasladarAsistenciaAlEncuentro(cliente, "o1", "e1");
    expect(raw).toHaveBeenCalledTimes(2);
    expect(raw.mock.invocationCallOrder[1]!).toBeLessThan(r.findMany.mock.invocationCallOrder[0]!);
  });

  it("mueve al encuentro los registros que no existen allí", async () => {
    const { r, ocurrencia, cliente } = tx([fila("a", "id:1")], []);
    await trasladarAsistenciaAlEncuentro(cliente, "o1", "e1");
    expect(r.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["a"] } },
      data: { claveAmbito: "evento:e1", eventoProveedorId: "e1" },
    });
    expect(ocurrencia.updateMany).not.toHaveBeenCalled();
  });

  it("colisión sin decisiones: descarta la previa solo si nadie la editó (versión) y marca recálculo", async () => {
    const { r, ocurrencia, cliente } = tx([fila("a", "id:1")], [fila("d", "id:1")]);
    await trasladarAsistenciaAlEncuentro(cliente, "o1", "e1");
    expect(r.deleteMany).toHaveBeenCalledWith({
      where: { id: "a", version: 3, estadoConciliacion: "SIN_CONCILIAR", notasOperador: null },
    });
    expect(ocurrencia.updateMany).toHaveBeenCalledWith({
      where: { id: "o1" },
      data: { estadoAsistencia: "PENDIENTE" },
    });
  });

  it("si la fila previa fue editada tras leerla, no se borra: queda visible como previo", async () => {
    const { r, cliente } = tx([fila("a", "id:1")], [fila("d", "id:1")], 0);
    await trasladarAsistenciaAlEncuentro(cliente, "o1", "e1");
    expect(r.updateMany).toHaveBeenCalledWith({
      where: { id: "a" },
      data: {
        claveAmbito: "evento:e1",
        eventoProveedorId: "e1",
        claveParticipante: "id:1#previo-a",
      },
    });
  });

  it("decisiones solo en la previa: las copia al registro del encuentro con control de versión", async () => {
    const { r, cliente } = tx([fila("a", "id:1", true)], [fila("d", "id:1")]);
    await trasladarAsistenciaAlEncuentro(cliente, "o1", "e1");
    expect(r.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "d", version: 3 },
        data: expect.objectContaining({ invitadoReunionId: "inv1" }),
      }),
    );
    expect(r.deleteMany).toHaveBeenCalledWith({ where: { id: "a", version: 3 } });
  });

  it("decisiones en ambas: conserva la previa visible en el encuentro, sin borrar nada", async () => {
    const { r, cliente } = tx([fila("a", "id:1", true)], [fila("d", "id:1", true)]);
    await trasladarAsistenciaAlEncuentro(cliente, "o1", "e1");
    expect(r.deleteMany).not.toHaveBeenCalled();
    expect(r.updateMany).toHaveBeenCalledWith({
      where: { id: "a" },
      data: {
        claveAmbito: "evento:e1",
        eventoProveedorId: "e1",
        claveParticipante: "id:1#previo-a",
      },
    });
  });
});
