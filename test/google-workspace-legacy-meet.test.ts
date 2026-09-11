import { describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { cargarCredencialesLegacyGoogleWorkspace } from "../src/modules/configuracion/google-workspace.service";

describe("credenciales Legacy para Meet", () => {
  it("no reutiliza el subject general de Workspace y deja que Meet use la sala organizadora", async () => {
    const db = {
      configuracionGoogleWorkspace: {
        findMany: async () => [{
          id: "legacy:old-project",
          serviceAccountEmail: "legacy@old-project.iam.gserviceaccount.com",
          privateKeyCifrada: "cifrada",
          serviceAccountSubject: "web@flacso.edu.uy",
        }],
      },
    } as unknown as PrismaClient;

    const result = await cargarCredencialesLegacyGoogleWorkspace(db, (value) => `descifrada:${value}`);

    expect(result).toEqual([{
      id: "legacy:old-project",
      serviceAccountEmail: "legacy@old-project.iam.gserviceaccount.com",
      privateKey: "descifrada:cifrada",
      serviceAccountSubject: null,
    }]);
  });
});
