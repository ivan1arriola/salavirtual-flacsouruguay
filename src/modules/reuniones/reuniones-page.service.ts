import type { Prisma, PrismaClient } from "@prisma/client";
import {
  agruparEncuentrosPorSerie,
  calcularInfoPaginacion,
  normalizarCodigoReunionBuscado,
  parsearFechaFiltro,
  resolverPaginacionAgenda,
  resolverPeriodoAgenda,
  resolverVistaAgenda
} from "./agenda-view.domain";
import { filtroProveedorActivo, resolverProveedorReunion } from "./proveedor-reunion.domain";

const ACTIVE_ASSIGNMENTS = ["ASIGNADO", "ACEPTADO"] as const;
export type PeriodoAgenda = "proximas" | "anteriores";

export const meetingInclude = {
  solicitud: {
    include: {
      docentePrograma: {
        include: { programa: true, docente: { include: { usuario: true } } }
      }
    }
  },
  eventosProveedor: { include: { proveedor: true, cuentaProveedor: true } },
  cohosts: {
    include: {
      cuentaGoogle: {
        include: { user: true }
      }
    }
  },
  cohostEmails: true,
  asignaciones: {
    where: { estado: { in: [...ACTIVE_ASSIGNMENTS] } },
    include: { asistenteTecnico: { include: { usuario: true } } },
    orderBy: { updatedAt: "desc" as const },
    take: 1
  }
} satisfies Prisma.InstanciaSalaInclude;

export function startOfMontevideoDay(date: Date): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Montevideo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const value = (type: "year" | "month" | "day") =>
    parts.find((part) => part.type === type)?.value;
  return new Date(
    `${value("year")}-${value("month")}-${value("day")}T00:00:00-03:00`
  );
}

export type SessionActorReuniones = Readonly<{
  id: string;
  rol: string;
  activo: boolean;
}>;

export type ReunionesPageSearchParams = Readonly<{
  q?: string;
  vista?: string;
  programa?: string;
  periodo?: string;
  page?: string;
  porPagina?: string;
  desde?: string;
  hasta?: string;
  /** `meet` o `zoom`: sólo los encuentros cuyo proveedor activo es ese. Sin valor, no se filtra. */
  proveedor?: string;
}>;

