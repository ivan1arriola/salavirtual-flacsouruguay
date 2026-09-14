import type { Prisma, PrismaClient } from "@prisma/client";
import type { SessionActor } from "@/src/lib/auth/session-actor.adapter";
import { ForbiddenApiError, ValidationApiError } from "@/src/lib/http/api-error";
import { puedeAdministrar } from "@/src/modules/usuarios/roles";
import { meetLinks, normalizeMeetLink } from "./meet-link.domain";
import { MEET_HISTORY_ACTIONS, readMeetEvidence, evidenceMatches, type MeetChange } from "./meet-history.domain";

const resultSelect = {
  id: true, codigoReunion: true, joinUrl: true, externalEventId: true,
  estadoIntegracion: true, sincronizadoAt: true, operacionPendiente: true,
  cuentaProveedor: { select: { nombre: true, emailOrganizador: true } },
  archivos: {
    where: { tipo: "GRABACION" as const },
    select: { id: true, nombre: true, driveFileId: true },
  },
  instancia: {
    select: {
      id: true, inicioProgramadoAt: true, finProgramadoAt: true, timezone: true, estado: true,
      cohosts: { select: { cuentaGoogle: { select: { email: true } } } },
      cohostEmails: { select: { email: true } },
      grabaciones: { select: { id: true, titulo: true, driveFileId: true, urlHistorica: true } },
      solicitud: { select: {
        id: true, titulo: true,
        docentePrograma: { select: { programa: { select: { nombre: true } } } },
        creadaPor: { select: { id: true, nombres: true, apellidos: true, emailPrincipal: true } },
      } },
    },
  },
} satisfies Prisma.EventoProveedorSelect;

export async function searchMeet(
  db: PrismaClient, actor: SessionActor | null, input: unknown,
) {
  if (!actor?.activo || !puedeAdministrar(actor.rol)) {
    throw new ForbiddenApiError("La búsqueda de Meet requiere acceso de Administración.");
  }
  const searched = normalizeMeetLink(input);
  if (!searched) throw new ValidationApiError("Ingresá un código o enlace válido de Google Meet.");

  // Read minimal identifiers, not full meetings or provider payloads. This also supports
  // legacy values with whitespace without rewriting them or duplicating the parser in SQL.
  const [events, audits] = await Promise.all([
    db.eventoProveedor.findMany({
      where: { proveedor: { tipo: "GOOGLE_MEET" } },
      select: { id: true, instanciaSalaId: true, codigoReunion: true, joinUrl: true },
    }),
    db.auditoria.findMany({
      where: { accion: { in: [...MEET_HISTORY_ACTIONS] } },
      select: {
        id: true, accion: true, entidadTipo: true, entidadId: true,
        valorAnterior: true, valorNuevo: true, createdAt: true,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
  ]);
  const history = new Map<string, MeetChange[]>();
  const seriesEvidence = new Map<string, MeetChange[]>();
  for (const audit of audits) {
    const evidence = readMeetEvidence(audit);
    if (!evidence) continue;
    for (const id of evidence.meetingIds) {
      history.set(id, [...(history.get(id) ?? []), evidence.change]);
    }
    if (evidence.seriesId && evidenceMatches(evidence.change, searched.code)) {
      seriesEvidence.set(evidence.seriesId, [...(seriesEvidence.get(evidence.seriesId) ?? []), evidence.change]);
    }
  }
  const matches = events.filter((event) =>
    meetLinks(event.codigoReunion, event.joinUrl).some((link) => link.code === searched.code) ||
    (history.get(event.instanciaSalaId) ?? []).some((change) => evidenceMatches(change, searched.code))
  );
  const [details, series] = await Promise.all([
    matches.length ? db.eventoProveedor.findMany({
      where: { id: { in: matches.map((event) => event.id) }, proveedor: { tipo: "GOOGLE_MEET" } },
      select: resultSelect,
      orderBy: [{ instancia: { inicioProgramadoAt: "desc" } }, { id: "asc" }],
    }) : [],
    seriesEvidence.size ? db.solicitudSala.findMany({
      where: { id: { in: [...seriesEvidence.keys()] } },
      select: { id: true, titulo: true },
    }) : [],
  ]);
  const results = details.map((event) => {
    const currentLinks = meetLinks(event.codigoReunion, event.joinUrl);
    return {
      event,
      currentLinks,
      current: currentLinks.some((link) => link.code === searched.code),
      inconsistent: currentLinks.length > 1,
      history: history.get(event.instancia.id) ?? [],
    };
  });
  return {
    searched, results,
    multiple: results.length > 1,
    series: series.map((item) => ({ ...item, history: seriesEvidence.get(item.id) ?? [] })),
  };
}
