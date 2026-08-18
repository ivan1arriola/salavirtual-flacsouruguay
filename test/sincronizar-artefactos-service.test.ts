import { describe, expect, it, vi } from "vitest";
import { sincronizarArtefactosMeet } from "../src/modules/meet/sincronizar-artefactos.service";

const baseEvent = (overrides: Record<string, unknown> = {}) => ({
  id: "event-1",
  codigoReunion: "abc-defg-hij",
  conferenceRecordName: null,
  cuentaProveedor: { emailOrganizador: "sala01@flacso.edu.uy" },
  archivos: [],
  instancia: {
    inicioProgramadoAt: new Date("2026-08-18T21:00:00.000Z"),
    finProgramadoAt: new Date("2026-08-18T22:00:00.000Z"),
    timezone: "America/Montevideo",
    solicitud: { titulo: "Seminario de prueba" }
  },
  ...overrides
});

function fakeDb(event: ReturnType<typeof baseEvent>) {
  const updates: unknown[] = [];
  const upserts: unknown[] = [];
  return {
    db: {
      configuracionGoogleWorkspace: {
        findUnique: vi.fn(async () => ({
          serviceAccountEmail: "service@example.iam.gserviceaccount.com",
          privateKeyCifrada: "encrypted",
          driveDestinationId: "root-folder"
        }))
      },
      eventoProveedor: {
        findMany: vi.fn(async () => [event]),
        update: vi.fn(async (args) => {
          updates.push(args);
          return args;
        })
      },
      archivoReunion: {
        upsert: vi.fn(async (args) => {
          upserts.push(args);
          return args;
        })
      }
    } as never,
    updates,
    upserts
  };
}

function readyAttendance() {
  return {
    html: "<html>asistencia</html>",
    completa: true,
    participantes: 2,
    sesiones: 2
  };
}

