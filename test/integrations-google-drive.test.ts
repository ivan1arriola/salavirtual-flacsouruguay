import { describe, expect, it, vi } from "vitest";
import type { JWT } from "google-auth-library";
import {
  crearGoogleDriveAuthClient,
  crearGoogleMeetArtifactsAuthClient,
  GOOGLE_DRIVE_SCOPES,
  GOOGLE_MEET_ARTIFACTS_SCOPES,
  moverArchivoDrive,
  obtenerOCrearCarpetaDrive,
  subirDocumentoGoogleDrive,
  DRIVE_FOLDER_MIME,
  DRIVE_GOOGLE_DOC_MIME
} from "@/src/integrations/google";

describe("integraciones google: drive", () => {
  const credentials = {
    serviceAccountEmail: "service@flacso.edu.uy",
    privateKey: "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0...\n-----END RSA PRIVATE KEY-----\n",
    subject: "admin@flacso.edu.uy"
  };

  it("crea cliente JWT con scopes correctos para Drive y Meet Artifacts", () => {
    const driveAuth = crearGoogleDriveAuthClient(credentials);
    expect(driveAuth.email).toBe(credentials.serviceAccountEmail);
    expect(driveAuth.scopes).toEqual([...GOOGLE_DRIVE_SCOPES]);

    const meetArtifactsAuth = crearGoogleMeetArtifactsAuthClient(credentials);
    expect(meetArtifactsAuth.email).toBe(credentials.serviceAccountEmail);
    expect(meetArtifactsAuth.scopes).toEqual([...GOOGLE_MEET_ARTIFACTS_SCOPES]);
  });

  describe("obtenerOCrearCarpetaDrive", () => {
    it("retorna el ID existente si la carpeta ya existe", async () => {
      const mockAuth = {
        request: vi.fn().mockResolvedValue({
          data: { files: [{ id: "folder-123" }] }
        })
      } as unknown as JWT;

      const id = await obtenerOCrearCarpetaDrive(mockAuth, "parent-root", "Clase 01");
      expect(id).toBe("folder-123");
      expect(mockAuth.request).toHaveBeenCalledTimes(1);
      const callArgs = (mockAuth.request as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(callArgs.url).toContain("q=");
      expect(callArgs.url).toContain(encodeURIComponent("mimeType = 'application/vnd.google-apps.folder' and name = 'Clase 01' and 'parent-root' in parents and trashed = false"));
      expect(callArgs.method).toBe("GET");
    });

    it("crea la carpeta si no existe y retorna su nuevo ID", async () => {
      const mockAuth = {
        request: vi
          .fn()
          .mockResolvedValueOnce({ data: { files: [] } })
          .mockResolvedValueOnce({ data: { id: "new-folder-456" } })
      } as unknown as JWT;

      const id = await obtenerOCrearCarpetaDrive(mockAuth, "parent-root", "Nueva Carpeta");
      expect(id).toBe("new-folder-456");
      expect(mockAuth.request).toHaveBeenCalledTimes(2);
      const secondCall = (mockAuth.request as ReturnType<typeof vi.fn>).mock.calls[1][0];
      expect(secondCall.method).toBe("POST");
      expect(secondCall.data).toEqual({
        name: "Nueva Carpeta",
        mimeType: DRIVE_FOLDER_MIME,
        parents: ["parent-root"]
      });
    });

    it("lanza error si la creacion no devuelve ID", async () => {
      const mockAuth = {
        request: vi
          .fn()
          .mockResolvedValueOnce({ data: { files: [] } })
          .mockResolvedValueOnce({ data: {} })
      } as unknown as JWT;

      await expect(
        obtenerOCrearCarpetaDrive(mockAuth, "parent-root", "Error Carpeta")
      ).rejects.toThrow("Drive no devolvió el ID de la carpeta creada.");
    });
  });

  describe("moverArchivoDrive", () => {
    it("obtiene los padres actuales y mueve el archivo a la nueva carpeta con nuevo nombre", async () => {
      const mockAuth = {
        request: vi
          .fn()
          .mockResolvedValueOnce({
            data: { id: "file-99", parents: ["old-folder-1", "old-folder-2"] }
          })
          .mockResolvedValueOnce({
            data: {
              id: "file-99",
              name: "video_renombrado.mp4",
              mimeType: "video/mp4",
              size: "1024000",
              webViewLink: "https://drive.google.com/view/file-99"
            }
          })
      } as unknown as JWT;

      const moved = await moverArchivoDrive(mockAuth, "file-99", "new-folder", "video_renombrado.mp4");
      expect(moved.id).toBe("file-99");
      expect(moved.name).toBe("video_renombrado.mp4");

      const patchCall = (mockAuth.request as ReturnType<typeof vi.fn>).mock.calls[1][0];
      expect(patchCall.method).toBe("PATCH");
      expect(patchCall.url).toContain("addParents=new-folder");
      expect(patchCall.url).toContain("removeParents=old-folder-1%2Cold-folder-2");
      expect(patchCall.data).toEqual({ name: "video_renombrado.mp4" });
    });
  });

  describe("subirDocumentoGoogleDrive", () => {
    it("realiza un upload multipart con metadatos JSON y HTML", async () => {
      const mockAuth = {
        request: vi.fn().mockResolvedValue({
          data: {
            id: "doc-doc-1",
            name: "Lista de asistencia",
            mimeType: DRIVE_GOOGLE_DOC_MIME,
            webViewLink: "https://docs.google.com/document/d/doc-doc-1"
          }
        })
      } as unknown as JWT;

      const res = await subirDocumentoGoogleDrive(
        mockAuth,
        "folder-target",
        "Lista de asistencia",
        "<html><body>Asistencia</body></html>"
      );
      expect(res.id).toBe("doc-doc-1");

      const uploadCall = (mockAuth.request as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(uploadCall.method).toBe("POST");
      expect(uploadCall.headers["Content-Type"]).toContain("multipart/related; boundary=");
      expect(uploadCall.data).toContain("folder-target");
      expect(uploadCall.data).toContain("<html><body>Asistencia</body></html>");
    });
  });
});

