import { describe, expect, it, vi } from "vitest";
import {
  listarArchivosVisiblesUseCase,
  listarGrabacionesNoRealizadasVisiblesUseCase,
  listarGrabacionesPendientesVisiblesUseCase,
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
    it("devuelve ERROR si falta la configuración de Google Workspace", async () => {
      const mockRepo: ArchivosRepositoryPort = {
        obtenerConfiguracionWorkspacePrincipal: vi.fn().mockResolvedValue(null),
        obtenerEventosParaSincronizar: vi.fn(),
        registrarArchivoSincronizado: vi.fn(),
        actualizarEstadoSincronizacion: vi.fn(),
        registrarErrorSincronizacion: vi.fn(),
        obtenerDatosInstanciaParaParticipantes: vi.fn(),
        listarArchivosVisibles: vi.fn(),
        listarGrabacionesPendientesVisibles: vi.fn(),
        listarGrabacionesNoRealizadasVisibles: vi.fn()
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
        listarArchivosVisibles: vi.fn(),
        listarGrabacionesPendientesVisibles: vi.fn(),
        listarGrabacionesNoRealizadasVisibles: vi.fn()
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
        obtenerDocumentoAsistencia: vi.fn(),
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
        listarArchivosVisibles: vi.fn(),
        listarGrabacionesPendientesVisibles: vi.fn(),
        listarGrabacionesNoRealizadasVisibles: vi.fn()
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
        listarArchivosVisibles: vi.fn(),
        listarGrabacionesPendientesVisibles: vi.fn(),
        listarGrabacionesNoRealizadasVisibles: vi.fn()
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
        listarArchivosVisibles: vi.fn(),
        listarGrabacionesPendientesVisibles: vi.fn(),
        listarGrabacionesNoRealizadasVisibles: vi.fn()
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
        listarArchivosVisibles: vi.fn(),
        listarGrabacionesPendientesVisibles: vi.fn(),
        listarGrabacionesNoRealizadasVisibles: vi.fn()
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

  describe("consultas de grabaciones", () => {
    it("delega consultas visibles al repositorio", async () => {
      const mockRepo: ArchivosRepositoryPort = {
        obtenerConfiguracionWorkspacePrincipal: vi.fn(),
        obtenerEventosParaSincronizar: vi.fn(),
        registrarArchivoSincronizado: vi.fn(),
        actualizarEstadoSincronizacion: vi.fn(),
        registrarErrorSincronizacion: vi.fn(),
        obtenerDatosInstanciaParaParticipantes: vi.fn(),
        listarArchivosVisibles: vi.fn().mockResolvedValue([{ id: "arch-1" }]),
        listarGrabacionesPendientesVisibles: vi.fn().mockResolvedValue([{ id: "evt-p1" }]),
        listarGrabacionesNoRealizadasVisibles: vi.fn().mockResolvedValue([{ id: "evt-nr1" }])
      };

      const actor = { id: "user-1", rol: "ADMINISTRACION" as const };
      const ahora = new Date();

      const arch = await listarArchivosVisiblesUseCase(mockRepo, actor);
      expect(arch).toHaveLength(1);

      const pend = await listarGrabacionesPendientesVisiblesUseCase(mockRepo, actor, ahora, ahora);
      expect(pend).toHaveLength(1);

      const noReal = await listarGrabacionesNoRealizadasVisiblesUseCase(mockRepo, actor, ahora, ahora);
      expect(noReal).toHaveLength(1);
    });
  });
});
