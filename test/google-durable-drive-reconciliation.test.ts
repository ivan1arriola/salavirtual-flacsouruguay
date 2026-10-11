import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAuth: vi.fn(() => ({ subject: "host@flacso.edu.uy" })),
  execute: vi.fn(), findFolder: vi.fn(), confirm: vi.fn(),
  getOrCreate: vi.fn(), findOperation: vi.fn()
}));

vi.mock("@/src/lib/db", () => ({
  db: { googleOperacionExterna: { findUnique: mocks.findOperation } }
}));
vi.mock("@/src/integrations/google", () => ({
  crearGoogleMeetArtifactsAuthClient: mocks.createAuth,
  conReintentosGoogleLectura: vi.fn(),
  GOOGLE_HTTP_TIMEOUT_MS: 60000,
  GOOGLE_HTTP_READ_TIMEOUT_MS: 20000,
  moverArchivoDrive: vi.fn(),
  obtenerOCrearCarpetaDrive: mocks.getOrCreate,
  buscarCarpetaDrive: mocks.findFolder,
  subirDocumentoGoogleDrive: vi.fn()
}));
vi.mock("@/src/modules/operaciones/google-operaciones-externas.service", () => ({
  claveOperacionGoogle: vi.fn(() => "gop:test"),
  ejecutarGooglePostUnaVez: mocks.execute,
  confirmarGoogleOperacionVerificada: mocks.confirm,
  GoogleOperacionInciertaError: class GoogleOperacionInciertaError extends Error {
    constructor(public readonly clave: string) { super("incierta"); }
  }
}));

import { crearGoogleArtifactsProviderAdapter } from "../src/modules/archivos/infrastructure/google/google-artifacts-provider.adapter";
import { GoogleOperacionInciertaError } from "../src/modules/operaciones/google-operaciones-externas.service";

const provider = () => crearGoogleArtifactsProviderAdapter({
  serviceAccountEmail: "service@example.test",
  privateKey: "private-key",
  subject: "host@example.test"
});

beforeEach(() => {
  mocks.execute.mockReset();
  mocks.findFolder.mockReset();
  mocks.confirm.mockReset();
  mocks.getOrCreate.mockReset();
  mocks.findOperation.mockReset();
});

describe("Drive: conciliación de POST con resultado incierto", () => {
  it("reutiliza el ID del registro confirmado sin ejecutar otro POST", async () => {
    mocks.execute.mockResolvedValue("folder-from-ledger");
    expect(await provider().obtenerOCrearCarpeta("parent-1", "Clase")).toBe("folder-from-ledger");
    expect(mocks.getOrCreate).not.toHaveBeenCalled();
  });

  it("confirma el estado incierto solo cuando GET demuestra una carpeta única", async () => {
    mocks.execute.mockRejectedValue(new GoogleOperacionInciertaError("gop:test"));
    mocks.findFolder.mockResolvedValue("folder-confirmed");
    mocks.confirm.mockResolvedValue(true);

    expect(await provider().obtenerOCrearCarpeta("parent-1", "Clase")).toBe("folder-confirmed");
    expect(mocks.findFolder).toHaveBeenCalledWith(
      expect.anything(), "parent-1", "Clase", true
    );
    expect(mocks.confirm).toHaveBeenCalledWith(
      expect.anything(), "gop:test", { id: "folder-confirmed" }
    );
    expect(mocks.getOrCreate).not.toHaveBeenCalled();
  });

  it("no reenvía POST si Google no permite confirmar una carpeta", async () => {
    mocks.execute.mockRejectedValue(new GoogleOperacionInciertaError("gop:test"));
    mocks.findFolder.mockResolvedValue(null);
    await expect(provider().obtenerOCrearCarpeta("parent-1", "Clase"))
      .rejects.toBeInstanceOf(GoogleOperacionInciertaError);
    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(mocks.getOrCreate).not.toHaveBeenCalled();
  });

  it("no suplanta un ENVIANDO por una coincidencia no confirmada en DB", async () => {
    mocks.execute.mockRejectedValue(new GoogleOperacionInciertaError("gop:test"));
    mocks.findFolder.mockResolvedValue("folder-candidate");
    mocks.confirm.mockResolvedValue(false);
    mocks.findOperation.mockResolvedValue({ estado: "ENVIANDO", resultado: null });
    await expect(provider().obtenerOCrearCarpeta("parent-1", "Clase"))
      .rejects.toBeInstanceOf(GoogleOperacionInciertaError);
  });
});