export async function obtenerDatosPaginaReuniones(
  db: PrismaClient,
  actor: SessionActorReuniones,
  params: ReunionesPageSearchParams
) {
  const {
    q = "",
    vista: vistaParam,
    programa: programaParam = "",
    periodo: periodoParam,
    page: pageParam,
    porPagina: porPaginaParam,
    desde: desdeParam = "",
    hasta: hastaParam = "",
    proveedor: proveedorParam
  } = params;

  const vista = resolverVistaAgenda(vistaParam);
  const proveedor = resolverProveedorReunion(proveedorParam);
  const proveedorWhere: Prisma.InstanciaSalaWhereInput = proveedor
    ? { AND: [filtroProveedorActivo(proveedor) as Prisma.InstanciaSalaWhereInput] }
    : {};
  const query = q.trim();
  const programaId = actor.rol === "ADMINISTRACION" ? programaParam.trim() : "";
  // El alcance de cada rol lo fija requestScope: un docente solo ve reuniones de sus programas.
  const periodo: PeriodoAgenda = resolverPeriodoAgenda(periodoParam);
  const isHistory = periodo === "anteriores";
  const meetingCodeQuery = normalizarCodigoReunionBuscado(query);
  const now = new Date();

  const desdeIso = parsearFechaFiltro(desdeParam, false);
  const hastaIso = parsearFechaFiltro(hastaParam, true);
  const desdeDate = desdeIso ? new Date(desdeIso) : undefined;
  const hastaDate = hastaIso ? new Date(hastaIso) : undefined;

  const requestScope: Prisma.SolicitudSalaWhereInput =
    actor.rol === "DOCENTE"
      ? {
          docentePrograma: {
            programa: {
              activo: true,
              docentes: {
                some: {
                  activo: true,
                  docente: { usuarioId: actor.id }
                }
              }
            }
          }
        }
      : programaId
        ? { docentePrograma: { programaId } }
        : {};

  const temporalWhere: Prisma.InstanciaSalaWhereInput = {
    finProgramadoAt: isHistory ? { lt: now } : { gte: now },
    ...(desdeDate || hastaDate
      ? {
          inicioProgramadoAt: {
            ...(desdeDate ? { gte: desdeDate } : {}),
            ...(hastaDate ? { lte: hastaDate } : {})
          }
        }
      : {})
  };

  const dateRangeWhere: Prisma.InstanciaSalaWhereInput =
    desdeDate || hastaDate
      ? {
          inicioProgramadoAt: {
            ...(desdeDate ? { gte: desdeDate } : {}),
            ...(hastaDate ? { lte: hastaDate } : {})
          }
        }
      : {};

  const instanceSearch: Prisma.InstanciaSalaWhereInput = query
    ? {
        OR: [
          {
            eventosProveedor: {
              some: {
                OR: [
                  { codigoReunion: { contains: meetingCodeQuery, mode: "insensitive" } },
                  { joinUrl: { contains: query, mode: "insensitive" } }
                ]
              }
            }
          },
          { solicitud: { titulo: { contains: query, mode: "insensitive" } } },
          {
            solicitud: {
              docentePrograma: {
                programa: { nombre: { contains: query, mode: "insensitive" } }
              }
            }
          },
          {
            solicitud: {
              docentePrograma: {
                docente: {
                  usuario: {
                    OR: [
                      { nombres: { contains: query, mode: "insensitive" } },
                      { apellidos: { contains: query, mode: "insensitive" } }
                    ]
                  }
                }
              }
            }
          },
          {
            cohosts: {
              some: {
                cuentaGoogle: {
                  OR: [
                    { email: { contains: query, mode: "insensitive" } },
                    { user: { nombres: { contains: query, mode: "insensitive" } } },
                    { user: { apellidos: { contains: query, mode: "insensitive" } } }
                  ]
                }
              }
            }
          },
          { cohostEmails: { some: { email: { contains: query, mode: "insensitive" } } } }
        ]
      }
    : {};

  const baseInstanceWhere: Prisma.InstanciaSalaWhereInput = {
    estado: { not: "CANCELADA" },
    solicitud: requestScope,
    ...instanceSearch,
    ...proveedorWhere
  };
  const encounterWhere: Prisma.InstanciaSalaWhereInput = {
    ...baseInstanceWhere,
    ...temporalWhere
  };

  const seriesSearch: Prisma.SolicitudSalaWhereInput = query
    ? {
        OR: [
          { titulo: { contains: query, mode: "insensitive" } },
          { docentePrograma: { programa: { nombre: { contains: query, mode: "insensitive" } } } },
          {
            docentePrograma: {
              docente: {
                usuario: {
                  OR: [
                    { nombres: { contains: query, mode: "insensitive" } },
                    { apellidos: { contains: query, mode: "insensitive" } }
                  ]
                }
              }
            }
          },
          {
            instancias: {
              some: {
                estado: { not: "CANCELADA" },
                ...temporalWhere,
                OR: [
                  {
                    eventosProveedor: {
                      some: {
                        OR: [
                          { codigoReunion: { contains: meetingCodeQuery, mode: "insensitive" } },
                          { joinUrl: { contains: query, mode: "insensitive" } }
                        ]
                      }
                    }
                  },
                  {
                    cohosts: {
                      some: {
                        cuentaGoogle: {
                          OR: [
                            { email: { contains: query, mode: "insensitive" } },
                            { user: { nombres: { contains: query, mode: "insensitive" } } },
                            { user: { apellidos: { contains: query, mode: "insensitive" } } }
                          ]
                        }
                      }
                    }
                  },
                  { cohostEmails: { some: { email: { contains: query, mode: "insensitive" } } } }
                ]
              }
            }
          }
        ]
      }
    : {};

  const seriesWhere: Prisma.SolicitudSalaWhereInput = {
    ...requestScope,
    ...seriesSearch,
    instancias: {
      some: {
        estado: { not: "CANCELADA" },
        ...temporalWhere,
        ...proveedorWhere
      }
    }
  };

  const [totalMeetings, totalSeries] = await Promise.all([
    db.instanciaSala.count({ where: encounterWhere }),
    db.solicitudSala.count({ where: seriesWhere })
  ]);

  // El listado Zoom permite 10/20/50 sin alterar el tamaño histórico de Meet.
  const tamanoPagina = proveedor === "ZOOM" && [10, 20, 50].includes(Number(porPaginaParam))
    ? Number(porPaginaParam)
    : proveedor === "ZOOM" ? 10 : 50;
  const requestedPagination = resolverPaginacionAgenda(pageParam, tamanoPagina);
  const selectedTotal = vista === "series" ? totalSeries : totalMeetings;
  const pagination = calcularInfoPaginacion(
    selectedTotal,
    requestedPagination.page,
    requestedPagination.pageSize
  );
  const skip = (pagination.paginaActual - 1) * pagination.tamanoPagina;

  const meetingsPromise =
    vista === "encuentros"
      ? db.instanciaSala.findMany({
          where: encounterWhere,
          orderBy: { inicioProgramadoAt: isHistory ? "desc" : "asc" },
          take: pagination.tamanoPagina,
          skip,
          include: meetingInclude
        })
      : db.solicitudSala
          .findMany({
            where: seriesWhere,
            orderBy: { fechaInicioSolicitada: isHistory ? "desc" : "asc" },
            take: pagination.tamanoPagina,
            skip,
            select: { id: true }
          })
          .then(async (requests) => {
            const requestIds = requests.map(({ id }) => id);
            if (requestIds.length === 0) return [];
            return db.instanciaSala.findMany({
              where: {
                solicitudSalaId: { in: requestIds },
                estado: { not: "CANCELADA" },
                ...temporalWhere,
                ...proveedorWhere
              },
              orderBy: { inicioProgramadoAt: isHistory ? "desc" : "asc" },
              include: meetingInclude
            });
          });

  const todayStart = startOfMontevideoDay(now);
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    meetings,
    programs,
    todayCount,
    nextWeekCount,
    lastSevenDaysCount,
    lastThirtyDaysCount,
    pendingAssistanceCount
  ] = await Promise.all([
    meetingsPromise,
    actor.rol === "ADMINISTRACION"
      ? db.programa.findMany({
          where: { activo: true },
          orderBy: { nombre: "asc" },
          select: { id: true, nombre: true }
        })
      : Promise.resolve([]),
    db.instanciaSala.count({
      where: {
        AND: [
          baseInstanceWhere,
          dateRangeWhere,
          { inicioProgramadoAt: { gte: todayStart, lt: todayEnd } }
        ]
      }
    }),
    db.instanciaSala.count({
      where: {
        AND: [
          baseInstanceWhere,
          dateRangeWhere,
          { inicioProgramadoAt: { gte: now, lt: weekEnd } }
        ]
      }
    }),
    db.instanciaSala.count({
      where: {
        AND: [
          baseInstanceWhere,
          dateRangeWhere,
          { finProgramadoAt: { gte: sevenDaysAgo, lt: now } }
        ]
      }
    }),
    db.instanciaSala.count({
      where: {
        AND: [
          baseInstanceWhere,
          dateRangeWhere,
          { finProgramadoAt: { gte: thirtyDaysAgo, lt: now } }
        ]
      }
    }),
    db.instanciaSala.count({
      where: {
        AND: [
          encounterWhere,
          {
            requiereAsistenciaTecnica: true,
            asignaciones: { none: { estado: { in: [...ACTIVE_ASSIGNMENTS] } } }
          }
        ]
      }
    })
  ]);

  const meetingsForSeries = isHistory ? [...meetings].reverse() : meetings;
  const series = agruparEncuentrosPorSerie(meetingsForSeries, isHistory);
  const hasPendingMeet =
    !isHistory &&
    meetings.some(({ eventosProveedor }) =>
      eventosProveedor.some(
        ({ proveedor, estadoIntegracion }) =>
          proveedor.tipo === "GOOGLE_MEET" && estadoIntegracion === "PENDIENTE"
      )
    );

  return {
    vista,
    proveedor,
    q,
    query,
    programaId,
    periodo,
    isHistory,
    pagination,
    totalMeetings,
    totalSeries,
    selectedTotal,
    meetings,
    series,
    programs,
    todayCount,
    nextWeekCount,
    lastSevenDaysCount,
    lastThirtyDaysCount,
    pendingAssistanceCount,
    hasPendingMeet,
    desdeParam,
    hastaParam
  };
}
