import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  crearGoogleArtifactsProviderAdapter,
  crearPrismaArchivosRepositoryAdapter
} from "@/src/modules/archivos/infrastructure";

describe("archivos: infrastructure", () => {
  describe("crearPrismaArchivosRepositoryAdapter", () => {
    it("obtiene configuración principal de workspace", async () => {
      const mockDb = {
        configuracionGoogleWorkspace: {
          findUnique: vi.fn().mockResolvedValue({
            activa: true,
            serviceAccountEmail: "sa@flacso.edu.uy",
            privateKeyCifrada: "enc_key",
            driveDestinationId: "folder_1"
          })
        }
      } as unknown as PrismaClient;

      const repo = crearPrismaArchivosRepositoryAdapter(mockDb);
      const config = await repo.obtenerConfiguracionWorkspacePrincipal();

      expect(config?.activa).toBe(true);
      expect(config?.driveDestinationId).toBe("folder_1");
    });

    it("obtiene y mapea eventos para sincronizar", async () => {
      const mockDb = {
        eventoProveedor: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "evt-1",
              codigoReunion: "abc-defg-hij",
              conferenceRecordName: "cr-1",
              cuentaProveedor: { emailOrganizador: "host@flacso.edu.uy" },
              archivos: [
                { id: "arch-1", externalResourceName: "res-1", tipo: "GRABACION", mimeType: "video/mp4" }
              ],
              instancia: {
                inicioProgramadoAt: new Date("2026-09-19T14:00:00Z"),
                finProgramadoAt: new Date("2026-09-19T16:00:00Z"),
                timezone: "America/Montevideo",
                requiereGrabacion: true,
                solicitud: { titulo: "Clase 1" }
              }
            }
          ])
        }
      } as unknown as PrismaClient;

      const repo = crearPrismaArchivosRepositoryAdapter(mockDb);
      const eventos = await repo.obtenerEventosParaSincronizar(["evt-1"]);

      expect(eventos).toHaveLength(1);
      expect(eventos[0].id).toBe("evt-1");
      expect(eventos[0].emailOrganizador).toBe("host@flacso.edu.uy");
      expect(eventos[0].tituloSolicitud).toBe("Clase 1");
    });

    it("registra archivo sincronizado vía upsert", async () => {
      const mockDb = {
        archivoReunion: {
          upsert: vi.fn().mockResolvedValue({})
        }
      } as unknown as PrismaClient;

      const repo = crearPrismaArchivosRepositoryAdapter(mockDb);
      await repo.registrarArchivoSincronizado(
        "evt-1",
        "GRABACION",
        { resourceName: "rec-1", driveFileId: "drive-1", startTime: "2026-09-19T14:00:00Z" },
        { id: "drive-1", name: "grabacion.mp4", mimeType: "video/mp4", size: "100" }
      );

      expect(mockDb.archivoReunion.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            eventoProveedorId_externalResourceName: {
              eventoProveedorId: "evt-1",
              externalResourceName: "rec-1"
            }
          }
        })
      );
    });

    it("actualiza estado y registra error en evento", async () => {
      const mockDb = {
        eventoProveedor: {
          update: vi.fn().mockResolvedValue({})
        }
      } as unknown as PrismaClient;

      const repo = crearPrismaArchivosRepositoryAdapter(mockDb);
      await repo.actualizarEstadoSincronizacion("evt-1", {
        conferenceRecordName: "cr-1",
        driveFolderId: "f-1",
        archivosSincronizadosAt: new Date(),
        errorArchivos: null
      });

      expect(mockDb.eventoProveedor.update).toHaveBeenCalledTimes(1);

      await repo.registrarErrorSincronizacion("evt-1", "Error de red");
      expect(mockDb.eventoProveedor.update).toHaveBeenCalledTimes(2);
    });

    it("consulta datos de instancia para participantes en vivo", async () => {
      const mockDb = {
        eventoProveedor: {
          findFirst: vi.fn().mockResolvedValue({
            codigoReunion: "abc-defg-hij",
            cuentaProveedor: { emailOrganizador: "sala01@flacso.edu.uy" },
            instancia: {
              inicioProgramadoAt: new Date("2026-09-19T14:00:00Z"),
              finProgramadoAt: new Date("2026-09-19T16:00:00Z")
            }
          })
        }
      } as unknown as PrismaClient;

      const repo = crearPrismaArchivosRepositoryAdapter(mockDb);
      const data = await repo.obtenerDatosInstanciaParaParticipantes("inst-1");

      expect(data?.codigoReunion).toBe("abc-defg-hij");
      expect(data?.emailOrganizador).toBe("sala01@flacso.edu.uy");
    });

    it("aplica filtros de alcance para docente y asistente en listados", async () => {
      const mockDb = {
        archivoReunion: { findMany: vi.fn().mockResolvedValue([]) },
        eventoProveedor: { findMany: vi.fn().mockResolvedValue([]) }
      } as unknown as PrismaClient;

      const repo = crearPrismaArchivosRepositoryAdapter(mockDb);

      await repo.listarArchivosVisibles({ id: "doc-1", rol: "DOCENTE" });
      expect(mockDb.archivoReunion.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            eventoProveedor: {
              instancia: expect.objectContaining({
                solicitud: expect.any(Object)
              })
            }
          })
        })
      );

      await repo.listarArchivosVisibles({ id: "asist-1", rol: "ASISTENTE_TECNICO" });
      expect(mockDb.archivoReunion.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            eventoProveedor: {
              instancia: expect.objectContaining({
                asignaciones: expect.any(Object)
              })
            }
          })
        })
      );
    });
  });

  describe("crearGoogleArtifactsProviderAdapter", () => {
    it("inicializa el adaptador con las credenciales", () => {
      const adapter = crearGoogleArtifactsProviderAdapter({
        serviceAccountEmail: "sa@flacso.edu.uy",
        privateKey: "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0...\n-----END RSA PRIVATE KEY-----\n",
        subject: "sala01@flacso.edu.uy"
      });
      expect(adapter).toBeDefined();
      expect(typeof adapter.buscarConferencia).toBe("function");
      expect(typeof adapter.moverArchivo).toBe("function");
    });
  });
});

