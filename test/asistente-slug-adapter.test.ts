import { describe, expect, it, vi } from "vitest";
import { crearSlugAsistenteDisponible } from "../src/modules/asistencia/asistente-slug.adapter";

describe("slug persistente de asistentes", () => {
  it("usa solamente el nombre cuando esta disponible", async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    await expect(
      crearSlugAsistenteDisponible(
        {
          asistenteTecnico: { findUnique }
        } as never,
        "Iván Arriola",
        "ivan.arriola.t"
      )
    ).resolves.toBe("ivan-arriola");
  });

  it("agrega un sufijo estable cuando el nombre ya esta ocupado", async () => {
    const findUnique = vi.fn().mockResolvedValue({ usuarioId: "otro-usuario" });
    await expect(
      crearSlugAsistenteDisponible(
        {
          asistenteTecnico: { findUnique }
        } as never,
        "Ana Pérez",
        "ana.perez.2"
      )
    ).resolves.toBe("ana-perez--ana-perez-2");
  });
});
