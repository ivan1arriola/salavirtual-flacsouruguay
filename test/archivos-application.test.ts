import { describe, expect, it, vi } from "vitest";
import {
  listarArchivosVisiblesUseCase,
  obtenerParticipantesActivosUseCase,
  sincronizarArtefactosUseCase
} from "@/src/modules/archivos/application";
import type {
  ArchivosRepositoryPort,
  ArtifactProviderFactory,
  ArtifactProviderPort,
  EventoParaSincronizarArchivos
} from "@/src/modules/archivos/ports";

describe("archivos: application", () => {
  const dummyDescifrar = (val: string) => `decrypted_${val}`;

  const validWorkspaceConfig = {
    activa: true,
    serviceAccountEmail: "service@flacso.edu.uy",
    privateKeyCifrada: "encrypted_key",
    driveDestinationId: "drive-dest-123"
  };

  describe("sincronizarArtefactosUseCase", () => {
    it("restaura la planilla existente aunque Meet no devuelva sesiones completas", async () => {
      const mockProvider: ArtifactProviderPort = {
        buscarConferencia: vi.fn().mockResolvedValue({
          name: "conferenceRecords/empty-sheet",
          startTime: "2026-10-10T12:00:00Z",
          endTime: "2026-10-10T13:00:00Z"
        }),
        obtenerConferencia: vi.fn(),
        obtenerArtefactos: vi.fn().mockResolvedValue({
          recordings: [], transcripts: [], notes: [], estadoGrabacion: "AUSENTE", pendientes: 0
        }),
        obtenerDocumentoAsistencia: vi.fn().mockResolvedValue({
          html: "<html></html>", completa: false, participantes: 0, sesiones: 0,
          planilla: { sesionesMeet: [], correosAuditados: [], eventosAuditoria: [] }
        }),
        obtenerOCrearCarpeta: vi.fn().mockResolvedValue("meeting-folder"),
        moverArchivo: vi.fn(),
        subirDocumentoGoogle: vi.fn(),
        subirPlanillaAsistencia: vi.fn().mockResolvedValue({
          id: "empty-sheet", name: "asistencia", mimeType: "application/vnd.google-apps.spreadsheet"
        }),
        obtenerParticipantesActivos: vi.fn()
      };
      const mockRepo: ArchivosRepositoryPort = {
        obtenerConfiguracionWorkspacePrincipal: vi.fn().mockResolvedValue(validWorkspaceConfig),
        obtenerEventosParaSincronizar: vi.fn().mockResolvedValue([{
          id: "evt-empty-sheet", codigoReunion: "abc-defg-hij", conferenceRecordName: null,
          emailOrganizador: "host@flacso.edu.uy", cohostEmails: [], archivos: [{
            id: "file-row", driveFileId: "empty-sheet", externalResourceName: "conferenceRecords/empty-sheet/attendance",
            tipo: "LISTA_ASISTENCIA", mimeType: "application/vnd.google-apps.spreadsheet"
          }], asistenciaDriveFileId: "empty-sheet",
          inicioProgramadoAt: new Date("2026-10-10T12:00:00Z"), finProgramadoAt: new Date("2026-10-10T13:00:00Z"),
          timezone: "America/Montevideo", requiereGrabacion: false, tituloSolicitud: "Clase"
        }]),
        registrarArchivoSincronizado: vi.fn(), actualizarEstadoSincronizacion: vi.fn(),
        registrarErrorSincronizacion: vi.fn(), obtenerDatosInstanciaParaParticipantes: vi.fn(),
        listarArchivosVisibles: vi.fn()
      };

      const result = await sincronizarArtefactosUseCase(mockRepo, () => mockProvider, dummyDescifrar, {
        eventoProveedorIds: ["evt-empty-sheet"], regenerarAsistencia: true
      });

      expect(mockProvider.subirPlanillaAsistencia).toHaveBeenCalledWith(
        "meeting-folder", expect.any(String), expect.any(Object), expect.any(Date), expect.any(Date),
        "host@flacso.edu.uy", [], "empty-sheet"
      );
      expect(mockProvider.subirDocumentoGoogle).not.toHaveBeenCalled();
      expect(result[0]).toMatchObject({ estado: "SINCRONIZADO", archivos: 1 });
    });

    it("devuelve ERROR si falta la configuración de Google Workspace", async () => {
      const mockRepo: ArchivosRepositoryPort = {
        obtenerConfiguracionWorkspacePrincipal: vi.fn().mockResolvedValue(null),
        obtenerEventosParaSincronizar: vi.fn(),
        registrarArchivoSincronizado: vi.fn(),
        actualizarEstadoSincronizacion: vi.fn(),
        registrarErrorSincronizacion: vi.fn(),
        obtenerDatosInstanciaParaParticipantes: vi.fn(),
        listarArchivosVisibles: vi.fn()
      };

      const result = await sincronizarArtefactosUseCase(
        mockRepo,
        vi.fn(),
        dummyDescifrar,
        { eventoProveedorIds: ["evt-1"] }
      );

      expect(result).toHaveLength(1);
      expect(result[0].estado).toBe("ERROR");
      expect(result[0].error).toContain("Faltan credenciales");
    });

    it("devuelve ERROR si el evento no tiene organizador o código", async () => {
      const mockRepo: ArchivosRepositoryPort = {
        obtenerConfiguracionWorkspacePrincipal: vi.fn().mockResolvedValue(validWorkspaceConfig),
        obtenerEventosParaSincronizar: vi.fn().mockResolvedValue([
          {
            id: "evt-sin-host",
            codigoReunion: null,
            conferenceRecordName: null,
            emailOrganizador: null,
            archivos: [],
            inicioProgramadoAt: new Date(),
            finProgramadoAt: new Date(),
            timezone: "America/Montevideo",
            requiereGrabacion: true,
            tituloSolicitud: "Clase Sin Host"
          }
        ]),
        registrarArchivoSincronizado: vi.fn(),
        actualizarEstadoSincronizacion: vi.fn(),
        registrarErrorSincronizacion: vi.fn(),
        obtenerDatosInstanciaParaParticipantes: vi.fn(),
        listarArchivosVisibles: vi.fn()
      };

      const result = await sincronizarArtefactosUseCase(
        mockRepo,
        vi.fn(),
        dummyDescifrar,
        { eventoProveedorIds: ["evt-sin-host"] }
      );

      expect(result[0].estado).toBe("ERROR");
      expect(result[0].error).toContain("La reunión no tiene host o código Meet.");
      expect(mockRepo.registrarErrorSincronizacion).toHaveBeenCalledWith(
        "evt-sin-host",
        expect.stringContaining("La reunión no tiene host o código Meet.")
      );
    });

    it("devuelve SIN_REGISTRO_FINALIZADO si la conferencia no ha concluido", async () => {
      const mockProvider: ArtifactProviderPort = {
        buscarConferencia: vi.fn().mockResolvedValue({
          name: "conf-123",
          startTime: "2026-09-19T14:00:00Z"
          // sin endTime
        }),
        obtenerConferencia: vi.fn(),
        obtenerArtefactos: vi.fn(),
        obtenerDocumentoAsistencia: vi.fn().mockResolvedValue({
          html: "<html></html>", completa: false, participantes: 0, sesiones: 0,
          planilla: { sesionesMeet: [], correosAuditados: [], eventosAuditoria: [] }
        }),
        obtenerOCrearCarpeta: vi.fn(),
        moverArchivo: vi.fn(),
        subirDocumentoGoogle: vi.fn(),
        obtenerParticipantesActivos: vi.fn()
      };

      const mockRepo: ArchivosRepositoryPort = {
        obtenerConfiguracionWorkspacePrincipal: vi.fn().mockResolvedValue(validWorkspaceConfig),
        obtenerEventosParaSincronizar: vi.fn().mockResolvedValue([
          {
            id: "evt-en-curso",
            codigoReunion: "abc-defg-hij",
            conferenceRecordName: null,
            emailOrganizador: "host@flacso.edu.uy",
            archivos: [],
            inicioProgramadoAt: new Date("2026-09-19T14:00:00Z"),
            finProgramadoAt: new Date("2026-09-19T16:00:00Z"),
            timezone: "America/Montevideo",
            requiereGrabacion: true,
            tituloSolicitud: "Clase En Curso"
          }
        ]),
        registrarArchivoSincronizado: vi.fn(),
        actualizarEstadoSincronizacion: vi.fn(),
        registrarErrorSincronizacion: vi.fn(),
        obtenerDatosInstanciaParaParticipantes: vi.fn(),
        listarArchivosVisibles: vi.fn()
      };

      const result = await sincronizarArtefactosUseCase(
        mockRepo,
        () => mockProvider,
        dummyDescifrar,
        { eventoProveedorIds: ["evt-en-curso"] }
      );

      expect(result[0].estado).toBe("SIN_REGISTRO_FINALIZADO");
      expect(result[0].grabacion).toBe("PENDIENTE");
    });

    it("publica sesiones Meet preliminares aunque la conferencia siga abierta", async () => {
      const mockProvider: ArtifactProviderPort = {
        buscarConferencia: vi.fn().mockResolvedValue({
          name: "conf-abierta",
          startTime: "2026-09-19T14:00:00Z"
        }),
        obtenerConferencia: vi.fn(),
        obtenerArtefactos: vi.fn(),
        obtenerDocumentoAsistencia: vi.fn().mockResolvedValue({
          html: "<html></html>", completa: false, participantes: 1, sesiones: 1,
          planilla: {
            sesionesMeet: [{ nombre: "Participante", tipo: "CUENTA_GOOGLE", inicio: "2026-09-19T14:15:00Z", fin: "2026-09-19T14:30:00Z" }],
            correosAuditados: [], eventosAuditoria: []
          }
        }),
        obtenerOCrearCarpeta: vi.fn().mockResolvedValue("meeting-folder"),
        moverArchivo: vi.fn(),
        subirDocumentoGoogle: vi.fn(),
        subirPlanillaAsistencia: vi.fn().mockResolvedValue({
          id: "attendance-sheet", name: "asistencia", mimeType: "application/vnd.google-apps.spreadsheet"
        }),
        obtenerParticipantesActivos: vi.fn()
      };
      const mockRepo: ArchivosRepositoryPort = {
        obtenerConfiguracionWorkspacePrincipal: vi.fn().mockResolvedValue(validWorkspaceConfig),
        obtenerEventosParaSincronizar: vi.fn().mockResolvedValue([{
          id: "evt-abierto", codigoReunion: "abc-defg-hij", conferenceRecordName: null,
          emailOrganizador: "host@flacso.edu.uy", cohostEmails: [], archivos: [],
          inicioProgramadoAt: new Date("2026-09-19T14:00:00Z"), finProgramadoAt: new Date("2026-09-19T16:00:00Z"),
          timezone: "America/Montevideo", requiereGrabacion: false, tituloSolicitud: "Clase abierta"
        }]),
        registrarArchivoSincronizado: vi.fn(), actualizarEstadoSincronizacion: vi.fn(),
        registrarErrorSincronizacion: vi.fn(), obtenerDatosInstanciaParaParticipantes: vi.fn(),
        listarArchivosVisibles: vi.fn()
      };

      const result = await sincronizarArtefactosUseCase(mockRepo, () => mockProvider, dummyDescifrar, {
        eventoProveedorIds: ["evt-abierto"]
      });

      expect(mockProvider.subirPlanillaAsistencia).toHaveBeenCalledWith(
        "meeting-folder", expect.any(String), expect.any(Object), expect.any(Date), expect.any(Date),
        "host@flacso.edu.uy", [], undefined
      );
      expect(mockRepo.actualizarEstadoSincronizacion).toHaveBeenCalledWith("evt-abierto", expect.objectContaining({
        archivosSincronizadosAt: null,
        errorArchivos: null
      }));
      expect(result[0]).toMatchObject({ estado: "ARTEFACTOS_PENDIENTES", archivos: 1 });
    });

    it("sincroniza grabaciones y asistencia correctamente", async () => {
      const mockProvider: ArtifactProviderPort = {
        buscarConferencia: vi.fn().mockResolvedValue({
          name: "conf-finalizada",
          startTime: "2026-09-19T14:00:00Z",
          endTime: "2026-09-19T16:00:00Z"
        }),
        obtenerConferencia: vi.fn(),
        obtenerOCrearCarpeta: vi.fn().mockResolvedValue("folder-dest-456"),
        obtenerArtefactos: vi.fn().mockResolvedValue({
          recordings: [
            { resourceName: "conf-finalizada/recordings/rec-1", driveFileId: "file-rec-1", extension: "mp4" }
          ],
          transcripts: [],
          notes: [],
          estadoGrabacion: "GENERADA",
          pendientes: 0
        }),
        moverArchivo: vi.fn().mockResolvedValue({
          id: "file-rec-1",
          name: "video_grabacion.mp4",
          mimeType: "video/mp4",
          size: "50000000",
          webViewLink: "https://drive.google.com/rec-1"
        }),
        obtenerDocumentoAsistencia: vi.fn().mockResolvedValue({
          html: "<html><body>asistencia</body></html>",
          completa: true,
          participantes: 5,
          sesiones: 5
        }),
        subirDocumentoGoogle: vi.fn().mockResolvedValue({
          id: "doc-asistencia-1",
          name: "asistencia.doc",
          mimeType: "application/vnd.google-apps.document"
        }),
        obtenerParticipantesActivos: vi.fn()
      };

      const mockRepo: ArchivosRepositoryPort = {
        obtenerConfiguracionWorkspacePrincipal: vi.fn().mockResolvedValue(validWorkspaceConfig),
        obtenerEventosParaSincronizar: vi.fn().mockResolvedValue([
          {
            id: "evt-finalizado",
            codigoReunion: "abc-defg-hij",
            conferenceRecordName: null,
            emailOrganizador: "host@flacso.edu.uy",
            archivos: [],
            inicioProgramadoAt: new Date("2026-09-19T14:00:00Z"),
            finProgramadoAt: new Date("2026-09-19T16:00:00Z"),
            timezone: "America/Montevideo",
            requiereGrabacion: true,
            tituloSolicitud: "Clase Finalizada"
          }
        ]),
        registrarArchivoSincronizado: vi.fn(),
        actualizarEstadoSincronizacion: vi.fn(),
        registrarErrorSincronizacion: vi.fn(),
        obtenerDatosInstanciaParaParticipantes: vi.fn(),
        listarArchivosVisibles: vi.fn()
      };

      const result = await sincronizarArtefactosUseCase(
        mockRepo,
        () => mockProvider,
        dummyDescifrar,
        { eventoProveedorIds: ["evt-finalizado"] }
      );

      expect(result[0].estado).toBe("SINCRONIZADO");
      expect(result[0].archivos).toBe(2); // 1 video + 1 asistencia
      expect(result[0].grabacion).toBe("DISPONIBLE");
      expect(mockRepo.registrarArchivoSincronizado).toHaveBeenCalledTimes(2);
      expect(mockRepo.actualizarEstadoSincronizacion).toHaveBeenCalledWith(
        "evt-finalizado",
        expect.objectContaining({
          conferenceRecordName: "conf-finalizada",
          driveFolderId: "folder-dest-456",
          archivosSincronizadosAt: expect.any(Date)
        })
      );
    });

    it("genera la planilla si pasaron más de 24 horas aunque la asistencia no esté marcada completa", async () => {
      const finHace30Horas = new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString();
      const mockProvider: ArtifactProviderPort = {
        buscarConferencia: vi.fn().mockResolvedValue({
          name: "conf-antigua",
          startTime: new Date(Date.now() - 32 * 60 * 60 * 1000).toISOString(),
          endTime: finHace30Horas
        }),
        obtenerConferencia: vi.fn(),
        obtenerOCrearCarpeta: vi.fn().mockResolvedValue("folder-dest"),
        obtenerArtefactos: vi.fn().mockResolvedValue({
          recordings: [], transcripts: [], notes: [], estadoGrabacion: "AUSENTE", pendientes: 0
        }),
        moverArchivo: vi.fn(),
        obtenerDocumentoAsistencia: vi.fn().mockResolvedValue({
          html: "<html><body>asistencia</body></html>",
          completa: false, // Incompleta (ej: sesión sin cerrar)
          participantes: 3,
          sesiones: 3
        }),
        subirDocumentoGoogle: vi.fn().mockResolvedValue({
          id: "doc-asistencia-antigua",
          name: "asistencia.doc",
          mimeType: "application/vnd.google-apps.document"
        }),
        obtenerParticipantesActivos: vi.fn()
      };

      const mockRepo: ArchivosRepositoryPort = {
        obtenerConfiguracionWorkspacePrincipal: vi.fn().mockResolvedValue(validWorkspaceConfig),
        obtenerEventosParaSincronizar: vi.fn().mockResolvedValue([
          {
            id: "evt-antiguo",
            codigoReunion: "abc-defg-hij",
            conferenceRecordName: null,
            emailOrganizador: "host@flacso.edu.uy",
            archivos: [],
            inicioProgramadoAt: new Date(Date.now() - 32 * 60 * 60 * 1000),
            finProgramadoAt: new Date(Date.now() - 30 * 60 * 60 * 1000),
            timezone: "America/Montevideo",
            requiereGrabacion: false,
            tituloSolicitud: "Clase Antigua"
          }
        ]),
        registrarArchivoSincronizado: vi.fn(),
        actualizarEstadoSincronizacion: vi.fn(),
        registrarErrorSincronizacion: vi.fn(),
        obtenerDatosInstanciaParaParticipantes: vi.fn(),
        listarArchivosVisibles: vi.fn()
      };

      const result = await sincronizarArtefactosUseCase(
        mockRepo,
        () => mockProvider,
        dummyDescifrar,
        { eventoProveedorIds: ["evt-antiguo"] }
      );

      expect(result[0].estado).toBe("SINCRONIZADO");
      expect(result[0].archivos).toBe(1); // Se generó la asistencia en vez de abandonarse silenciosamente
      expect(mockRepo.registrarArchivoSincronizado).toHaveBeenCalledTimes(1);
    });

    it("ordena grabaciones cronológicamente por startTime antes de nombrarlas", async () => {
      const mockProvider: ArtifactProviderPort = {
        buscarConferencia: vi.fn().mockResolvedValue({
          name: "conf-partes",
          startTime: "2026-09-19T14:00:00Z",
          endTime: "2026-09-19T17:00:00Z"
        }),
        obtenerConferencia: vi.fn(),
        obtenerOCrearCarpeta: vi.fn().mockResolvedValue("folder-dest"),
        obtenerArtefactos: vi.fn().mockResolvedValue({
          // La API devuelve parte 2 primero y parte 1 después
          recordings: [
            { resourceName: "conf/recordings/rec-2", driveFileId: "file-rec-2", startTime: "2026-09-19T15:30:00Z", extension: "mp4" },
            { resourceName: "conf/recordings/rec-1", driveFileId: "file-rec-1", startTime: "2026-09-19T14:05:00Z", extension: "mp4" }
          ],
          transcripts: [], notes: [], estadoGrabacion: "GENERADA", pendientes: 0
        }),
        moverArchivo: vi.fn().mockImplementation(async (_fileId, _folderId, name) => ({
          id: _fileId, name, mimeType: "video/mp4"
        })),
        obtenerDocumentoAsistencia: vi.fn().mockResolvedValue({
          html: "<html>asistencia</html>", completa: true, participantes: 2, sesiones: 2
        }),
        subirDocumentoGoogle: vi.fn().mockResolvedValue({ id: "doc-1", name: "doc", mimeType: "doc" }),
        obtenerParticipantesActivos: vi.fn()
      };

      const mockRepo: ArchivosRepositoryPort = {
        obtenerConfiguracionWorkspacePrincipal: vi.fn().mockResolvedValue(validWorkspaceConfig),
        obtenerEventosParaSincronizar: vi.fn().mockResolvedValue([
          {
            id: "evt-partes",
            codigoReunion: "abc-defg-hij",
            conferenceRecordName: null,
            emailOrganizador: "host@flacso.edu.uy",
            archivos: [],
            inicioProgramadoAt: new Date("2026-09-19T14:00:00Z"),
            finProgramadoAt: new Date("2026-09-19T17:00:00Z"),
            timezone: "America/Montevideo",
            requiereGrabacion: true,
            tituloSolicitud: "Clase Dividida"
          }
        ]),
        registrarArchivoSincronizado: vi.fn(),
        actualizarEstadoSincronizacion: vi.fn(),
        registrarErrorSincronizacion: vi.fn(),
        obtenerDatosInstanciaParaParticipantes: vi.fn(),
        listarArchivosVisibles: vi.fn()
      };

      await sincronizarArtefactosUseCase(
        mockRepo,
        () => mockProvider,
        dummyDescifrar,
        { eventoProveedorIds: ["evt-partes"] }
      );

      // rec-1 (14:05) debe recibir _01_ y rec-2 (15:30) debe recibir _02_
      expect(mockProvider.moverArchivo).toHaveBeenNthCalledWith(
        1,
        "file-rec-1",
        "folder-dest",
        expect.stringContaining("_video_01_")
      );
      expect(mockProvider.moverArchivo).toHaveBeenNthCalledWith(
        2,
        "file-rec-2",
        "folder-dest",
        expect.stringContaining("_video_02_")
      );
    });
  });

  describe("obtenerParticipantesActivosUseCase", () => {
    it("devuelve NO_DISPONIBLE con motivo SIN_MEET si la instancia no tiene código", async () => {
      const mockRepo: ArchivosRepositoryPort = {
        obtenerConfiguracionWorkspacePrincipal: vi.fn(),
        obtenerEventosParaSincronizar: vi.fn(),
        registrarArchivoSincronizado: vi.fn(),
        actualizarEstadoSincronizacion: vi.fn(),
        registrarErrorSincronizacion: vi.fn(),
        obtenerDatosInstanciaParaParticipantes: vi.fn().mockResolvedValue(null),
        listarArchivosVisibles: vi.fn()
      };

      const res = await obtenerParticipantesActivosUseCase(
        mockRepo,
        vi.fn(),
        dummyDescifrar,
        "inst-invalida"
      );
      expect(res.estado).toBe("NO_DISPONIBLE");
      if (res.estado === "NO_DISPONIBLE") {
        expect(res.motivo).toBe("SIN_MEET");
      }
    });

    it("devuelve OK y lista participantes si la conferencia existe", async () => {
      const mockProvider: ArtifactProviderPort = {
        buscarConferencia: vi.fn(),
        obtenerConferencia: vi.fn(),
        obtenerArtefactos: vi.fn(),
        obtenerDocumentoAsistencia: vi.fn(),
        obtenerOCrearCarpeta: vi.fn(),
        moverArchivo: vi.fn(),
        subirDocumentoGoogle: vi.fn(),
        obtenerParticipantesActivos: vi.fn().mockResolvedValue({
          conferenciaExiste: true,
          conferenceName: "spaces/abc/conferenceRecords/cr-1",
          participantesActivos: [
            { nombre: "Participante 1", tipo: "CUENTA_GOOGLE", email: "p1@flacso.edu.uy" }
          ]
        })
      };

      const mockRepo: ArchivosRepositoryPort = {
        obtenerConfiguracionWorkspacePrincipal: vi.fn().mockResolvedValue(validWorkspaceConfig),
        obtenerEventosParaSincronizar: vi.fn(),
        registrarArchivoSincronizado: vi.fn(),
        actualizarEstadoSincronizacion: vi.fn(),
        registrarErrorSincronizacion: vi.fn(),
        obtenerDatosInstanciaParaParticipantes: vi.fn().mockResolvedValue({
          codigoReunion: "abc-defg-hij",
          emailOrganizador: "sala01@flacso.edu.uy",
          inicioProgramadoAt: new Date(),
          finProgramadoAt: new Date()
        }),
        listarArchivosVisibles: vi.fn()
      };

      const res = await obtenerParticipantesActivosUseCase(
        mockRepo,
        () => mockProvider,
        dummyDescifrar,
        "inst-activa"
      );

      expect(res.estado).toBe("OK");
      if (res.estado === "OK") {
        expect(res.conferenciaExiste).toBe(true);
        expect(res.participantes).toHaveLength(1);
      }
    });
  });

  describe("consultas de archivos", () => {
    it("delega el listado visible al repositorio", async () => {
      const listarArchivosVisibles = vi.fn().mockResolvedValue([{ id: "arch-1" }]);
      const mockRepo = { listarArchivosVisibles } as unknown as ArchivosRepositoryPort;
      const actor = { id: "user-1", rol: "ADMINISTRACION" as const };

      const arch = await listarArchivosVisiblesUseCase(mockRepo, actor);

      expect(arch).toHaveLength(1);
      expect(listarArchivosVisibles).toHaveBeenCalledWith(actor);
    });
  });
});
