import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { SessionActor } from "@/src/lib/auth/session-actor.adapter";
import {
  ConflictApiError,
  ForbiddenApiError,
  IntegrationApiError,
  NotFoundApiError,
  ValidationApiError,
} from "@/src/lib/http/api-error";
import { normalizeCohostEmails } from "../meet/cohosts.domain";
import type { GoogleCalendarCredentials } from "../meet/google-calendar.adapter";
import { puedeGestionarPrograma } from "./permisos-programa.service";

const emailListSchema = z.preprocess(
  (value) => typeof value === "string"
    ? value.split(/[\n,;]+/).map((item) => item.trim().toLowerCase()).filter(Boolean)
    : value,
  z.array(z.email().transform((email) => email.toLowerCase())).max(50).default([]),
);

const actualizarCohostsSchema = z.object({
  cohostCuentaIds: z.array(z.string().trim().min(1)).max(50).default([]),
  cohostEmailsManual: emailListSchema,
});

export type GestionCohostsSerieDependencies = Readonly<{
  db: PrismaClient;
  descifrar: (value: string) => string;
  sincronizarGoogle: (
    credentials: GoogleCalendarCredentials,
    input: Readonly<{
      calendarId: string;
      externalEventId: string;
      codigoReunion?: string | null;
      cohostsAnteriores: readonly string[];
      cohostsDeseados: readonly string[];
    }>,
  ) => Promise<Readonly<Record<string, unknown>>>;
}>;

