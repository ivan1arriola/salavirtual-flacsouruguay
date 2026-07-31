import { describe, expect, it } from "vitest";
import {
  configuracionGoogleWorkspaceSchema,
  puedeConfigurarGoogleWorkspace
} from "../src/modules/configuracion/google-workspace.domain";

describe("configuracion funcional de Google Workspace", () => {
  it("reserva la configuracion a Administracion", () => {
    expect(
      puedeConfigurarGoogleWorkspace({
        id: "admin",
        rol: "ADMINISTRACION",
        activo: true
      })
    ).toBe(true);
    expect(
      puedeConfigurarGoogleWorkspace({
        id: "docente",
        rol: "DOCENTE",
        activo: true
      })
    ).toBe(false);
  });

  it("normaliza private keys serializadas con saltos escapados", () => {
    const parsed = configuracionGoogleWorkspaceSchema.parse({
      serviceAccountEmail: "service@project.iam.gserviceaccount.com",
      privateKey: "-----BEGIN PRIVATE KEY-----\\ncontenido\\n-----END PRIVATE KEY-----",
      serviceAccountSubject: "usuario@flacso.edu.uy",
      driveDestinationId: "drive-folder",
      activa: true
    });

    expect(parsed.privateKey).toContain("\ncontenido\n");
  });
});
