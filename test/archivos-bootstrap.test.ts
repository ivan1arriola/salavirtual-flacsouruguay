import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/src/lib/db", () => ({
  db: {
    configuracionGoogleWorkspace: {
      findUnique: vi.fn().mockResolvedValue(null)
    },
    eventoProveedor: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({})
    },
    archivoReunion: {
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn().mockResolvedValue({})
    }
  }
}));
vi.mock("@/src/lib/config/encryption", () => ({
  descifrarConfiguracion: vi.fn().mockReturnValue("decrypted")
}));

import {
  crearArchivosRepository,
  crearArtifactProvider,
  listarArchivosMeetVisibles,
  obtenerParticipantesActivosInstancia,
  sincronizarArtefactos
} from "@/src/bootstrap/archivos.server";

describe("archivos: bootstrap server", () => {
  it("expone constructores y casos de uso con db inyectada", async () => {
    const repo = crearArchivosRepository();
    expect(repo).toBeDefined();

    const provider = crearArtifactProvider({
      serviceAccountEmail: "sa@flacso.edu.uy",
      privateKey: "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0...\n-----END RSA PRIVATE KEY-----\n",
      subject: "host@flacso.edu.uy"
    });
    expect(provider).toBeDefined();

    const syncRes = await sincronizarArtefactos(["evt-1"]);
    expect(syncRes).toHaveLength(1);
    expect(syncRes[0].estado).toBe("ERROR"); // Falta config

    const partRes = await obtenerParticipantesActivosInstancia("inst-1");
    expect(partRes.estado).toBe("NO_DISPONIBLE");

    const files = await listarArchivosMeetVisibles({ id: "admin-1", rol: "ADMINISTRACION" });
    expect(files).toEqual([]);
  });
});
