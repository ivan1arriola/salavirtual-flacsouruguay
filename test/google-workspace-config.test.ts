import { describe, expect, it } from "vitest";
import {
  configuracionGoogleWorkspaceSchema,
  puedeConfigurarGoogleWorkspace,
  seccionConfiguracionGoogleWorkspaceSchema
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

  it("valida cada seccion sin exigir valores de las otras", () => {
    expect(
      seccionConfiguracionGoogleWorkspaceSchema.parse({
        seccion: "DELEGACION",
        serviceAccountSubject: "usuario@flacso.edu.uy"
      })
    ).toEqual({
      seccion: "DELEGACION",
      serviceAccountSubject: "usuario@flacso.edu.uy"
    });
    expect(
      seccionConfiguracionGoogleWorkspaceSchema.parse({
        seccion: "DRIVE",
        driveDestinationId: "drive-folder"
      })
    ).toEqual({ seccion: "DRIVE", driveDestinationId: "drive-folder" });
  });

  it("permite conservar una clave privada ya configurada sin exponerla", () => {
    expect(
      seccionConfiguracionGoogleWorkspaceSchema.parse({
        seccion: "CREDENCIAL",
        serviceAccountEmail: "service@project.iam.gserviceaccount.com",
        privateKey: ""
      })
    ).toEqual({
      seccion: "CREDENCIAL",
      serviceAccountEmail: "service@project.iam.gserviceaccount.com",
      privateKey: undefined
    });
  });
});
