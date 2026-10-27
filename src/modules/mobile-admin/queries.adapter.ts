import { Prisma, type EstadoInstancia, type PrismaClient } from "@prisma/client";
import type { AdminMeeting, AdminPage, AdminQuery, AdminSummary } from "./contracts";
import { obtenerDashboardAdministracion } from "../dashboard/admin-dashboard.adapter";
import { esProveedorOperativo } from "@/src/modules/conferencias/proveedores";

const ACTIVE_ASSIGNMENTS = ["ASIGNADO", "ACEPTADO"] as const;
const INSTANCE_STATES = ["PROGRAMADA", "EN_CURSO", "FINALIZADA", "CANCELADA", "NO_REALIZADA"] as const;

const meetingInclude = Prisma.validator<Prisma.InstanciaSalaInclude>()({
  solicitud: {
    select: {
      id: true,
      titulo: true,
      descripcion: true,
      modalidad: true,
      docentePrograma: {
        select: {
          programa: { select: { id: true, nombre: true } },
          docente: {
            select: {
              usuario: { select: { nombres: true, apellidos: true } }
            }
          }
        }
      }
    }
  },
  eventosProveedor: {
    select: {
      joinUrl: true,
      proveedor: { select: { tipo: true } },
      cuentaProveedor: { select: { emailOrganizador: true, nombre: true } }
    }
  },
  asignaciones: {
    where: { estado: { in: [...ACTIVE_ASSIGNMENTS] } },
    select: {
      id: true,
      asistenteTecnicoId: true,
      estado: true,
      asistenteTecnico: {
        select: {
          usuario: { select: { nombres: true, apellidos: true } }
        }
      }
    },
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    take: 1
  }
});

type MeetingRow = Prisma.InstanciaSalaGetPayload<{ include: typeof meetingInclude }>;
type Cursor = Readonly<{ startsAt: Date; id: string }>;

export function validateAdminQuery(query: AdminQuery): AdminQuery {
  const from = parseIso(query.from, "from");
  const to = parseIso(query.to, "to");
  if (from.getTime() >= to.getTime()) throw new Error("from debe ser anterior a to.");
  if (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > 100) {
    throw new Error("limit debe estar entre 1 y 100.");
  }
  if (query.coverage !== undefined && query.coverage !== "assigned" && query.coverage !== "unassigned") {
    throw new Error("coverage inválido.");
  }
  if (query.state !== undefined && !INSTANCE_STATES.includes(query.state as typeof INSTANCE_STATES[number])) {
    throw new Error("state inválido.");
  }
  if (query.cursor !== undefined) decodeCursor(query.cursor);
  return query;
}

export async function listAdminMeetings(db: PrismaClient, query: AdminQuery): Promise<AdminPage> {
  validateAdminQuery(query);
  const from = parseIso(query.from, "from");
  const to = parseIso(query.to, "to");
  const cursor = query.cursor ? decodeCursor(query.cursor) : null;
  const rows = await db.instanciaSala.findMany({
    where: buildWhere(query, from, to, cursor),
    orderBy: [{ inicioProgramadoAt: "asc" }, { id: "asc" }],
    take: query.limit + 1,
    include: meetingInclude
  });
  const hasNext = rows.length > query.limit;
  const items = rows.slice(0, query.limit);
  const last = hasNext ? items.at(-1) : null;

  return {
    generatedAt: new Date().toISOString(),
    items: items.map(toAdminMeeting),
    nextCursor: last ? encodeCursor(last.inicioProgramadoAt, last.id) : null
  };
}

export async function getAdminMeeting(db: PrismaClient, id: string): Promise<AdminMeeting | null> {
  const row = await db.instanciaSala.findUnique({
    where: { id },
    include: meetingInclude
  });
  return row ? toAdminMeeting(row) : null;
}

export async function getAdminSummary(db: PrismaClient): Promise<AdminSummary> {
  const now = new Date();
  const [upcoming, dashboard] = await Promise.all([
    db.instanciaSala.findMany({
      where: { inicioProgramadoAt: { gte: now }, estado: "PROGRAMADA" },
      orderBy: [{ inicioProgramadoAt: "asc" }, { id: "asc" }],
      take: 5,
      include: meetingInclude
    }),
    obtenerDashboardAdministracion(db, now)
  ]);

  return {
    generatedAt: now.toISOString(),
    upcoming: upcoming.map(toAdminMeeting),
    attention: [
      { code: "PENDING_COVERAGE", label: "Cobertura pendiente", count: dashboard.metrics.pendingAssistance },
      { code: "INTEGRATION_ERRORS", label: "Errores de integración", count: dashboard.metrics.integrationErrors },
      { code: "PENDING_RECORDINGS", label: "Grabaciones pendientes", count: dashboard.metrics.pendingRecordings },
      { code: "OPEN_INCIDENTS", label: "Incidencias abiertas", count: dashboard.metrics.openIncidents },
      { code: "DUPLICATE_RISKS", label: "Posibles duplicados", count: dashboard.metrics.duplicateRisks }
    ].filter(({ count }) => count > 0)
  };
}