describe("sincronización robusta de artefactos Meet", () => {
  it("mantiene la reunión pendiente si Google todavía genera un artefacto", async () => {
    const storage = fakeDb(baseEvent());
    const client = {
      buscarConferencia: vi.fn(async () => ({
        name: "conferenceRecords/c1",
        startTime: "2026-08-18T21:02:00.000Z",
        endTime: new Date().toISOString()
      })),
      obtenerConferencia: vi.fn(),
      obtenerOCrearCarpeta: vi.fn(async () => "folder-1"),
      obtenerArtefactos: vi.fn(async () => ({ recordings: [], transcripts: [], notes: [], pendientes: 1 })),
      obtenerDocumentoAsistencia: vi.fn(async () => readyAttendance()),
      subirDocumentoGoogle: vi.fn(async () => ({
        id: "attendance-doc",
        name: "asistencia",
        mimeType: "application/vnd.google-apps.document",
        webViewLink: "https://drive.google.com/doc"
      })),
      moverArchivo: vi.fn()
    };

    const [result] = await sincronizarArtefactosMeet({
      db: storage.db,
      descifrar: () => "private-key",
      crearClient: () => client as never
    }, ["event-1"]);

    expect(result).toMatchObject({ estado: "ARTEFACTOS_PENDIENTES", archivos: 1 });
    expect(storage.upserts).toHaveLength(1);
    expect(storage.updates.at(-1)).toMatchObject({
      data: {
        conferenceRecordName: "conferenceRecords/c1",
        driveFolderId: "folder-1",
        archivosSincronizadosAt: null,
        errorArchivos: null
      }
    });
  });

  it("sincroniza grabación, transcripción, notas y asistencia sin ocultar tipos", async () => {
    const storage = fakeDb(baseEvent());
    const client = {
      buscarConferencia: vi.fn(async () => ({
        name: "conferenceRecords/c2",
        startTime: "2026-08-18T21:00:00.000Z",
        endTime: "2026-08-18T22:05:00.000Z"
      })),
      obtenerConferencia: vi.fn(),
      obtenerOCrearCarpeta: vi.fn(async () => "folder-2"),
      obtenerArtefactos: vi.fn(async () => ({
        recordings: [{ resourceName: "recording/r1", driveFileId: "video-1", extension: "mp4" }],
        transcripts: [{ resourceName: "transcript/t1", driveFileId: "doc-1" }],
        notes: [{ resourceName: "smartNotes/n1", driveFileId: "doc-2" }],
        pendientes: 0
      })),
      obtenerDocumentoAsistencia: vi.fn(async () => readyAttendance()),
      moverArchivo: vi.fn(async (fileId: string, _folderId: string, name: string) => ({
        id: fileId,
        name,
        mimeType: fileId === "video-1" ? "video/mp4" : "application/vnd.google-apps.document",
        webViewLink: `https://drive.google.com/${fileId}`
      })),
      subirDocumentoGoogle: vi.fn(async (_folderId: string, name: string) => ({
        id: "attendance-doc",
        name,
        mimeType: "application/vnd.google-apps.document",
        webViewLink: "https://drive.google.com/attendance"
      }))
    };

    const [result] = await sincronizarArtefactosMeet({
      db: storage.db,
      descifrar: () => "private-key",
      crearClient: () => client as never
    }, ["event-1"]);

    expect(result).toMatchObject({ estado: "SINCRONIZADO", archivos: 4 });
    expect(storage.upserts).toHaveLength(4);
    expect(storage.upserts.map((item) => (item as { create: { tipo: string } }).create.tipo)).toEqual([
      "GRABACION",
      "TRANSCRIPCION",
      "NOTAS",
      "LISTA_ASISTENCIA"
    ]);
    expect(storage.updates.at(-1)).toMatchObject({
      data: {
        conferenceRecordName: "conferenceRecords/c2",
        driveFolderId: "folder-2",
        errorArchivos: null
      }
    });
    expect((storage.updates.at(-1) as { data: { archivosSincronizadosAt: unknown } }).data.archivosSincronizadosAt).toBeInstanceOf(Date);
  });

  it("reutiliza el conferenceRecordName persistido en revisiones posteriores", async () => {
    const storage = fakeDb(baseEvent({ conferenceRecordName: "conferenceRecords/existing" }));
    const client = {
      buscarConferencia: vi.fn(async () => { throw new Error("No debería buscar nuevamente"); }),
      obtenerConferencia: vi.fn(async () => ({
        name: "conferenceRecords/existing",
        startTime: "2026-08-18T21:00:00.000Z",
        endTime: "2026-08-18T22:00:00.000Z"
      })),
      obtenerOCrearCarpeta: vi.fn(async () => "folder-existing"),
      obtenerArtefactos: vi.fn(async () => ({ recordings: [], transcripts: [], notes: [], pendientes: 0 })),
      obtenerDocumentoAsistencia: vi.fn(async () => readyAttendance()),
      subirDocumentoGoogle: vi.fn(async () => ({
        id: "attendance-doc",
        name: "asistencia",
        mimeType: "application/vnd.google-apps.document"
      })),
      moverArchivo: vi.fn()
    };

    const [result] = await sincronizarArtefactosMeet({
      db: storage.db,
      descifrar: () => "private-key",
      crearClient: () => client as never
    }, ["event-1"]);

    expect(result?.estado).toBe("SINCRONIZADO");
    expect(client.obtenerConferencia).toHaveBeenCalledWith("conferenceRecords/existing");
    expect(client.buscarConferencia).not.toHaveBeenCalled();
  });

  it("expone un error si la asistencia sigue incompleta después de 24 horas", async () => {
    const storage = fakeDb(baseEvent());
    const client = {
      buscarConferencia: vi.fn(async () => ({
        name: "conferenceRecords/old",
        startTime: "2026-08-01T21:00:00.000Z",
        endTime: "2026-08-01T22:00:00.000Z"
      })),
      obtenerConferencia: vi.fn(),
      obtenerOCrearCarpeta: vi.fn(async () => "folder-old"),
      obtenerArtefactos: vi.fn(async () => ({ recordings: [], transcripts: [], notes: [], pendientes: 0 })),
      obtenerDocumentoAsistencia: vi.fn(async () => ({
        html: "<html></html>",
        completa: false,
        participantes: 0,
        sesiones: 0
      })),
      subirDocumentoGoogle: vi.fn(),
      moverArchivo: vi.fn()
    };

    const [result] = await sincronizarArtefactosMeet({
      db: storage.db,
      descifrar: () => "private-key",
      crearClient: () => client as never
    }, ["event-1"]);

    expect(result?.estado).toBe("ERROR");
    expect(result?.error).toContain("no devolvió participantes");
    expect(client.subirDocumentoGoogle).not.toHaveBeenCalled();
  });
});