it("incluye encuentros Zoom con todos sus archivos del inventario, proveedor real y asistencia", async () => {
  const ocurrencia = {
    id: "oz1",
    driveFolderId: "carpeta-zoom",
    inicioRealAt: new Date("2026-11-09T10:00:00Z"),
    archivos: [
      {
        id: "az1",
        tipoOriginal: "MP4",
        variante: "speaker",
        extension: "mp4",
        estado: "CONSERVADO",
        tamanoBytes: 10n,
        mimeType: "video/mp4",
        nombreDestino: "clase.mp4",
        webViewUrl: "https://drive.google.com/file/d/x/view",
        errorCodigo: null
      },
      {
        id: "az2",
        tipoOriginal: "M4A",
        variante: null,
        extension: "m4a",
        estado: "PENDIENTE",
        tamanoBytes: null,
        mimeType: null,
        nombreDestino: "audio.m4a",
        webViewUrl: null,
        errorCodigo: null
      },
      {
        id: "az3",
        tipoOriginal: "CHAT",
        variante: null,
        extension: "txt",
        estado: "ERROR_REINTENTABLE",
        tamanoBytes: 1n,
        mimeType: "text/plain",
        nombreDestino: "chat.txt",
        webViewUrl: null,
        errorCodigo: "TOPE_DIARIO"
      }
    ]
  };
  const instancia = {
    id: "inst-z",
    solicitudSalaId: "sol-9",
    inicioProgramadoAt: new Date("2026-11-09T10:00:00Z"),
    finProgramadoAt: new Date("2026-11-09T11:00:00Z"),
    requiereGrabacion: true,
    solicitud: {
      titulo: "Clase Zoom",
      docentePrograma: {
        programa: { nombre: "Prog" },
        docente: { usuario: { nombres: "Ana", apellidos: "P" } }
      }
    },
    eventosProveedor: [
      {
        id: "ev-z",
        driveFolderId: null,
        archivosSincronizadosAt: null,
        grabacionEstadoMeet: null,
        grabacionObservadaAt: null,
        proveedor: { tipo: "ZOOM" },
        archivos: [],
        ocurrenciasArchivoZoom: [ocurrencia],
        _count: { asistenciaZoom: 3 }
      }
    ]
  };
  const count = vi.fn().mockResolvedValue(1);
  const findMany = vi.fn().mockResolvedValue([instancia]);
  const mockDb = { instanciaSala: { count, findMany } } as unknown as PrismaClient;
  const repo = crearPrismaArchivosRepositoryAdapter(mockDb);
  const r = await repo.listarGrabacionesDb!(
    { id: "a", rol: "ADMINISTRACION" },
    { pagina: 1, busqueda: "", filtro: "TODOS" }
  );
  expect(r.encuentros).toHaveLength(1);
  const g = r.encuentros[0]!;
  expect(g).toMatchObject({
    instanciaId: "inst-z",
    solicitudId: "sol-9",
    proveedor: "ZOOM",
    folderId: "carpeta-zoom",
    asistenciaZoom: true
  });
  expect(g.archivos).toHaveLength(3);
  expect(g.archivos[0]).toMatchObject({
    tipo: "GRABACION",
    webViewUrl: "https://drive.google.com/file/d/x/view",
    etiquetaZoom: "Video",
    pendienteZoom: false
  });
  expect(g.archivos[1]).toMatchObject({
    tipo: "OTRO",
    etiquetaZoom: "Audio",
    pendienteZoom: true,
    webViewUrl: null,
    estadoZoomEtiqueta: "Pendiente de copia"
  });
  expect(g.archivos[2]).toMatchObject({ etiquetaZoom: "Chat", errorCodigo: "TOPE_DIARIO" });
  // El listado considera eventos Zoom en el alcance de la consulta.
  expect(JSON.stringify(findMany.mock.calls[0]![0].where)).toContain("ZOOM");
});

