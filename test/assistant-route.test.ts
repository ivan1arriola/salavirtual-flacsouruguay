import { describe, expect, it } from "vitest";
import {
  assistantPathSegment,
  assistantSlug,
  userIdFromAssistantPath,
} from "../src/lib/ui/assistant-route";

describe("rutas de asistentes", () => {
  it("genera una ruta legible sin repetir el identificador", () => {
    const segment = assistantPathSegment("Iván Arriola", "ivan.arriola.t");
    expect(segment).toBe("ivan-arriola");
    expect(assistantSlug("Iván Arriola")).toBe("ivan-arriola");
  });

  it("agrega el identificador solo para desambiguar nombres repetidos", () => {
    const segment = assistantPathSegment("Iván Arriola", "ivan.arriola.t", true);
    expect(segment).toBe("ivan-arriola--ivan.arriola.t");
    expect(userIdFromAssistantPath(segment)).toBe("ivan.arriola.t");
  });

  it("mantiene compatibilidad con las rutas anteriores", () => {
    expect(userIdFromAssistantPath("ivan.arriola.t")).toBe("ivan.arriola.t");
  });
});
