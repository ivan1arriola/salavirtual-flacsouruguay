import { describe, expect, it, vi } from "vitest";
import { cargarCredencialesLegacyGoogleWorkspace } from "../src/modules/configuracion/google-workspace.service";

describe("credenciales Legacy de Google Workspace", () => {
  it("conserva el subject histórico de cada credencial", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "legacy:old",
        serviceAccountEmail: "old@project.iam.gserviceaccount.com",
        privateKeyCifrada: "ciphertext",
        serviceAccountSubject: "web@flacso.edu.uy",
      },
    ]);
    const db = {
      configuracionGoogleWorkspace: { findMany },
    } as never;

    const result = await cargarCredencialesLegacyGoogleWorkspace(db, (value) => `dec:${value}`);

    expect(result).toEqual([
      {
        id: "legacy:old",
        serviceAccountEmail: "old@project.iam.gserviceaccount.com",
        privateKey: "dec:ciphertext",
        serviceAccountSubject: "web@flacso.edu.uy",
      },
    ]);
    expect(findMany).toHaveBeenCalledOnce();
  });
});