export async function actualizarCohostsSerie(
  dependencies: GestionCohostsSerieDependencies,
  actor: SessionActor,
  solicitudId: string,
  rawInput: unknown,
): Promise<Readonly<{ cohosts: readonly string[]; encuentros: number }>> {
  const input = actualizarCohostsSchema.parse(rawInput);
  const request = await dependencies.db.solicitudSala.findUnique({
    where: { id: solicitudId },
    select: {
      id: true,
      titulo: true,
      createdAt: true,
      docenteProgramaId: true,
      docentePrograma: {
        select: {
          programaId: true,
          docente: { select: { usuarioId: true } },
        },
      },
    },
  });
  if (!request) throw new NotFoundApiError("La reunión no existe.");
  if (!await puedeGestionarPrograma(dependencies.db, actor, request.docentePrograma.programaId)) {
    throw new ForbiddenApiError("No tiene permisos para gestionar los cohosts de esta serie.");
  }

  const now = new Date();
  const seriesRequests = await dependencies.db.solicitudSala.findMany({
    where: {
      docenteProgramaId: request.docenteProgramaId,
      titulo: request.titulo,
      createdAt: request.createdAt,
    },
    select: {
      instancias: {
        where: {
          estado: "PROGRAMADA",
          finProgramadoAt: { gt: now },
        },
        select: {
          id: true,
          inicioProgramadoAt: true,
          cohosts: { include: { cuentaGoogle: { select: { email: true } } } },
          cohostEmails: { select: { email: true } },
          asignaciones: {
            where: { estado: { in: ["ASIGNADO", "ACEPTADO"] } },
            select: { asistenteTecnico: { select: { usuarioId: true } } },
          },
          eventosProveedor: {
            where: { proveedor: { tipo: "GOOGLE_MEET" } },
            select: {
              id: true,
              externalEventId: true,
              codigoReunion: true,
              cuentaProveedor: { select: { emailOrganizador: true } },
            },
            take: 1,
          },
        },
      },
    },
  });
  const meetings = seriesRequests
    .flatMap(({ instancias }) => instancias)
    .sort((left, right) => left.inicioProgramadoAt.getTime() - right.inicioProgramadoAt.getTime());
  if (meetings.length === 0) {
    throw new ConflictApiError("La serie no tiene encuentros activos o futuros para actualizar.");
  }

  const selectedIds = [...new Set(input.cohostCuentaIds)];
  const automaticUserIds = [...new Set([
    request.docentePrograma.docente.usuarioId,
    ...meetings.flatMap(({ asignaciones }) =>
      asignaciones.map(({ asistenteTecnico }) => asistenteTecnico.usuarioId)
    ),
  ])];
  const [selectedAccounts, automaticAccounts, automaticUsers] = await Promise.all([
    dependencies.db.cuentaGoogleFlacso.findMany({
      where: { id: { in: selectedIds }, user: { activo: true } },
      select: { id: true, email: true },
    }),
    dependencies.db.cuentaGoogleFlacso.findMany({
      where: { userId: { in: automaticUserIds }, user: { activo: true } },
      select: { id: true, email: true, userId: true },
    }),
    dependencies.db.usuario.findMany({
      where: { id: { in: automaticUserIds }, activo: true },
      select: { id: true, emailPrincipal: true },
    }),
  ]);
  if (selectedAccounts.length !== selectedIds.length) {
    throw new ValidationApiError("Una o más cuentas cohost no existen o están inactivas.");
  }

  const linkedAccounts = [...new Map(
    [...selectedAccounts, ...automaticAccounts].map((account) => [account.id, account]),
  ).values()];
  const linkedEmails = new Set(linkedAccounts.map(({ email }) => email.trim().toLowerCase()));
  const linkedUserIds = new Set(automaticAccounts.map(({ userId }) => userId));
  const manualEmails = normalizeCohostEmails([
    ...input.cohostEmailsManual,
    ...automaticUsers.flatMap((user) => !linkedUserIds.has(user.id) && user.emailPrincipal ? [user.emailPrincipal] : []),
  ])
    .filter((email) => !linkedEmails.has(email));
  const desiredEmails = normalizeCohostEmails([
    ...linkedAccounts.map(({ email }) => email),
    ...manualEmails,
  ]);
  if (desiredEmails.length > 50) {
    throw new ValidationApiError("La serie no puede tener más de 50 cohosts.");
  }

  const eventsToSync = meetings.flatMap((meeting) => {
    const event = meeting.eventosProveedor[0];
    return event?.externalEventId && event.cuentaProveedor?.emailOrganizador
      ? [{ meeting, event, hostEmail: event.cuentaProveedor.emailOrganizador }]
      : [];
  });
  const payloads = new Map<string, Prisma.InputJsonValue>();
  if (eventsToSync.length > 0) {
    const config = await dependencies.db.configuracionGoogleWorkspace.findUnique({
      where: { id: "principal", activa: true },
    });
    if (!config?.serviceAccountEmail || !config.privateKeyCifrada) {
      throw new IntegrationApiError("Google Workspace no está configurado.", 503);
    }
    let privateKey: string;
    try {
      privateKey = dependencies.descifrar(config.privateKeyCifrada);
    } catch {
      throw new IntegrationApiError("No se pudo leer la configuración de Google Workspace.", 503);
    }

    for (const { meeting, event, hostEmail } of eventsToSync) {
      const previousEmails = normalizeCohostEmails([
        ...meeting.cohosts.map(({ cuentaGoogle }) => cuentaGoogle.email),
        ...meeting.cohostEmails.map(({ email }) => email),
      ]);
      const payload = await dependencies.sincronizarGoogle(
        {
          serviceAccountEmail: config.serviceAccountEmail,
          privateKey,
          subject: hostEmail,
        },
        {
          calendarId: hostEmail,
          externalEventId: event.externalEventId!,
          codigoReunion: event.codigoReunion,
          cohostsAnteriores: previousEmails,
          cohostsDeseados: desiredEmails,
        },
      );
      payloads.set(event.id, JSON.parse(JSON.stringify(payload)) as Prisma.InputJsonValue);
    }
  }

  const previousSnapshot = meetings.map((meeting) => ({
    instanciaId: meeting.id,
    cohosts: normalizeCohostEmails([
      ...meeting.cohosts.map(({ cuentaGoogle }) => cuentaGoogle.email),
      ...meeting.cohostEmails.map(({ email }) => email),
    ]),
  }));

  await dependencies.db.$transaction(async (tx) => {
    for (const meeting of meetings) {
      await Promise.all([
        tx.cohostReunion.deleteMany({ where: { instanciaSalaId: meeting.id } }),
        tx.cohostEmailReunion.deleteMany({ where: { instanciaSalaId: meeting.id } }),
      ]);
      if (linkedAccounts.length > 0) {
        await tx.cohostReunion.createMany({
          data: linkedAccounts.map(({ id }) => ({ instanciaSalaId: meeting.id, cuentaGoogleId: id })),
        });
      }
      if (manualEmails.length > 0) {
        await tx.cohostEmailReunion.createMany({
          data: manualEmails.map((email) => ({ instanciaSalaId: meeting.id, email })),
        });
      }
      const event = meeting.eventosProveedor[0];
      const payload = event ? payloads.get(event.id) : undefined;
      if (event && payload) {
        await tx.eventoProveedor.update({
          where: { id: event.id },
          data: { payloadUltimo: payload, sincronizadoAt: new Date() },
        });
      }
    }
    await tx.auditoria.create({
      data: {
        actorUsuarioId: actor.id,
        accion: "COHOSTS_SERIE_ACTUALIZADOS",
        entidadTipo: "SolicitudSala",
        entidadId: request.id,
        valorAnterior: previousSnapshot,
        valorNuevo: {
          cohosts: desiredEmails,
          encuentros: meetings.length,
        },
      },
    });
  }, { timeout: 30_000 });

  return { cohosts: desiredEmails, encuentros: meetings.length };
}
