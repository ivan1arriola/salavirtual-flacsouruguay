import type { Prisma, PrismaClient } from "@prisma/client";
import { extraerCohostEmailsDeInstancia } from "@/src/modules/conferencias/api";
import { obtenerCredencialPrincipalGoogleWorkspace } from "@/src/modules/configuracion/api";
import {
  obtenerAlcanceGrabaciones,
  TIPOS_ARTEFACTO_SINCRONIZABLES,
  VIGENCIA_ESTADO_GRABACION_MS,
  archivoBibliotecaZoom,
  type EstadoArchivoZoomVista,
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
import type { EventosOperativosRepositoryPort, ListarEventosOperativosInput } from "../../application";
import { filtroArchivoReunionMeet } from "./archivo-reunion-meet.filter";

export function crearPrismaArchivosRepositoryAdapter(
  db: PrismaClient
): ArchivosRepositoryPort & EventosOperativosRepositoryPort {
  return {
    async listarEventosOperativos(input: ListarEventosOperativosInput): Promise<readonly string[]> {
      if (input.limite <= 0) {
        return [];
      }
      const finalizadoSinVideo: Prisma.EventoProveedorWhereInput = {
        archivosSincronizadosAt: { not: null },
        archivos: { none: { tipo: "GRABACION" } },
        ...(input.ventana === "CIERRE" ? { grabacionObservadaAt: null } : {})
      };
      const events = await db.eventoProveedor.findMany({
        where: {
          proveedor: { tipo: "GOOGLE_MEET" },
          codigoReunion: { not: null },
          OR: [
            { archivosSincronizadosAt: null },
            ...(input.ventana === "INTERMEDIA" ? [{ errorArchivos: { not: null } }] : []),
            finalizadoSinVideo
          ],
          instancia: {
            estado: { not: "CANCELADA" },
            finProgramadoAt: {
              gte: input.desde,
              ...(input.ventana === "CALIENTE" ? {} : { lt: input.hasta })
            },
            ...(input.ventana === "CALIENTE" ? { inicioProgramadoAt: { lte: input.hasta } } : {})
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
      if (!cred) {
        return null;
      }
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
        where: { id: { in: [...eventoProveedorIds] }, proveedor: { tipo: "GOOGLE_MEET" } },
        include: {
          cuentaProveedor: true,
          archivos: {
            select: { id: true, driveFileId: true, externalResourceName: true, tipo: true, mimeType: true }
          },
          instancia: {
            include: { solicitud: true, cohostEmails: true, cohosts: { include: { cuentaGoogle: true } } }
          }
        }
      });

      return events.map((event) => ({
        id: event.id,
        driveFolderId: event.driveFolderId,
        codigoReunion: event.codigoReunion,
        conferenceRecordName: event.conferenceRecordName,
        emailOrganizador: event.cuentaProveedor?.emailOrganizador ?? null,
        cohostEmails: extraerCohostEmailsDeInstancia(event.instancia),
        archivos: event.archivos,
        asistenciaDriveFileId:
          event.archivos.find(
            (a) => a.tipo === "LISTA_ASISTENCIA" && a.mimeType === "application/vnd.google-apps.spreadsheet"
          )?.driveFileId ?? null,
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
          driveFolderId: datos.driveFolderId === undefined ? undefined : datos.driveFolderId,
          archivosSincronizadosAt: datos.archivosSincronizadosAt,
          errorArchivos: datos.errorArchivos,
          grabacionEstadoMeet: datos.estadoGrabacionMeet,
          grabacionObservadaAt: datos.grabacionObservadaAt
        }
      });
    },

    async registrarErrorSincronizacion(eventoProveedorId: string, error: string): Promise<void> {
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
          proveedor: { tipo: "GOOGLE_MEET" }
        },
        select: {
          codigoReunion: true,
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

      if (!evento) {
        return null;
      }
      return {
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
          eventoProveedor: { instancia: alcanceInstancias(actor) },
          AND: [filtroArchivoReunionMeet()]
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
          eventoProveedor: { proveedor: { tipo: "GOOGLE_MEET" }, codigoReunion: { not: null } }
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
          ? [
              {
                eventoProveedorId: sheet.eventoProveedorId,
                spreadsheetId: sheet.driveFileId,
                emailOrganizador
              }
            ]
          : [];
      });
    },

    async listarGrabacionesDb(actor, input) {
      const q = input.busqueda.trim();
      const grabacionReciente: Prisma.EventoProveedorWhereInput = {
        grabacionEstadoMeet: { in: ["EN_CURSO", "PROCESANDO"] },
        grabacionObservadaAt: { gte: new Date(Date.now() - VIGENCIA_ESTADO_GRABACION_MS) }
      };
      const meeting: Prisma.EventoProveedorWhereInput = {
        proveedor: { tipo: "GOOGLE_MEET" },
        OR: [{ archivos: { some: { tipo: { in: [...TIPOS_ARTEFACTO_SINCRONIZABLES] } } } }, grabacionReciente]
      };
      // Encuentros Zoom: el inventario (no ArchivoReunion) es la fuente; cuentan también los que solo tienen asistencia.
      const tipoZoom: Prisma.ProveedorReunionWhereInput = { tipo: { in: ["ZOOM", "ZOOM_HISTORICO"] } };
      const archivosZoomCon = (
        archivo: Prisma.ArchivoOrigenZoomWhereInput
      ): Prisma.EventoProveedorWhereInput => ({
        proveedor: tipoZoom,
        ocurrenciasArchivoZoom: { some: { archivos: { some: archivo } } }
      });
      const tipoOriginalEn = (tipos: readonly string[]): Prisma.ArchivoOrigenZoomWhereInput => ({
        tipoOriginal: { in: [...tipos], mode: "insensitive" }
      });
      const zoomConAsistencia: Prisma.EventoProveedorWhereInput = {
        proveedor: tipoZoom,
        asistenciaZoom: { some: {} }
      };
      const zoomTodos: Prisma.EventoProveedorWhereInput = {
        proveedor: tipoZoom,
        OR: [
          { ocurrenciasArchivoZoom: { some: { archivos: { some: {} } } } },
          { asistenciaZoom: { some: {} } }
        ]
      };
      const usuarioSearch = {
        OR: [
          { nombres: { contains: q, mode: "insensitive" } },
          { apellidos: { contains: q, mode: "insensitive" } }
        ]
      };
      const docenteSearch = {
        docentePrograma: { is: { docente: { is: { usuario: { is: usuarioSearch } } } } }
      };
      const programaSearch = {
        docentePrograma: { is: { programa: { is: { nombre: { contains: q, mode: "insensitive" } } } } }
      };
      const tituloSearch = { titulo: { contains: q, mode: "insensitive" } };
      const search = (
        q ? { solicitud: { is: { OR: [tituloSearch, programaSearch, docenteSearch] } } } : {}
      ) as Prisma.InstanciaSalaWhereInput;
      const baseConditions: Prisma.InstanciaSalaWhereInput[] = [
        alcanceInstancias(actor),
        search,
        { eventosProveedor: { some: { OR: [meeting, zoomTodos] } } }
      ];
      const base: Prisma.InstanciaSalaWhereInput = { AND: baseConditions };

      const soloGrabaciones: Prisma.InstanciaSalaWhereInput = {
        eventosProveedor: {
          some: {
            OR: [
              {
                proveedor: { tipo: "GOOGLE_MEET" },
                OR: [{ archivos: { some: { tipo: "GRABACION" } } }, grabacionReciente]
              },
              archivosZoomCon(tipoOriginalEn(["MP4"]))
            ]
          }
        }
      };
      const soloAsistencias: Prisma.InstanciaSalaWhereInput = {
        eventosProveedor: {
          some: { OR: [{ ...meeting, archivos: { some: { tipo: "LISTA_ASISTENCIA" } } }, zoomConAsistencia] }
        }
      };
      const soloNotasYTranscripciones: Prisma.InstanciaSalaWhereInput = {
        eventosProveedor: {
          some: {
            OR: [
              { ...meeting, archivos: { some: { tipo: { in: ["NOTAS", "TRANSCRIPCION"] } } } },
              archivosZoomCon(tipoOriginalEn(["TRANSCRIPT", "CC", "AUDIO_TRANSCRIPT", "SUMMARY"]))
            ]
          }
        }
      };
      const categoria: Prisma.InstanciaSalaWhereInput | null =
        input.filtro === "GRABACIONES"
          ? soloGrabaciones
          : input.filtro === "ASISTENCIAS"
            ? soloAsistencias
            : input.filtro === "NOTAS_Y_TRANSCRIPCIONES"
              ? soloNotasYTranscripciones
              : null;
      const filtered: Prisma.InstanciaSalaWhereInput = categoria
        ? { AND: [...baseConditions, categoria] }
        : base;
      const totalEncuentros = await db.instanciaSala.count({ where: filtered });
      const totalPaginas = Math.max(1, Math.ceil(totalEncuentros / 12));
      const pagina = Math.min(Math.max(1, input.pagina), totalPaginas);
      const [todos, grabaciones, asistencias, notas, transcripciones, encuentros] = await Promise.all([
        db.instanciaSala.count({ where: base }),
        db.instanciaSala.count({ where: { AND: [alcanceInstancias(actor), search, soloGrabaciones] } }),
        db.instanciaSala.count({ where: { AND: [...baseConditions, soloAsistencias] } }),
        db.instanciaSala.count({ where: { AND: [...baseConditions, soloNotasYTranscripciones] } }),
        db.instanciaSala.count({
          where: {
            AND: [
              ...baseConditions,
              {
                eventosProveedor: {
                  some: {
                    OR: [
                      { ...meeting, archivos: { some: { tipo: "TRANSCRIPCION" } } },
                      archivosZoomCon(tipoOriginalEn(["TRANSCRIPT", "CC", "AUDIO_TRANSCRIPT"]))
                    ]
                  }
                }
              }
            ]
          }
        }),
        db.instanciaSala.findMany({
          where: filtered,
          orderBy: [{ inicioProgramadoAt: "desc" }, { id: "desc" }],
          skip: (pagina - 1) * 12,
          take: 12,
          include: {
            solicitud: {
              include: {
                docentePrograma: { include: { programa: true, docente: { include: { usuario: true } } } }
              }
            },
            eventosProveedor: {
              where: { OR: [meeting, zoomTodos] },
              include: {
                proveedor: { select: { tipo: true } },
                // Las referencias locales de origen Zoom se excluyen: su fuente en la biblioteca es el inventario.
                archivos: {
                  where: { tipo: { in: [...TIPOS_ARTEFACTO_SINCRONIZABLES] }, ...filtroArchivoReunionMeet() }
                },
                ocurrenciasArchivoZoom: {
                  orderBy: { inicioRealAt: "asc" },
                  select: {
                    id: true,
                    driveFolderId: true,
                    archivos: {
                      orderBy: [{ coleccion: "asc" }, { tipoOriginal: "asc" }, { id: "asc" }],
                      select: {
                        id: true,
                        tipoOriginal: true,
                        variante: true,
                        extension: true,
                        estado: true,
                        tamanoBytes: true,
                        mimeType: true,
                        nombreDestino: true,
                        webViewUrl: true,
                        errorCodigo: true
                      }
                    }
                  }
                },
                _count: { select: { asistenciaZoom: true } }
              }
            }
          }
        })
      ]);
      return {
        pagina,
        totalPaginas,
        totalEncuentros,
        conteos: { todos, grabaciones, asistencias, notas, transcripciones },
        encuentros: encuentros.flatMap((e) =>
          e.eventosProveedor.map((ev) => {
            // Solo los tipos Zoom son Zoom: sin proveedor incluido (mocks antiguos) se asume Meet.
            const esZoom = ev.proveedor?.tipo === "ZOOM" || ev.proveedor?.tipo === "ZOOM_HISTORICO";
            return {
              instanciaId: e.id,
              solicitudId: e.solicitudSalaId,
              proveedor: (esZoom ? "ZOOM" : "GOOGLE_MEET") as "GOOGLE_MEET" | "ZOOM",
              asistenciaZoom: esZoom && ev._count.asistenciaZoom > 0,
              titulo: e.solicitud.titulo,
              programa: e.solicitud.docentePrograma.programa.nombre,
              docente:
                `${e.solicitud.docentePrograma.docente.usuario.nombres ?? ""} ${e.solicitud.docentePrograma.docente.usuario.apellidos ?? ""}`.trim(),
              fechaInicio: e.inicioProgramadoAt,
              finProgramadoAt: e.finProgramadoAt,
              folderId: esZoom
                ? (ev.ocurrenciasArchivoZoom.find((o) => o.driveFolderId)?.driveFolderId ?? null)
                : ev.driveFolderId,
              requiereGrabacion: e.requiereGrabacion,
              archivosSincronizadosAt: ev.archivosSincronizadosAt,
              estadoGrabacionMeet: esZoom
                ? null
                : (ev.grabacionEstadoMeet as import("../../domain").EstadoGrabacionDetectada | null),
              grabacionObservadaAt: esZoom ? null : ev.grabacionObservadaAt,
              archivos: esZoom
                ? ev.ocurrenciasArchivoZoom
                    .flatMap((o) => o.archivos)
                    .map((a) => {
                      const vista = archivoBibliotecaZoom({
                        ...a,
                        estado: a.estado as EstadoArchivoZoomVista
                      });
                      return {
                        id: vista.id,
                        tipo: vista.tipo,
                        nombre: vista.nombre,
                        webViewUrl: vista.enlace,
                        tamanoBytes: vista.tamanoBytes,
                        mimeType: vista.mimeType,
                        etiquetaZoom: vista.etiqueta,
                        descripcionZoom: vista.descripcion,
                        secundarioZoom: vista.secundario,
                        pendienteZoom: vista.pendiente,
                        estadoZoomEtiqueta: vista.estadoEtiqueta,
                        errorCodigo: vista.errorCodigo
                      };
                    })
                : ev.archivos.map((a) => ({
                    id: a.driveFileId,
                    tipo: a.tipo as TipoArtefactoMeet,
                    nombre: a.nombre,
                    webViewUrl: a.webViewUrl,
                    tamanoBytes: a.tamanoBytes,
                    mimeType: a.mimeType
                  }))
            };
          })
        )
      };
    }
  };
}

function alcanceInstancias(actor: SessionActor): Prisma.InstanciaSalaWhereInput {
  const scope = obtenerAlcanceGrabaciones(actor.rol);
  if (scope === "COMPLETO") {
    return {};
  }
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