function buildWhere(query: AdminQuery, from: Date, to: Date, cursor: Cursor | null): Prisma.InstanciaSalaWhereInput {
  const and: Prisma.InstanciaSalaWhereInput[] = [];
  if (query.q?.trim()) {
    and.push({
      solicitud: {
        OR: [
          { titulo: { contains: query.q.trim(), mode: "insensitive" } },
          {
            docentePrograma: {
              docente: {
                usuario: {
                  OR: [
                    { nombres: { contains: query.q.trim(), mode: "insensitive" } },
                    { apellidos: { contains: query.q.trim(), mode: "insensitive" } }
                  ]
                }
              }
            }
          }
        ]
      }
    });
  }
  if (query.programId) and.push({ solicitud: { docentePrograma: { programaId: query.programId } } });
  if (cursor) {
    and.push({
      OR: [
        { inicioProgramadoAt: { gt: cursor.startsAt } },
        { inicioProgramadoAt: cursor.startsAt, id: { gt: cursor.id } }
      ]
    });
  }

  return {
    inicioProgramadoAt: { lt: to },
    finProgramadoAt: { gte: from },
    ...(query.state ? { estado: query.state as EstadoInstancia } : {}),
    ...(query.coverage === "assigned"
      ? { asignaciones: { some: { estado: { in: [...ACTIVE_ASSIGNMENTS] } } } }
      : query.coverage === "unassigned"
        ? {
            requiereAsistenciaTecnica: true,
            asignaciones: { none: { estado: { in: [...ACTIVE_ASSIGNMENTS] } } }
          }
        : {}),
    ...(and.length ? { AND: and } : {})
  };
}

function toAdminMeeting(meeting: MeetingRow): AdminMeeting {
  const association = meeting.solicitud.docentePrograma;
  const teacher = association.docente.usuario;
  const providerEvent = meeting.eventosProveedor.find(({ proveedor }) => esProveedorOperativo(proveedor.tipo));
  const assignment = meeting.asignaciones[0] ?? null;
  const assistant = assignment?.asistenteTecnico.usuario;

  return {
    id: meeting.id,
    requestId: meeting.solicitud.id,
    title: meeting.solicitud.titulo,
    programId: association.programa.id,
    program: association.programa.nombre,
    teacher: [teacher.nombres, teacher.apellidos].filter(Boolean).join(" "),
    modality: meeting.modalidadOverride ?? meeting.solicitud.modalidad,
    modalityCustomized: meeting.modalidadOverride !== null,
    startsAt: meeting.inicioProgramadoAt.toISOString(),
    endsAt: meeting.finProgramadoAt.toISOString(),
    assistanceStartsAt: meeting.inicioAsistenciaTecnicaAt?.toISOString() ?? null,
    assistanceEndsAt: meeting.finAsistenciaTecnicaAt?.toISOString() ?? null,
    timezone: meeting.timezone,
    state: meeting.estado,
    requiresAssistance: meeting.requiereAsistenciaTecnica,
    googleAccount: providerEvent?.cuentaProveedor?.emailOrganizador ?? providerEvent?.cuentaProveedor?.nombre ?? null,
    meetUrl: providerEvent?.joinUrl ?? null,
    description: meeting.descripcion ?? meeting.solicitud.descripcion ?? null,
    assignment: assignment && assistant
      ? {
          id: assignment.id,
          assistantId: assignment.asistenteTecnicoId,
          name: [assistant.nombres, assistant.apellidos].filter(Boolean).join(" "),
          state: assignment.estado
        }
      : null
  };
}

function parseIso(value: unknown, field: string): Date {
  if (typeof value !== "string") throw new Error(`${field} debe ser ISO 8601.`);
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if (!match) throw new Error(`${field} debe ser ISO 8601.`);

  const [, yearText, monthText, dayText, hourText, minuteText, secondText, offsetSign, offsetHourText, offsetMinuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const offsetHour = offsetHourText === undefined ? 0 : Number(offsetHourText);
  const offsetMinute = offsetMinuteText === undefined ? 0 : Number(offsetMinuteText);

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth(year, month) ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    offsetHour > 23 ||
    offsetMinute > 59 ||
    (offsetSign === undefined && (offsetHourText !== undefined || offsetMinuteText !== undefined))
  ) {
    throw new Error(`${field} debe ser ISO 8601.`);
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${field} debe ser ISO 8601.`);
  return date;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function encodeCursor(startsAt: Date, id: string): string {
  return Buffer.from(JSON.stringify({ startsAt: startsAt.toISOString(), id })).toString("base64url");
}

function decodeCursor(value: string): Cursor {
  try {
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as { startsAt?: unknown; id?: unknown };
    if (typeof decoded.id !== "string" || !decoded.id) throw new Error("cursor inválido.");
    return { startsAt: parseIso(decoded.startsAt, "cursor"), id: decoded.id };
  } catch {
    throw new Error("cursor inválido.");
  }
}