it("el filtro GRABACIONES exige MP4 en Zoom y el de asistencias acepta registros de asistencia Zoom", async () => {
  const count = vi.fn().mockResolvedValue(0);
  const findMany = vi.fn().mockResolvedValue([]);
  const mockDb = { instanciaSala: { count, findMany } } as unknown as PrismaClient;
  const repo = crearPrismaArchivosRepositoryAdapter(mockDb);
  await repo.listarGrabacionesDb!(
    { id: "a", rol: "ADMINISTRACION" },
    { pagina: 1, busqueda: "", filtro: "GRABACIONES" }
  );
  expect(JSON.stringify(findMany.mock.calls[0]![0].where)).toContain("MP4");
  await repo.listarGrabacionesDb!(
    { id: "a", rol: "ADMINISTRACION" },
    { pagina: 1, busqueda: "", filtro: "ASISTENCIAS" }
  );
  expect(JSON.stringify(findMany.mock.calls[1]![0].where)).toContain("asistenciaZoom");
});

it("pagina encuentros desde Prisma después del archivo 300 y mantiene alcance, filtro y orden", async () => {
  const count = vi.fn().mockResolvedValueOnce(301).mockResolvedValue(301);
  const findMany = vi.fn().mockResolvedValue([]);
  const mockDb = { instanciaSala: { count, findMany } } as unknown as PrismaClient;
  const repo = crearPrismaArchivosRepositoryAdapter(mockDb);
  const result = await repo.listarGrabacionesDb!(
    { id: "doc-1", rol: "DOCENTE" },
    { pagina: 26, busqueda: "clase", filtro: "ASISTENCIAS" }
  );
  expect(result).toMatchObject({ pagina: 26, totalPaginas: 26, totalEncuentros: 301 });
  expect(findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      skip: 300,
      take: 12,
      orderBy: [{ inicioProgramadoAt: "desc" }, { id: "desc" }]
    })
  );
  const where = findMany.mock.calls[0]![0].where;
  expect(where.AND).toHaveLength(4);
  expect(JSON.stringify(where)).toContain("doc-1");
  expect(JSON.stringify(where)).toContain("LISTA_ASISTENCIA");
});
