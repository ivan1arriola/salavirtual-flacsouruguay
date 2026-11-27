import { describe, expect, it, vi } from "vitest";
import type { JWT } from "google-auth-library";
import {
  buscarRecursoDrivePorOperacion,
  obtenerOCrearCarpetaDrive,
  subirDocumentoGoogleDrive,
  DRIVE_OPERATION_PROPERTY,
  DRIVE_FOLDER_MIME,
  DRIVE_GOOGLE_DOC_MIME,
} from "../src/integrations/google";

const marker = "a".repeat(64);
function client(...results: unknown[]) {
  const request = vi.fn();
  for (const result of results) {
    request.mockResolvedValueOnce({ data: result });
  }
  return { request, auth: { request } as unknown as JWT };
}

describe("Drive: prueba remota de idempotencia mediante appProperties", () => {
  it("incorpora el identificador en el mismo POST que crea la carpeta", async () => {
    const { request, auth } = client({ files: [] }, { id: "folder-1" });
    expect(await obtenerOCrearCarpetaDrive(auth, "parent", "Carpeta", marker)).toBe("folder-1");
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1][0]).toMatchObject({
      method: "POST",
      data: {
        name: "Carpeta",
        mimeType: DRIVE_FOLDER_MIME,
        parents: ["parent"],
        appProperties: { [DRIVE_OPERATION_PROPERTY]: marker },
      },
    });
  });

  it("incorpora el marcador en el metadata multipart del documento", async () => {
    const { request, auth } = client({ id: "doc-1", name: "Lista" });
    await subirDocumentoGoogleDrive(auth, "folder", "Lista", "<p>ok</p>", marker);
    const data: string = request.mock.calls[0][0].data;
    expect(data).toContain('"appProperties":{"flacsoOperationId":"' + marker + '"}');
    expect(data).toContain("<p>ok</p>");
  });

  it("solo acepta un recurso cuyo marcador, carpeta, nombre y MIME coincidan", async () => {
    const { request, auth } = client({
      files: [
        {
          id: "doc-1",
          name: "Lista",
          mimeType: DRIVE_GOOGLE_DOC_MIME,
          appProperties: { [DRIVE_OPERATION_PROPERTY]: marker },
        },
      ],
    });
    const result = await buscarRecursoDrivePorOperacion(
      auth,
      "folder",
      "Lista",
      DRIVE_GOOGLE_DOC_MIME,
      marker,
    );
    expect(result?.id).toBe("doc-1");
    const url: string = request.mock.calls[0][0].url;
    const query = new URL(url).searchParams.get("q")!;
    expect(query).toContain(
      `appProperties has { key='${DRIVE_OPERATION_PROPERTY}' and value='${marker}' }`,
    );
    expect(query).toContain("'folder' in parents");
    expect(query).toContain("trashed = false");
  });

  it("rechaza coincidencias por nombre sin marcador y resultados ambiguos", async () => {
    for (const data of [
      { files: [{ id: "same-name", name: "Lista", mimeType: DRIVE_GOOGLE_DOC_MIME }] },
      {
        files: [
          {
            id: "a",
            name: "Lista",
            mimeType: DRIVE_GOOGLE_DOC_MIME,
            appProperties: { flacsoOperationId: marker },
          },
          {
            id: "b",
            name: "Lista",
            mimeType: DRIVE_GOOGLE_DOC_MIME,
            appProperties: { flacsoOperationId: marker },
          },
        ],
      },
      {
        files: [
          {
            id: "a",
            name: "Lista",
            mimeType: DRIVE_GOOGLE_DOC_MIME,
            appProperties: { flacsoOperationId: marker },
          },
        ],
        nextPageToken: "more",
      },
    ]) {
      const { auth } = client(data);
      expect(
        await buscarRecursoDrivePorOperacion(
          auth,
          "folder",
          "Lista",
          DRIVE_GOOGLE_DOC_MIME,
          marker,
        ),
      ).toBeNull();
    }
  });

  it("rechaza claves no verificadas sin consultar Google", async () => {
    const { request, auth } = client();
    await expect(
      buscarRecursoDrivePorOperacion(auth, "folder", "Lista", DRIVE_GOOGLE_DOC_MIME, "not-safe"),
    ).rejects.toThrow("inválido");
    expect(request).not.toHaveBeenCalled();
  });
});
