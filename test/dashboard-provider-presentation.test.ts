import { describe, expect, it } from "vitest";
import { getMeetingProviderPresentation } from "../src/modules/dashboard/meeting-provider.presentation";

describe("presentación del proveedor de reuniones", () => {
  it("nombra Zoom y no presenta cohosts para una reunión Zoom", () => {
    expect(getMeetingProviderPresentation("ZOOM")).toEqual({
      name: "Zoom",
      joinLabel: "Entrar a Zoom",
      pendingLinkLabel: "Enlace de Zoom pendiente",
      supportsCohosts: false,
    });
  });

  it("conserva los cohosts como capacidad exclusiva de Google Meet", () => {
    expect(getMeetingProviderPresentation("GOOGLE_MEET")).toEqual({
      name: "Google Meet",
      joinLabel: "Entrar a Google Meet",
      pendingLinkLabel: "Enlace de Google Meet pendiente",
      supportsCohosts: true,
    });
  });

  it("mantiene un mensaje neutral si todavía no hay proveedor activo", () => {
    expect(getMeetingProviderPresentation(null)).toEqual({
      name: "videollamada",
      joinLabel: "Entrar a la videollamada",
      pendingLinkLabel: "Enlace de la videollamada pendiente",
      supportsCohosts: false,
    });
  });
});
