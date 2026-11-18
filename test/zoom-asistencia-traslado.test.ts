import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import { trasladarAsistenciaAlEncuentro } from "../src/modules/archivos/infrastructure/prisma/zoom-asistencia-traslado";

const fila = (id: string, clave: string, humano = false) => ({
  id,
  claveParticipante: clave,
  estadoConciliacion: humano ? "CONCILIADO" : "SIN_CONCILIAR",
  invitadoReunionId: humano ? "inv1" : null,
  esExterno: null,
  notasOperador: null
});

function tx(origen: ReturnType<typeof fila>[], destino: ReturnType<typeof fila>[]) {
  const r = {
    findMany: vi.fn(async ({ where }: { where: { claveAmbito: string } }) =>
      where.claveAmbito.startsWith("ocurrencia:") ? origen : destino
    ),
    updateMany: vi.fn(),
    update: vi.fn(),
    delete: vi.fn()
  };
  return { r, cliente: { registroAsistenciaZoom: r } as unknown as Prisma.TransactionClient };
}

describe("trasladarAsistenciaAlEncuentro", () => {
  it("mueve al encuentro los registros que no existen allí", async () => {
    const { r, cliente } = tx([fila("a", "id:1")], []);
    await trasladarAsistenciaAlEncuentro(cliente, "o1", "e1");
    expect(r.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["a"] } },
      data: { claveAmbito: "evento:e1", eventoProveedorId: "e1" }
    });
  });

  it("colisión sin decisiones humanas: descarta la fila previa", async () => {
    const { r, cliente } = tx([fila("a", "id:1")], [fila("d", "id:1")]);
    await trasladarAsistenciaAlEncuentro(cliente, "o1", "e1");
    expect(r.delete).toHaveBeenCalledWith({ where: { id: "a" } });
  });

  it("colisión con decisiones solo en la fila previa: las copia al registro del encuentro", async () => {
    const { r, cliente } = tx([fila("a", "id:1", true)], [fila("d", "id:1")]);
    await trasladarAsistenciaAlEncuentro(cliente, "o1", "e1");
    expect(r.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "d" },
        data: expect.objectContaining({ invitadoReunionId: "inv1" })
      })
    );
    expect(r.delete).toHaveBeenCalledWith({ where: { id: "a" } });
  });

  it("decisiones en ambas: conserva la previa visible en el encuentro, sin borrar nada", async () => {
    const { r, cliente } = tx([fila("a", "id:1", true)], [fila("d", "id:1", true)]);
    await trasladarAsistenciaAlEncuentro(cliente, "o1", "e1");
    expect(r.delete).not.toHaveBeenCalled();
    expect(r.update).toHaveBeenCalledWith({
      where: { id: "a" },
      data: { claveAmbito: "evento:e1", eventoProveedorId: "e1", claveParticipante: "id:1#previo-a" }
    });
  });
});
