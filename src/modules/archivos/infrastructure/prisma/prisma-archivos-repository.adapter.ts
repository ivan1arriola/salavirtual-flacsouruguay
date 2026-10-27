import type { Prisma, PrismaClient } from "@prisma/client";
import { extraerCohostEmailsDeInstancia } from "@/src/modules/conferencias/api";
import { obtenerCredencialPrincipalGoogleWorkspace } from "@/src/modules/configuracion/api";
import {
  obtenerAlcanceGrabaciones,
  TIPOS_ARTEFACTO_SINCRONIZABLES,
  type GoogleArtifact,
  type MovedDriveFile,
  type TipoArtefactoMeet
} from "../../domain";
import type {
  ArchivoMeetVisibleModel,
  ArchivosRepositoryPort,
  ConfiguracionWorkspaceArchivos,
  DatosInstanciaParaParticipantes,
  EstadoSincronizacionInput,
  EventoParaSincronizarArchivos,
  PlanillaAsistenciaCandidata,
  SessionActor
} from "../../ports";
import type {
  EventosOperativosRepositoryPort,
  ListarEventosOperativosInput
} from "../../application";
import { FILTRO_PROVEEDOR_OPERATIVO } from "@/src/modules/conferencias/proveedores";

export function crearPrismaArchivosRepositoryAdapter(
  db: PrismaClient
): ArchivosRepositoryPort & EventosOperativosRepositoryPort {
  return {
    async listarEventosOperativos(input: ListarEventosOperativosInput): Promise<readonly string[]> {
      if (input.limite <= 0) return [];
      const conPendientesOError = input.ventana === "INTERMEDIA";
      const events = await db.eventoProveedor.findMany({
        where: {
          proveedor: FILTRO_PROVEEDOR_OPERATIVO,
          codigoReunion: { not: null },
          ...(conPendientesOError
            ? { OR: [{ archivosSincronizadosAt: null }, { errorArchivos: { not: null } }] }
            : { archivosSincronizadosAt: null }),
          instancia: {
            estado: { not: "CANCELADA" },
            finProgramadoAt: { gte: input.desde, [input.ventana === "CALIENTE" ? "lte" : "lt"]: input.hasta }
          }
        },
        orderBy: { instancia: { finProgramadoAt: input.ventana === "CALIENTE" ? "desc" : "asc" } },
        take: input.limite,
        select: { id: true }
      });
      return events.map(({ id }) => id);
    },
    async obtenerConfiguracionWorkspacePrincipal(): Promise<ConfiguracionWorkspaceArchivos | null> {
      const cred = await obtenerCredencialPrincipalGoogleWorkspace(db, (val) => val, { requireActiva: true });
      if (!cred) return null;
      return {
        activa: cred.activa,
        serviceAccountEmail: cred.serviceAccountEmail,
        privateKeyCifrada: cred.privateKeyCifrada ?? cred.privateKey,
        driveDestinationId: cred.driveDestinationId,
        serviceAccountSubject: cred.serviceAccountSubject
      };
    },

    async obtenerEventosParaSincronizar(
      eventoProveedorIds: readonly string[]
    ): Promise<readonly EventoParaSincronizarArchivos[]> {
      const events = await db.eventoProveedor.findMany({
        where: { id: { in: [...eventoProveedorIds] }, proveedor: FILTRO_PROVEEDOR_OPERATIVO },
        include: {
          cuentaProveedor: true,
          proveedor: { select: { tipo: true } },
          archivos: { select: { id: true, driveFileId: true, externalResourceName: true, tipo: true, mimeType: true } },
          instancia: { include: { solicitud: true, cohostEmails: true, cohosts: { include: { cuentaGoogle: true } } } }
        }
      });

      return events.map((event) => ({
        id: event.id,
        tipoProveedor: event.proveedor?.tipo === "ZOOM" ? ("ZOOM" as const) : ("GOOGLE_MEET" as const),
        driveFolderId: event.driveFolderId,
        codigoReunion: event.codigoReunion,
        conferenceRecordName: event.conferenceRecordName,
        emailOrganizador: event.cuentaProveedor?.emailOrganizador ?? null,
        cohostEmails: extraerCohostEmailsDeInstancia(event.instancia),
        archivos: event.archivos,
        asistenciaDriveFileId: event.archivos.find(a => a.tipo === "LISTA_ASISTENCIA" && a.mimeType === "application/vnd.google-apps.spreadsheet")?.driveFileId ?? null,
        inicioProgramadoAt: event.instancia.inicioProgramadoAt,
        finProgramadoAt: event.instancia.finProgramadoAt,
        timezone: event.instancia.timezone,
        requiereGrabacion: event.instancia.requiereGrabacion,
        tituloSolicitud: event.instancia.solicitud.titulo
      }));
    },

    async registrarArchivoSincronizado(
      eventoProveedorId: string,
      tipo: TipoArtefactoMeet,
      artifact: GoogleArtifact,
      drive: MovedDriveFile
    ): Promise<void> {
      await db.archivoReunion.upsert({
        where: {
          eventoProveedorId_externalResourceName: {
            eventoProveedorId,
            externalResourceName: artifact.resourceName
          }
        },
        create: {
          eventoProveedorId,
          tipo,
          externalResourceName: artifact.resourceName,
          driveFileId: drive.id,
          nombre: drive.name,
          mimeType: drive.mimeType,
          tamanoBytes: drive.size ? BigInt(drive.size) : null,
          webViewUrl: drive.webViewLink,
          capturadoAt: artifact.startTime ? new Date(artifact.startTime) : new Date()
        },
        update: {
          tipo,
          driveFileId: drive.id,
          nombre: drive.name,
          mimeType: drive.mimeType,
          tamanoBytes: drive.size ? BigInt(drive.size) : null,
          webViewUrl: drive.webViewLink,
          capturadoAt: artifact.startTime ? new Date(artifact.startTime) : new Date()
        }
      });
    },

    async actualizarEstadoSincronizacion(
      eventoProveedorId: string,
      datos: EstadoSincronizacionInput
    ): Promise<void> {
      await db.eventoProveedor.update({
        where: { id: eventoProveedorId },
        data: {
          conferenceRecordName: datos.conferenceRecordName,
          driveFolderId: datos.driveFolderId,
          archivosSincronizadosAt: datos.archivosSincronizadosAt,
          errorArchivos: datos.errorArchivos
        }
      });
    },

    async registrarErrorSincronizacion(
      eventoProveedorId: string,
      error: string
    ): Promise<void> {
      await db.eventoProveedor.update({
        where: { id: eventoProveedorId },
        data: { errorArchivos: error }
      });
    },

    async obtenerDatosInstanciaParaParticipantes(
      instanciaId: string
    ): Promise<DatosInstanciaParaParticipantes | null> {
      const evento = await db.eventoProveedor.findFirst({
        where: {
          instanciaSalaId: instanciaId,
          proveedor: FILTRO_PROVEEDOR_OPERATIVO
        },
        select: {
          codigoReunion: true,
          proveedor: { select: { tipo: true } },
          cuentaProveedor: {
            select: { emailOrganizador: true }
          },
          instancia: {
            select: {
              inicioProgramadoAt: true,
              finProgramadoAt: true
            }
          }
        }
      });

      if (!evento) return null;
      return {
        tipoProveedor: evento.proveedor?.tipo === "ZOOM" ? ("ZOOM" as const) : ("GOOGLE_MEET" as const),
        codigoReunion: evento.codigoReunion,
        emailOrganizador: evento.cuentaProveedor?.emailOrganizador ?? null,
        inicioProgramadoAt: evento.instancia.inicioProgramadoAt,
        finProgramadoAt: evento.instancia.finProgramadoAt
      };
    },

    async listarArchivosVisibles(actor: SessionActor): Promise<readonly ArchivoMeetVisibleModel[]> {
      return db.archivoReunion.findMany({
        where: {
          tipo: { in: [...TIPOS_ARTEFACTO_SINCRONIZABLES] },
          eventoProveedor: { instancia: alcanceInstancias(actor) }
        },
        orderBy: [{ capturadoAt: "desc" }, { createdAt: "desc" }],
        take: 300,
        include: {
          eventoProveedor: {
            include: {
              instancia: {
                include: {
                  solicitud: {
                    include: {
                      docentePrograma: {
                        include: {
                          programa: true,
                          docente: { include: { usuario: true } }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      });
    },

    async listarPlanillasAsistenciaCandidatas(): Promise<readonly PlanillaAsistenciaCandidata[]> {
      const sheets = await db.archivoReunion.findMany({
        where: {
          tipo: "LISTA_ASISTENCIA",
          mimeType: "application/vnd.google-apps.spreadsheet",
          eventoProveedor: { proveedor: FILTRO_PROVEEDOR_OPERATIVO, codigoReunion: { not: null } }
        },
        orderBy: [{ capturadoAt: "desc" }, { createdAt: "desc" }],
        select: {
          eventoProveedorId: true,
          driveFileId: true,
          eventoProveedor: { select: { cuentaProveedor: { select: { emailOrganizador: true } } } }
        }
      });
      return sheets.flatMap((sheet) => {
        const emailOrganizador = sheet.eventoProveedor.cuentaProveedor?.emailOrganizador;
        return emailOrganizador
          ? [{ eventoProveedorId: sheet.eventoProveedorId, spreadsheetId: sheet.driveFileId, emailOrganizador }]
          : [];
      });
    },

    async listarGrabacionesDb(actor, input) {
      const q = input.busqueda.trim();
      const meeting: Prisma.EventoProveedorWhereInput = {
        proveedor: FILTRO_PROVEEDOR_OPERATIVO,
        archivos: { some: { tipo: { in: [...TIPOS_ARTEFACTO_SINCRONIZABLES] } } }
      };
      const usuarioSearch = { OR: [{ nombres: { contains: q, mode: "insensitive" } }, { apellidos: { contains: q, mode: "insensitive" } }] };
      const docenteSearch = { docentePrograma: { is: { docente: { is: { usuario: { is: usuarioSearch } } } } } };
      const programaSearch = { docentePrograma: { is: { programa: { is: { nombre: { contains: q, mode: "insensitive" } } } } } };
      const tituloSearch = { titulo: { contains: q, mode: "insensitive" } };
      const search = (q ? { solicitud: { is: { OR: [tituloSearch, programaSearch, docenteSearch] } } } : {}) as Prisma.InstanciaSalaWhereInput;
      const baseConditions: Prisma.InstanciaSalaWhereInput[] = [alcanceInstancias(actor), search, { eventosProveedor: { some: meeting } }];
      const base: Prisma.InstanciaSalaWhereInput = { AND: baseConditions };
      const tipo = input.filtro === "GRABACIONES" ? "GRABACION" : input.filtro === "ASISTENCIAS" ? "LISTA_ASISTENCIA" : undefined;
      const categoria: Prisma.InstanciaSalaWhereInput | null = tipo ? { eventosProveedor: { some: { ...meeting, archivos: { some: { tipo } } } } }
        : input.filtro === "NOTAS_Y_TRANSCRIPCIONES" ? { eventosProveedor: { some: { ...meeting, archivos: { some: { tipo: { in: ["NOTAS", "TRANSCRIPCION"] } } } } } } : null;
      const filtered: Prisma.InstanciaSalaWhereInput = categoria ? { AND: [...baseConditions, categoria] } : base;
      const totalEncuentros = await db.instanciaSala.count({ where: filtered });
      const totalPaginas = Math.max(1, Math.ceil(totalEncuentros / 12));
      const pagina = Math.min(Math.max(1, input.pagina), totalPaginas);
      const [todos, grabaciones, asistencias, notas, transcripciones, encuentros] = await Promise.all([
        db.instanciaSala.count({ where: base }),
        db.instanciaSala.count({ where: { AND: [...baseConditions, { eventosProveedor: { some: { ...meeting, archivos: { some: { tipo: "GRABACION" } } } } }] } }),
        db.instanciaSala.count({ where: { AND: [...baseConditions, { eventosProveedor: { some: { ...meeting, archivos: { some: { tipo: "LISTA_ASISTENCIA" } } } } }] } }),
        db.instanciaSala.count({ where: { AND: [...baseConditions, { eventosProveedor: { some: { ...meeting, archivos: { some: { tipo: { in: ["NOTAS", "TRANSCRIPCION"] } } } } } }] } }),
        db.instanciaSala.count({ where: { AND: [...baseConditions, { eventosProveedor: { some: { ...meeting, archivos: { some: { tipo: "TRANSCRIPCION" } } } } }] } }),
        db.instanciaSala.findMany({
          where: filtered,
          orderBy: [{ inicioProgramadoAt: "desc" }, { id: "desc" }],
          skip: (pagina - 1) * 12,
          take: 12,
          include: {
            solicitud: { include: { docentePrograma: { include: { programa: true, docente: { include: { usuario: true } } } } } },
            eventosProveedor: { where: meeting, include: { archivos: { where: { tipo: { in: [...TIPOS_ARTEFACTO_SINCRONIZABLES] } } } } }
          }
        })
      ]);
      return { pagina, totalPaginas, totalEncuentros, conteos: { todos, grabaciones, asistencias, notas, transcripciones }, artifacts: encuentros.flatMap(e => e.eventosProveedor.flatMap(ev => ev.archivos.map(a => ({
        ...a, tipo: a.tipo as TipoArtefactoMeet, capturadoAt: a.capturadoAt, createdAt: a.createdAt,
        eventoProveedor: { driveFolderId: ev.driveFolderId, archivosSincronizadosAt: ev.archivosSincronizadosAt, instancia: {
          id: e.id, inicioProgramadoAt: e.inicioProgramadoAt, finProgramadoAt: e.finProgramadoAt, requiereGrabacion: e.requiereGrabacion,
          solicitud: e.solicitud
        } }
      })))) };
    }
  };
}

function alcanceInstancias(actor: SessionActor): Prisma.InstanciaSalaWhereInput {
  const scope = obtenerAlcanceGrabaciones(actor.rol);
  if (scope === "COMPLETO") return {};
  if (scope === "PROGRAMAS_DOCENTE") {
    return {
      solicitud: {
        docentePrograma: {
          programa: {
            docentes: {
              some: { activo: true, docente: { usuarioId: actor.id } }
            }
          }
        }
      }
    };
  }
  return {
    asignaciones: {
      some: {
        asistenteTecnico: { usuarioId: actor.id },
        estado: { in: ["ASIGNADO", "ACEPTADO"] }
      }
    }
  };
}
