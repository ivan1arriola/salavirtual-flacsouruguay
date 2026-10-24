import { describe, expect, it, vi } from "vitest";
import { repararPlanillasAsistenciaVaciasUseCase } from "../src/modules/archivos/application/reparar-planillas-asistencia-vacias.use-case";
import type { ArchivosRepositoryPort, ArtifactProviderPort } from "../src/modules/archivos/ports";

describe("reparar planillas de asistencia vacías", () => {
  it("usa Meet/Workspace para reconstruir solo hojas vacías en la carpeta del encuentro", async () => {
    const provider: ArtifactProviderPort = {
      buscarConferencia: vi.fn().mockResolvedValue({
        name: "conferenceRecords/meet-api", startTime: "2026-10-10T12:00:00Z", endTime: "2026-10-10T13:00:00Z"
      }),
      obtenerConferencia: vi.fn(),
      obtenerArtefactos: vi.fn().mockResolvedValue({ recordings: [], transcripts: [], notes: [], estadoGrabacion: "AUSENTE", pendientes: 0 }),
      obtenerDocumentoAsistencia: vi.fn().mockResolvedValue({
        html: "<html></html>", completa: false, participantes: 0, sesiones: 0,
        planilla: { sesionesMeet: [], correosAuditados: [], eventosAuditoria: [] }
      }),
      obtenerOCrearCarpeta: vi.fn().mockResolvedValue("folder-for-this-meeting"),
      moverArchivo: vi.fn(),
      subirDocumentoGoogle: vi.fn(),
      subirPlanillaAsistencia: vi.fn().mockResolvedValue({ id: "blank-sheet", name: "asistencia", mimeType: "application/vnd.google-apps.spreadsheet" }),
      planillaAsistenciaGoogleVacia: vi.fn(async (id: string) => id === "blank-sheet"),
      obtenerParticipantesActivos: vi.fn()
    };
    const repository: ArchivosRepositoryPort = {
      obtenerConfiguracionWorkspacePrincipal: vi.fn().mockResolvedValue({
        activa: true, serviceAccountEmail: "service@flacso.edu.uy", privateKeyCifrada: "encrypted", driveDestinationId: "root"
      }),
      listarPlanillasAsistenciaCandidatas: vi.fn().mockResolvedValue([
        { eventoProveedorId: "event-1", spreadsheetId: "blank-sheet", emailOrganizador: "host@flacso.edu.uy" },
        { eventoProveedorId: "event-filled", spreadsheetId: "filled-sheet", emailOrganizador: "host@flacso.edu.uy" }
      ]),
      obtenerEventosParaSincronizar: vi.fn().mockResolvedValue([{
        id: "event-1", driveFolderId: "folder-for-this-meeting", codigoReunion: "meet-code", conferenceRecordName: null, emailOrganizador: "host@flacso.edu.uy",
        cohostEmails: [], archivos: [{ id: "file-row", driveFileId: "blank-sheet", externalResourceName: "conferenceRecords/meet-api/attendance", tipo: "LISTA_ASISTENCIA", mimeType: "application/vnd.google-apps.spreadsheet" }],
        asistenciaDriveFileId: "blank-sheet", inicioProgramadoAt: new Date("2026-10-10T12:00:00Z"),
        finProgramadoAt: new Date("2026-10-10T13:00:00Z"), timezone: "America/Montevideo", requiereGrabacion: false, tituloSolicitud: "Clase"
      }]),
      registrarArchivoSincronizado: vi.fn(), actualizarEstadoSincronizacion: vi.fn(), registrarErrorSincronizacion: vi.fn(),
      obtenerDatosInstanciaParaParticipantes: vi.fn(), listarArchivosVisibles: vi.fn()
    };

    const result = await repararPlanillasAsistenciaVaciasUseCase(repository, () => provider, (value) => value);

    expect(provider.obtenerDocumentoAsistencia).toHaveBeenCalledWith("conferenceRecords/meet-api", "meet-code");
    expect(provider.subirPlanillaAsistencia).toHaveBeenCalledWith(
      "folder-for-this-meeting", expect.any(String), expect.any(Object), expect.any(Date), expect.any(Date),
      "host@flacso.edu.uy", [], "blank-sheet"
    );
    expect(provider.subirDocumentoGoogle).not.toHaveBeenCalled();
    expect(provider.obtenerOCrearCarpeta).not.toHaveBeenCalled();
    expect(result).toMatchObject({ revisadas: 2, vacias: 1, reparadas: 1, omitidas: 1, fallidas: 0 });
    const retryOnlyFailed = await repararPlanillasAsistenciaVaciasUseCase(
      repository, () => provider, (value) => value, ["event-filled"]
    );
    expect(retryOnlyFailed).toMatchObject({ revisadas: 1, vacias: 0, reparadas: 0, omitidas: 1, fallidas: 0 });
  });
});
