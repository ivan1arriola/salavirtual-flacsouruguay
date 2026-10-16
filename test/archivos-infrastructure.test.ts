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
              archivos: [{ id: "arch-1", externalResourceName: "res-1", tipo: "GRABACION", mimeType: "video/mp4" }],
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

      await repo.listarGrabacionesPendientesVisibles(
        { id: "asist-1", rol: "ASISTENTE_TECNICO" },
        new Date(),
        new Date()
      );
      expect(mockDb.eventoProveedor.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            instancia: expect.objectContaining({
              asignaciones: expect.any(Object)
            })
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


    it("pagina encuentros desde Prisma despu�s del archivo 300 y mantiene alcance, filtro y orden", async () => {
      const count = vi.fn().mockResolvedValueOnce(301).mockResolvedValue(301);
      const findMany = vi.fn().mockResolvedValue([]);
      const mockDb = { instanciaSala: { count, findMany } } as unknown as PrismaClient;
      const repo = crearPrismaArchivosRepositoryAdapter(mockDb);
      const result = await repo.listarGrabacionesDb!({ id: "doc-1", rol: "DOCENTE" }, { pagina: 26, busqueda: "clase", filtro: "ASISTENCIAS" });
      expect(result).toMatchObject({ pagina: 26, totalPaginas: 26, totalEncuentros: 301 });
      expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 300, take: 12, orderBy: [{ inicioProgramadoAt: "desc" }, { id: "desc" }] }));
      const where = findMany.mock.calls[0]![0].where;
      expect(where.AND).toHaveLength(4);
      expect(JSON.stringify(where)).toContain("doc-1");
      expect(JSON.stringify(where)).toContain("LISTA_ASISTENCIA");
    });
