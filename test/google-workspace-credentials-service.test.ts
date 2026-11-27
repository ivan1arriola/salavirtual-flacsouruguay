import { describe, expect, it } from "vitest";
import {
  obtenerCredencialPrincipalGoogleWorkspace,
  obtenerCredencialGoogleParaSala,
  obtenerCredencialAdminReportsGoogle,
  obtenerCandidatosCredencialesParaOrganizador,
} from "@/src/modules/configuracion/api";

describe("google-workspace.service: unificación de credenciales", () => {
  const fakeDecrypt = (val: string) => `decrypted:${val}`;

  it("obtenerCredencialPrincipalGoogleWorkspace devuelve credencial activa descifrada", async () => {
    const dbMock = {
      configuracionGoogleWorkspace: {
        findUnique: async () => ({
          id: "principal",
          serviceAccountEmail: "sa@flacso.edu.uy",
          privateKeyCifrada: "cifrada_123",
          serviceAccountSubject: "admin@flacso.edu.uy",
          driveDestinationId: "drive_folder_id",
          activa: true,
          version: 2,
          updatedAt: new Date("2026-10-01T10:00:00Z"),
        }),
      },
    };

    const cred = await obtenerCredencialPrincipalGoogleWorkspace(dbMock, fakeDecrypt);
    expect(cred).not.toBeNull();
    expect(cred?.serviceAccountEmail).toBe("sa@flacso.edu.uy");
    expect(cred?.privateKey).toBe("decrypted:cifrada_123");
    expect(cred?.serviceAccountSubject).toBe("admin@flacso.edu.uy");
    expect(cred?.driveDestinationId).toBe("drive_folder_id");
    expect(cred?.activa).toBe(true);
  });

  it("obtenerCredencialPrincipalGoogleWorkspace devuelve null si está inactiva y requireActiva es true", async () => {
    const dbMock = {
      configuracionGoogleWorkspace: {
        findUnique: async () => ({
          id: "principal",
          serviceAccountEmail: "sa@flacso.edu.uy",
          privateKeyCifrada: "cifrada_123",
          activa: false,
        }),
      },
    };

    const cred = await obtenerCredencialPrincipalGoogleWorkspace(dbMock, fakeDecrypt);
    expect(cred).toBeNull();

    const credInactiveAllowed = await obtenerCredencialPrincipalGoogleWorkspace(
      dbMock,
      fakeDecrypt,
      {
        requireActiva: false,
      },
    );
    expect(credInactiveAllowed).not.toBeNull();
    expect(credInactiveAllowed?.activa).toBe(false);
  });

  it("obtenerCredencialGoogleParaSala vincula el subject con el email del organizador", async () => {
    const dbMock = {
      configuracionGoogleWorkspace: {
        findUnique: async () => ({
          id: "principal",
          serviceAccountEmail: "sa@flacso.edu.uy",
          privateKeyCifrada: "key_enc",
          activa: true,
        }),
      },
    };

    const salaCred = await obtenerCredencialGoogleParaSala(
      dbMock,
      "docente@flacso.edu.uy",
      fakeDecrypt,
    );
    expect(salaCred).toEqual({
      serviceAccountEmail: "sa@flacso.edu.uy",
      privateKey: "decrypted:key_enc",
      subject: "docente@flacso.edu.uy",
    });
  });

  it("obtenerCredencialAdminReportsGoogle resuelve el email de administración", async () => {
    const dbMock = {
      configuracionGoogleWorkspace: {
        findUnique: async () => ({
          id: "principal",
          serviceAccountEmail: "sa@flacso.edu.uy",
          privateKeyCifrada: "key_enc",
          activa: true,
        }),
      },
    };

    const adminCred = await obtenerCredencialAdminReportsGoogle(
      dbMock,
      fakeDecrypt,
      "reports-admin@flacso.edu.uy",
    );
    expect(adminCred).toEqual({
      serviceAccountEmail: "sa@flacso.edu.uy",
      privateKey: "decrypted:key_enc",
      adminEmail: "reports-admin@flacso.edu.uy",
    });

    const sinAdmin = await obtenerCredencialAdminReportsGoogle(dbMock, fakeDecrypt, "");
    expect(sinAdmin).toBeNull();
  });

  it("obtenerCandidatosCredencialesParaOrganizador retorna [principal, ...legacy] con subject", async () => {
    const dbMock = {
      configuracionGoogleWorkspace: {
        findUnique: async () => ({
          id: "principal",
          serviceAccountEmail: "principal@flacso.edu.uy",
          privateKeyCifrada: "enc_p",
          activa: true,
        }),
        findMany: async () => [
          {
            id: "legacy:old@flacso.edu.uy",
            serviceAccountEmail: "old@flacso.edu.uy",
            privateKeyCifrada: "enc_l",
            activa: true,
            serviceAccountSubject: null,
          },
        ],
      },
    };

    const candidates = await obtenerCandidatosCredencialesParaOrganizador(
      dbMock,
      "sala01@flacso.edu.uy",
      fakeDecrypt,
    );

    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toEqual({
      serviceAccountEmail: "principal@flacso.edu.uy",
      privateKey: "decrypted:enc_p",
      subject: "sala01@flacso.edu.uy",
      origen: "PRINCIPAL",
    });
    expect(candidates[1]).toEqual({
      serviceAccountEmail: "old@flacso.edu.uy",
      privateKey: "decrypted:enc_l",
      subject: "sala01@flacso.edu.uy",
      origen: "LEGACY",
    });
  });
});
