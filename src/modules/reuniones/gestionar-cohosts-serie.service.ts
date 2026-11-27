import type { Prisma } from "@prisma/client";
import { type PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { SessionActor } from "@/src/lib/auth/session-actor.adapter";
import {
  ConflictApiError,
  ForbiddenApiError,
  IntegrationApiError,
  NotFoundApiError,
  ValidationApiError,
} from "@/src/lib/http/api-error";
import {
  extraerCohostEmailsDeInstancia,
  invalidarVerificacionCohosts,
  normalizeCohostEmails,
  type GoogleCalendarCredentials,
} from "@/src/modules/conferencias/api";
import { obtenerCredencialPrincipalGoogleWorkspace } from "@/src/modules/configuracion/api";
import { puedeGestionarPrograma } from "./permisos-programa.service";
import { construirFiltroSerieSolicitud } from "./serie-reunion.domain";

const emailListSchema = z.preprocess(
  (value) =>
    typeof value === "string"
      ? value
          .split(/[\n,;]+/)
          .map((item) => item.trim().toLowerCase())
          .filter(Boolean)
      : value,
  z
    .array(z.email().transform((email) => email.toLowerCase()))
    .max(50)
    .default([]),
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
      serieReunionId: true,
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
  if (!request) {
    throw new NotFoundApiError("La reunión no existe.");
  }
  if (!(await puedeGestionarPrograma(dependencies.db, actor, request.docentePrograma.programaId))) {
    throw new ForbiddenApiError("No tiene permisos para gestionar los cohosts de esta serie.");
  }

  const now = new Date();
  const seriesRequests = await dependencies.db.solicitudSala.findMany({
    where: construirFiltroSerieSolicitud(request),
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
              payloadUltimo: true,
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
  const docenteId = request.docentePrograma.docente.usuarioId;
  const allAssistantUserIds = [
    ...new Set(
      meetings.flatMap(({ asignaciones }) =>
        asignaciones.map(({ asistenteTecnico }) => asistenteTecnico.usuarioId),
      ),
    ),
  ];

  const [selectedAccounts, docenteAccounts, docenteUser, assistantAccounts, assistantUsers] =
    await Promise.all([
      dependencies.db.cuentaGoogleFlacso.findMany({
        where: { id: { in: selectedIds }, user: { activo: true } },
        select: { id: true, email: true },
      }),
      dependencies.db.cuentaGoogleFlacso.findMany({
        where: { userId: docenteId, user: { activo: true } },
        select: { id: true, email: true, userId: true },
      }),
      dependencies.db.usuario.findUnique({
        where: { id: docenteId, activo: true },
        select: { id: true, emailPrincipal: true },
      }),
      dependencies.db.cuentaGoogleFlacso.findMany({
        where: { userId: { in: allAssistantUserIds }, user: { activo: true } },
        select: { id: true, email: true, userId: true },
      }),
      dependencies.db.usuario.findMany({
        where: { id: { in: allAssistantUserIds }, activo: true },
        select: { id: true, emailPrincipal: true },
      }),
    ]);
  if (selectedAccounts.length !== selectedIds.length) {
    throw new ValidationApiError("Una o más cuentas cohost no existen o están inactivas.");
  }

  const seriesLinkedAccounts = [
    ...new Map(
      [...selectedAccounts, ...docenteAccounts].map((account) => [account.id, account]),
    ).values(),
  ];
  const seriesLinkedEmails = new Set(
    seriesLinkedAccounts.map(({ email }) => email.trim().toLowerCase()),
  );
  const docenteHasLinked = docenteAccounts.length > 0;
  const seriesManualEmails = normalizeCohostEmails([
    ...input.cohostEmailsManual,
    ...(!docenteHasLinked && docenteUser?.emailPrincipal ? [docenteUser.emailPrincipal] : []),
  ]).filter((email) => !seriesLinkedEmails.has(email));

  // Resolver cohosts específicos por encuentro (aislando los asistentes de cada fecha y filtrando el host)
  function cohostsParaEncuentro(meeting: (typeof meetings)[number]) {
    const assistantUserIdsForMeeting = new Set(
      meeting.asignaciones.map(({ asistenteTecnico }) => asistenteTecnico.usuarioId),
    );
    const meetingAssistantAccounts = assistantAccounts.filter(({ userId }) =>
      assistantUserIdsForMeeting.has(userId),
    );
    const meetingAssistantLinkedIds = new Set(meetingAssistantAccounts.map(({ userId }) => userId));
    const meetingAssistantFallbackEmails = assistantUsers
      .filter(
        (u) =>
          assistantUserIdsForMeeting.has(u.id) &&
          !meetingAssistantLinkedIds.has(u.id) &&
          u.emailPrincipal,
      )
      .map((u) => u.emailPrincipal!);

    const hostEmail =
      meeting.eventosProveedor[0]?.cuentaProveedor?.emailOrganizador?.trim().toLowerCase() ?? "";

    const meetingLinkedAccounts = [
      ...new Map(
        [...seriesLinkedAccounts, ...meetingAssistantAccounts].map((acc) => [acc.id, acc]),
      ).values(),
    ].filter(({ email }) => email.trim().toLowerCase() !== hostEmail);

    const meetingLinkedEmails = new Set(
      meetingLinkedAccounts.map(({ email }) => email.trim().toLowerCase()),
    );

    const meetingManualEmails = normalizeCohostEmails([
      ...seriesManualEmails,
      ...meetingAssistantFallbackEmails,
    ]).filter((email) => email !== hostEmail && !meetingLinkedEmails.has(email));

    const desiredEmails = normalizeCohostEmails([
      ...meetingLinkedAccounts.map(({ email }) => email),
      ...meetingManualEmails,
    ]);

    return {
      meetingLinkedAccounts,
      meetingManualEmails,
      desiredEmails,
      hostEmail,
    };
  }

  const meetingCohostsMap = new Map(meetings.map((m) => [m.id, cohostsParaEncuentro(m)]));
  for (const { desiredEmails } of meetingCohostsMap.values()) {
    if (desiredEmails.length > 50) {
      throw new ValidationApiError("Uno o más encuentros superan el límite de 50 cohosts.");
    }
  }

  const eventsToSync = meetings.flatMap((meeting) => {
    const event = meeting.eventosProveedor[0];
    const meetingCohosts = meetingCohostsMap.get(meeting.id)!;
    return event?.externalEventId && meetingCohosts.hostEmail
      ? [
          {
            meeting,
            event,
            hostEmail: meetingCohosts.hostEmail,
            desiredEmails: meetingCohosts.desiredEmails,
          },
        ]
      : [];
  });
  const payloads = new Map<string, Prisma.InputJsonValue>();
  if (eventsToSync.length > 0) {
    const cred = await obtenerCredencialPrincipalGoogleWorkspace(
      dependencies.db,
      dependencies.descifrar,
      {
        requireActiva: true,
      },
    );
    if (!cred) {
      throw new IntegrationApiError("Google Workspace no está configurado.", 503);
    }
    const privateKey = cred.privateKey;

    for (const { meeting, event, hostEmail, desiredEmails } of eventsToSync) {
      const previousEmails = extraerCohostEmailsDeInstancia(meeting);
      // A partial failure must not leave old permissions displayed as verified.
      await dependencies.db.eventoProveedor.update({
        where: { id: event.id },
        data: {
          payloadUltimo: JSON.parse(
            JSON.stringify(invalidarVerificacionCohosts(event.payloadUltimo)),
          ),
        },
      });
      const payload = await dependencies.sincronizarGoogle(
        {
          serviceAccountEmail: cred.serviceAccountEmail,
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
    cohosts: extraerCohostEmailsDeInstancia(meeting),
  }));

  await dependencies.db.$transaction(
    async (tx) => {
      for (const meeting of meetings) {
        const meetingCohosts = meetingCohostsMap.get(meeting.id)!;
        await Promise.all([
          tx.cohostReunion.deleteMany({ where: { instanciaSalaId: meeting.id } }),
          tx.cohostEmailReunion.deleteMany({ where: { instanciaSalaId: meeting.id } }),
        ]);
        if (meetingCohosts.meetingLinkedAccounts.length > 0) {
          await tx.cohostReunion.createMany({
            data: meetingCohosts.meetingLinkedAccounts.map(({ id }) => ({
              instanciaSalaId: meeting.id,
              cuentaGoogleId: id,
            })),
          });
        }
        if (meetingCohosts.meetingManualEmails.length > 0) {
          await tx.cohostEmailReunion.createMany({
            data: meetingCohosts.meetingManualEmails.map((email) => ({
              instanciaSalaId: meeting.id,
              email,
            })),
          });
        }
        const event = meeting.eventosProveedor[0];
        const payload = event ? payloads.get(event.id) : undefined;
        if (event && payload) {
          await tx.eventoProveedor.update({
            where: { id: event.id },
            data: {
              payloadUltimo: payload,
              sincronizadoAt: new Date(),
              errorIntegracion: null,
              operacionPendiente: null,
            },
          });
        } else if (event) {
          await tx.eventoProveedor.update({
            where: { id: event.id },
            data: {
              operacionPendiente: "CONFIGURAR_MEET",
              payloadUltimo: JSON.parse(
                JSON.stringify(invalidarVerificacionCohosts(event.payloadUltimo)),
              ),
            },
          });
        }
      }
      const allDesiredEmails = [
        ...new Set([...meetingCohostsMap.values()].flatMap((c) => c.desiredEmails)),
      ];
      await tx.auditoria.create({
        data: {
          actorUsuarioId: actor.id,
          accion: "COHOSTS_SERIE_ACTUALIZADOS",
          entidadTipo: "SolicitudSala",
          entidadId: request.id,
          valorAnterior: previousSnapshot,
          valorNuevo: {
            cohosts: allDesiredEmails,
            encuentros: meetings.length,
          },
        },
      });
    },
    { timeout: 30_000 },
  );

  const allFinalCohosts = [
    ...new Set([...meetingCohostsMap.values()].flatMap((c) => c.desiredEmails)),
  ];
  return { cohosts: allFinalCohosts, encuentros: meetings.length };
}
