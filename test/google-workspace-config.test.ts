import { describe, expect, it } from "vitest";
import {
  configuracionGoogleWorkspaceSchema,
  mensajeErrorGoogleWorkspace,
  parseServiceAccountKeyJson,
  puedeConfigurarGoogleWorkspace,
  pruebaConfiguracionGoogleWorkspaceSchema,
  seccionConfiguracionGoogleWorkspaceSchema,
} from "../src/modules/configuracion/google-workspace.domain";
import { actualizarSeccionGoogleWorkspace } from "../src/modules/configuracion/google-workspace.service";

describe("configuracion funcional de Google Workspace", () => {
  it("reserva la configuracion a Administracion activa", () => {
    expect(
      puedeConfigurarGoogleWorkspace({
        id: "admin",
        rol: "ADMINISTRACION",
        activo: true,
      }),
    ).toBe(true);
    expect(
      puedeConfigurarGoogleWorkspace({
        id: "admin-inactivo",
        rol: "ADMINISTRACION",
        activo: false,
      }),
    ).toBe(false);
    expect(
      puedeConfigurarGoogleWorkspace({
        id: "docente",
        rol: "DOCENTE",
        activo: true,
      }),
    ).toBe(false);
  });

  it("normaliza private keys serializadas con saltos escapados", () => {
    const parsed = configuracionGoogleWorkspaceSchema.parse({
      serviceAccountEmail: "service@project.iam.gserviceaccount.com",
      privateKey: "-----BEGIN PRIVATE KEY-----\\ncontenido\\n-----END PRIVATE KEY-----",
      serviceAccountSubject: "usuario@flacso.edu.uy",
      driveDestinationId: "drive-folder",
      activa: true,
    });

    expect(parsed.privateKey).toContain("\ncontenido\n");
  });

  it("rechaza una clave privada que no tenga formato PEM", () => {
    expect(() =>
      configuracionGoogleWorkspaceSchema.parse({
        serviceAccountEmail: "service@project.iam.gserviceaccount.com",
        privateKey: "no-es-pem",
        serviceAccountSubject: "usuario@flacso.edu.uy",
        driveDestinationId: "drive-folder",
        activa: true,
      }),
    ).toThrow("formato PEM");
  });

  it("valida cada seccion sin exigir valores de las otras", () => {
    expect(
      seccionConfiguracionGoogleWorkspaceSchema.parse({
        seccion: "DELEGACION",
        serviceAccountSubject: "usuario@flacso.edu.uy",
      }),
    ).toEqual({
      seccion: "DELEGACION",
      serviceAccountSubject: "usuario@flacso.edu.uy",
    });
    expect(
      seccionConfiguracionGoogleWorkspaceSchema.parse({
        seccion: "DRIVE",
        driveDestinationId: "drive-folder",
      }),
    ).toEqual({ seccion: "DRIVE", driveDestinationId: "drive-folder" });
    expect(
      seccionConfiguracionGoogleWorkspaceSchema.parse({
        seccion: "ESTADO",
        activa: false,
      }),
    ).toEqual({ seccion: "ESTADO", activa: false });
  });

  const validServiceAccountJson = {
    type: "service_account",
    project_id: "flacso-zoom-app",
    private_key_id: "277f21b0dbd4da25eecb1433087ae4649dfd84f5",
    private_key:
      "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDDVofnfJgif882\n-----END PRIVATE KEY-----\n",
    client_email: "flacso-cuenta-servicio@flacso-zoom-app.iam.gserviceaccount.com",
    client_id: "112652356410959245168",
    auth_uri: "https://accounts.google.com/o/oauth2/auth",
    token_uri: "https://oauth2.googleapis.com/token",
  };

  it("acepta configurar credenciales exclusivamente mediante el JSON oficial de Google Cloud", () => {
    const parsed = seccionConfiguracionGoogleWorkspaceSchema.parse({
      seccion: "CREDENCIAL",
      serviceAccountJson: validServiceAccountJson,
    });
    if (parsed.seccion !== "CREDENCIAL") {
      throw new Error("Se esperaba seccion CREDENCIAL");
    }

    expect(parsed.seccion).toBe("CREDENCIAL");
    expect(parsed.credentialId).toBe("principal");
    expect(parsed.serviceAccountJson.client_email).toBe(
      "flacso-cuenta-servicio@flacso-zoom-app.iam.gserviceaccount.com",
    );
    expect(parsed.serviceAccountJson.project_id).toBe("flacso-zoom-app");
    expect(parsed.serviceAccountJson.client_id).toBe("112652356410959245168");
    expect(parsed.serviceAccountJson.private_key).toContain("-----BEGIN PRIVATE KEY-----");
  });

  it("acepta el JSON de la cuenta de servicio como string serializado", () => {
    const parsed = seccionConfiguracionGoogleWorkspaceSchema.parse({
      seccion: "CREDENCIAL",
      serviceAccountJson: JSON.stringify(validServiceAccountJson),
    });
    if (parsed.seccion !== "CREDENCIAL") {
      throw new Error("Se esperaba seccion CREDENCIAL");
    }

    expect(parsed.serviceAccountJson.client_email).toBe(
      "flacso-cuenta-servicio@flacso-zoom-app.iam.gserviceaccount.com",
    );
    expect(parsed.serviceAccountJson.client_id).toBe("112652356410959245168");
  });

  it("acepta credenciales historicas mediante JSON y rechaza ids ajenos al espacio reservado", () => {
    const parsed = seccionConfiguracionGoogleWorkspaceSchema.parse({
      seccion: "CREDENCIAL",
      credentialId: "legacy:old-project",
      serviceAccountJson: validServiceAccountJson,
    });
    if (parsed.seccion !== "CREDENCIAL") {
      throw new Error("Se esperaba seccion CREDENCIAL");
    }

    expect(parsed.credentialId).toBe("legacy:old-project");
    expect(parsed.serviceAccountJson.client_email).toBe(
      "flacso-cuenta-servicio@flacso-zoom-app.iam.gserviceaccount.com",
    );

    expect(() =>
      seccionConfiguracionGoogleWorkspaceSchema.parse({
        seccion: "CREDENCIAL",
        credentialId: "otra-configuracion",
        serviceAccountJson: validServiceAccountJson,
      }),
    ).toThrow("Identificador de credencial inválido");
  });

  it("rechaza configuraciones de credencial que no provean el JSON oficial de Google Cloud", () => {
    expect(() =>
      seccionConfiguracionGoogleWorkspaceSchema.parse({
        seccion: "CREDENCIAL",
        serviceAccountEmail: "cuenta@proyecto.iam.gserviceaccount.com",
        privateKey: "-----BEGIN PRIVATE KEY-----\ncontenido\n-----END PRIVATE KEY-----",
      }),
    ).toThrow();
  });

  it("rechaza JSONs que no sean del tipo service_account o tengan clave inválida", () => {
    expect(() =>
      seccionConfiguracionGoogleWorkspaceSchema.parse({
        seccion: "CREDENCIAL",
        serviceAccountJson: {
          ...validServiceAccountJson,
          type: "authorized_user",
        },
      }),
    ).toThrow("service_account");

    expect(() =>
      seccionConfiguracionGoogleWorkspaceSchema.parse({
        seccion: "CREDENCIAL",
        serviceAccountJson: {
          ...validServiceAccountJson,
          private_key: "no-es-pem",
        },
      }),
    ).toThrow("formato PEM");
  });

  describe("parseServiceAccountKeyJson", () => {
    it("parsea correctamente un objeto JSON válido", () => {
      const result = parseServiceAccountKeyJson(validServiceAccountJson);
      expect(result.client_email).toBe(
        "flacso-cuenta-servicio@flacso-zoom-app.iam.gserviceaccount.com",
      );
      expect(result.project_id).toBe("flacso-zoom-app");
      expect(result.client_id).toBe("112652356410959245168");
      expect(result.private_key_id).toBe("277f21b0dbd4da25eecb1433087ae4649dfd84f5");
    });

    it("parsea correctamente un string JSON", () => {
      const result = parseServiceAccountKeyJson(JSON.stringify(validServiceAccountJson));
      expect(result.client_email).toBe(
        "flacso-cuenta-servicio@flacso-zoom-app.iam.gserviceaccount.com",
      );
    });

    it("rechaza input nulo, indefinido o vacío", () => {
      expect(() => parseServiceAccountKeyJson(null)).toThrow("obligatorio");
      expect(() => parseServiceAccountKeyJson("   ")).toThrow("no puede estar vacío");
    });

    it("rechaza JSON con sintaxis rota", () => {
      expect(() => parseServiceAccountKeyJson("{ no-json-valido")).toThrow("no es un JSON válido");
    });

    it("rechaza JSON que no sea un objeto", () => {
      expect(() => parseServiceAccountKeyJson("123")).toThrow("objeto JSON");
      expect(() => parseServiceAccountKeyJson('["un-array"]')).toThrow("objeto JSON");
    });

    it("rechaza si falta client_email o si no es un email válido", () => {
      expect(() =>
        parseServiceAccountKeyJson({
          ...validServiceAccountJson,
          client_email: "no-es-un-email",
        }),
      ).toThrow("client_email");
    });
  });

  it("acepta la prueba especifica de scopes", () => {
    expect(pruebaConfiguracionGoogleWorkspaceSchema.parse({ objetivo: "SCOPES" })).toEqual({
      objetivo: "SCOPES",
    });
  });

  it("acepta probar una credencial Legacy concreta", () => {
    expect(
      pruebaConfiguracionGoogleWorkspaceSchema.parse({
        objetivo: "CREDENCIAL",
        credentialId: "legacy:old-project",
      }),
    ).toEqual({ objetivo: "CREDENCIAL", credentialId: "legacy:old-project" });
  });

  it("explica como corregir unauthorized_client", () => {
    const message = mensajeErrorGoogleWorkspace(
      new Error("unauthorized_client: Client is unauthorized"),
    );
    expect(message).toContain("ID numérico");
    expect(message).toContain("scopes requeridos");
  });

  it("explica como corregir invalid_client", () => {
    const message = mensajeErrorGoogleWorkspace(
      new Error("invalid_client: The OAuth client was not found"),
    );
    expect(message).toContain("cuenta de servicio");
    expect(message).toContain("email y la clave privada");
  });

  it("explica cuando Google deniega la delegación del dominio", () => {
    expect(mensajeErrorGoogleWorkspace(new Error("Delegation denied for user"))).toContain(
      "Google denegó la delegación del dominio",
    );
  });

  it("distingue scopes insuficientes de permisos de recursos", () => {
    const scopesMessage = mensajeErrorGoogleWorkspace(
      new Error("Request had insufficient authentication scopes."),
    );
    expect(scopesMessage).toContain("Faltan scopes OAuth");
    expect(scopesMessage).toContain("Validar scopes");

    const permissionMessage = mensajeErrorGoogleWorkspace(
      new Error("insufficient permission to access resource"),
    );
    expect(permissionMessage).toContain("operación no tiene permisos suficientes");
  });

  it("conserva errores desconocidos y usa fallback para mensajes vacíos", () => {
    expect(mensajeErrorGoogleWorkspace(new Error("fallo específico"))).toBe("fallo específico");
    expect(mensajeErrorGoogleWorkspace("")).toBe("No se pudo completar la prueba con Google.");
  });

  describe("actualizarSeccionGoogleWorkspace con JSON de credenciales", () => {
    it("guarda la credencial extrayendo email y cifrando la clave privada del JSON", async () => {
      const actor = { id: "admin-1", rol: "ADMINISTRACION" as const, activo: true };
      let upsertArgs: any = null;
      let auditoriaArgs: any = null;

      const tx = {
        usuario: {
          findUnique: async () => actor,
        },
        configuracionGoogleWorkspace: {
          findUnique: async () => null,
          upsert: async (args: any) => {
            upsertArgs = args;
            return {
              serviceAccountEmail: args.create.serviceAccountEmail,
              serviceAccountSubject: null,
              driveDestinationId: null,
              privateKeyCifrada: args.create.privateKeyCifrada,
              activa: true,
              version: 1,
            };
          },
        },
        auditoria: {
          create: async (args: any) => {
            auditoriaArgs = args;
          },
        },
      };

      const db = {
        $transaction: async (cb: any) => cb(tx),
      } as any;

      const result = await actualizarSeccionGoogleWorkspace(
        { db, cifrar: (val) => `enc:${val}` },
        actor,
        {
          seccion: "CREDENCIAL",
          serviceAccountJson: validServiceAccountJson,
        },
      );

      expect(result.serviceAccountEmail).toBe(
        "flacso-cuenta-servicio@flacso-zoom-app.iam.gserviceaccount.com",
      );
      expect(result.privateKeyConfigurada).toBe(true);
      expect(upsertArgs.create.serviceAccountEmail).toBe(
        "flacso-cuenta-servicio@flacso-zoom-app.iam.gserviceaccount.com",
      );
      expect(upsertArgs.create.privateKeyCifrada).toContain("enc:-----BEGIN PRIVATE KEY-----");
      expect(auditoriaArgs.data.valorNuevo.projectId).toBe("flacso-zoom-app");
      expect(auditoriaArgs.data.valorNuevo.clientId).toBe("112652356410959245168");
      expect(auditoriaArgs.data.valorNuevo.privateKeyId).toBe(
        "277f21b0dbd4da25eecb1433087ae4649dfd84f5",
      );
    });
  });
});
