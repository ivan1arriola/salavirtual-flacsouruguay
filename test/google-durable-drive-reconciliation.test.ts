import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAuth: vi.fn(() => ({ subject: "host@flacso.edu.uy" })),
  execute: vi.fn(), findResource: vi.fn(), confirm: vi.fn(),
  upload: vi.fn(),
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
  buscarRecursoDrivePorOperacion: mocks.findResource,
  DRIVE_FOLDER_MIME: "application/vnd.google-apps.folder",
  DRIVE_GOOGLE_DOC_MIME: "application/vnd.google-apps.document",
  subirDocumentoGoogleDrive: mocks.upload
}));
vi.mock("@/src/modules/operaciones/google-operaciones-externas.service", () => ({
  claveOperacionGoogle: vi.fn(() => "gop:test"),
  ejecutarGooglePostUnaVez: mocks.execute,
  confirmarOperacionDriveMarcada: mocks.confirm,
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
  mocks.findResource.mockReset();
  mocks.confirm.mockReset();
  mocks.getOrCreate.mockReset();
  mocks.findOperation.mockReset();
  mocks.upload.mockReset();
});

describe("Drive: conciliación de POST con resultado incierto", () => {
  it("reutiliza el ID del registro confirmado sin ejecutar otro POST", async () => {
    mocks.execute.mockResolvedValue("folder-from-ledger");
    expect(await provider().obtenerOCrearCarpeta("parent-1", "Clase")).toBe("folder-from-ledger");
    expect(mocks.getOrCreate).not.toHaveBeenCalled();
  });

  it("confirma el estado incierto solo cuando GET demuestra una carpeta única", async () => {
    mocks.execute.mockRejectedValue(new GoogleOperacionInciertaError("gop:test"));
    mocks.findResource.mockResolvedValue({ id: "folder-confirmed", name: "Clase", mimeType: "application/vnd.google-apps.folder" });
    mocks.confirm.mockResolvedValue(true);

    expect(await provider().obtenerOCrearCarpeta("parent-1", "Clase")).toBe("folder-confirmed");
    expect(mocks.findResource).toHaveBeenCalledWith(
      expect.anything(), "parent-1", "Clase",
      "application/vnd.google-apps.folder", "test"
    );
    expect(mocks.confirm).toHaveBeenCalledWith(
      expect.anything(), "gop:test", { id: "folder-confirmed" }
    );
    expect(mocks.getOrCreate).not.toHaveBeenCalled();
  });

  it("no reenvía POST si Google no permite confirmar una carpeta", async () => {
    mocks.execute.mockRejectedValue(new GoogleOperacionInciertaError("gop:test"));
    mocks.findResource.mockResolvedValue(null);
    await expect(provider().obtenerOCrearCarpeta("parent-1", "Clase"))
      .rejects.toBeInstanceOf(GoogleOperacionInciertaError);
    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(mocks.getOrCreate).not.toHaveBeenCalled();
  });

  it("no suplanta un ENVIANDO por una coincidencia no confirmada en DB", async () => {
    mocks.execute.mockRejectedValue(new GoogleOperacionInciertaError("gop:test"));
    mocks.findResource.mockResolvedValue({ id: "folder-candidate", name: "Clase", mimeType: "application/vnd.google-apps.folder" });
    mocks.confirm.mockResolvedValue(false);
    mocks.findOperation.mockResolvedValue({ estado: "ENVIANDO", resultado: null });
    await expect(provider().obtenerOCrearCarpeta("parent-1", "Clase"))
      .rejects.toBeInstanceOf(GoogleOperacionInciertaError);
  });
  it("recupera documentos con marcador único sin repetir el upload", async () => {
    mocks.execute.mockRejectedValue(new GoogleOperacionInciertaError("gop:test"));
    mocks.findResource.mockResolvedValue({
      id: "doc-1", name: "Lista", mimeType: "application/vnd.google-apps.document",
      webViewLink: "https://docs.google.com/document/d/doc-1"
    });
    mocks.confirm.mockResolvedValue(true);
    const result = await provider().subirDocumentoGoogle("folder-1", "Lista", "<p>asistencia</p>");
    expect(result.id).toBe("doc-1");
    expect(mocks.findResource).toHaveBeenCalledWith(
      expect.anything(), "folder-1", "Lista", "application/vnd.google-apps.document", "test"
    );
    expect(mocks.confirm).toHaveBeenCalledWith(
      expect.anything(), "gop:test",
      expect.objectContaining({ id: "doc-1", name: "Lista" })
    );
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("no repite uploads cuando no hay prueba remota única", async () => {
    mocks.execute.mockRejectedValue(new GoogleOperacionInciertaError("gop:test"));
    mocks.findResource.mockResolvedValue(null);
    await expect(provider().subirDocumentoGoogle("folder-1", "Lista", "<p>asistencia</p>"))
      .rejects.toBeInstanceOf(GoogleOperacionInciertaError);
    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });

});
