import { describe, expect, it } from "vitest";
import {
  configuracionGoogleWorkspaceSchema,
  mensajeErrorGoogleWorkspace,
  puedeConfigurarGoogleWorkspace,
  pruebaConfiguracionGoogleWorkspaceSchema,
  seccionConfiguracionGoogleWorkspaceSchema
} from "../src/modules/configuracion/google-workspace.domain";

describe("configuracion funcional de Google Workspace", () => {
  it("reserva la configuracion a Administracion activa", () => {
    expect(
      puedeConfigurarGoogleWorkspace({
        id: "admin",
        rol: "ADMINISTRACION",
        activo: true
      })
    ).toBe(true);
    expect(
      puedeConfigurarGoogleWorkspace({
        id: "admin-inactivo",
        rol: "ADMINISTRACION",
        activo: false
      })
    ).toBe(false);
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

  it("rechaza una clave privada que no tenga formato PEM", () => {
    expect(() => configuracionGoogleWorkspaceSchema.parse({
      serviceAccountEmail: "service@project.iam.gserviceaccount.com",
      privateKey: "no-es-pem",
      serviceAccountSubject: "usuario@flacso.edu.uy",
      driveDestinationId: "drive-folder",
      activa: true
    })).toThrow("formato PEM");
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
    expect(
      seccionConfiguracionGoogleWorkspaceSchema.parse({
        seccion: "ESTADO",
        activa: false
      })
    ).toEqual({ seccion: "ESTADO", activa: false });
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
      credentialId: "principal",
      serviceAccountEmail: "service@project.iam.gserviceaccount.com",
      privateKey: undefined
    });
  });

  it("acepta credenciales historicas y rechaza ids ajenos al espacio reservado", () => {
    expect(seccionConfiguracionGoogleWorkspaceSchema.parse({
      seccion: "CREDENCIAL",
      credentialId: "legacy:old-project",
      serviceAccountEmail: "old@project.iam.gserviceaccount.com",
      privateKey: "-----BEGIN PRIVATE KEY-----\ncontenido\n-----END PRIVATE KEY-----"
    }).credentialId).toBe("legacy:old-project");

    expect(() => seccionConfiguracionGoogleWorkspaceSchema.parse({
      seccion: "CREDENCIAL",
      credentialId: "otra-configuracion",
      serviceAccountEmail: "old@project.iam.gserviceaccount.com",
      privateKey: "-----BEGIN PRIVATE KEY-----\ncontenido\n-----END PRIVATE KEY-----"
    })).toThrow("Identificador de credencial inválido");
  });

  it("acepta la prueba especifica de scopes", () => {
    expect(pruebaConfiguracionGoogleWorkspaceSchema.parse({ objetivo: "SCOPES" }))
      .toEqual({ objetivo: "SCOPES" });
  });

  it("acepta probar una credencial Legacy concreta", () => {
    expect(pruebaConfiguracionGoogleWorkspaceSchema.parse({
      objetivo: "CREDENCIAL",
      credentialId: "legacy:old-project"
    })).toEqual({ objetivo: "CREDENCIAL", credentialId: "legacy:old-project" });
  });

  it("explica como corregir unauthorized_client", () => {
    const message = mensajeErrorGoogleWorkspace(
      new Error("unauthorized_client: Client is unauthorized")
    );
    expect(message).toContain("ID numérico");
    expect(message).toContain("scopes requeridos");
  });

  it("explica como corregir invalid_client", () => {
    const message = mensajeErrorGoogleWorkspace(
      new Error("invalid_client: The OAuth client was not found")
    );
    expect(message).toContain("cuenta de servicio");
    expect(message).toContain("email y la clave privada");
  });

  it("explica cuando Google deniega la delegación del dominio", () => {
    expect(mensajeErrorGoogleWorkspace(new Error("Delegation denied for user")))
      .toContain("Google denegó la delegación del dominio");
  });

  it("distingue scopes insuficientes de permisos de recursos", () => {
    const scopesMessage = mensajeErrorGoogleWorkspace(
      new Error("Request had insufficient authentication scopes.")
    );
    expect(scopesMessage).toContain("Faltan scopes OAuth");
    expect(scopesMessage).toContain("Validar scopes");

    const permissionMessage = mensajeErrorGoogleWorkspace(
      new Error("insufficient permission to access resource")
    );
    expect(permissionMessage).toContain("operación no tiene permisos suficientes");
  });

  it("conserva errores desconocidos y usa fallback para mensajes vacíos", () => {
    expect(mensajeErrorGoogleWorkspace(new Error("fallo específico"))).toBe("fallo específico");
    expect(mensajeErrorGoogleWorkspace("")).toBe("No se pudo completar la prueba con Google.");
  });
});
