import type { PrismaClient } from "@prisma/client";
import type { GoogleCalendarCredentials } from "../meet/google-calendar.adapter";
import {
  planificarSincronizacionCalendarioAsistente,
  type CuentaCalendarioAsistente,
} from "./calendario-asistente.domain";
import type { EventoCalendarioAsistente } from "./calendario-asistente-google.adapter";

export type ResultadoSincronizacionCalendarioAsistente = Readonly<{
  cuentaGoogleId: string;
  email: string;
  accion: "PUBLICAR" | "ELIMINAR";
  estado: "SINCRONIZADA" | "ERROR";
  error?: string;
}>;

export type SincronizacionCalendarioAsistenteDependencies = Readonly<{
  db: PrismaClient;
  descifrar: (value: string) => string;
  publicarEvento: (
    credentials: GoogleCalendarCredentials,
    event: EventoCalendarioAsistente,
  ) => Promise<void>;
  eliminarEvento: (
    credentials: GoogleCalendarCredentials,
    eventId: string,
  ) => Promise<void>;
}>;

export async function sincronizarCalendarioAsistenteInstancia(
  dependencies: SincronizacionCalendarioAsistenteDependencies,
  instanciaSalaId: string,
): Promise<readonly ResultadoSincronizacionCalendarioAsistente[]> {
  const meeting = await dependencies.db.instanciaSala.findUnique({
    where: { id: instanciaSalaId },
    select: {
      id: true,
      estado: true,
      requiereAsistenciaTecnica: true,
      inicioProgramadoAt: true,
      finProgramadoAt: true,
      timezone: true,
      descripcion: true,
      solicitud: {
        select: {
          titulo: true,
          descripcion: true,
          docentePrograma: {
            select: {
              programa: { select: { nombre: true } },
              docente: {
                select: {
                  usuario: { select: { nombres: true, apellidos: true } },
                },
              },
            },
          },
        },
      },
      eventosProveedor: {
        where: { proveedor: { tipo: "GOOGLE_MEET" } },
        select: { joinUrl: true },
        take: 1,
      },
      asignaciones: {
        select: {
          id: true,
          estado: true,
          asistenteTecnico: {
            select: {
              usuario: {
                select: {
                  rol: true,
                  activo: true,
                  fusionadoEnId: true,
                  cuentasGoogle: {
                    select: {
                      id: true,
                      email: true,
                      dominio: true,
                      providerAccountId: true,
                      emailVerificadoAt: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!meeting) return [];

  const plan = planificarSincronizacionCalendarioAsistente({
    instanciaId: meeting.id,
    estado: meeting.estado,
    requiereAsistenciaTecnica: meeting.requiereAsistenciaTecnica,
    asignaciones: meeting.asignaciones,
  });
  if (plan.publicar.length === 0 && plan.eliminar.length === 0) return [];

  const config = await dependencies.db.configuracionGoogleWorkspace.findUnique({
    where: { id: "principal" },
    select: {
      activa: true,
      serviceAccountEmail: true,
      privateKeyCifrada: true,
    },
  });
  if (!config?.activa || !config.serviceAccountEmail || !config.privateKeyCifrada) {
    return [...plan.publicar.map(({ cuenta }) => errorConfiguracion(cuenta, "PUBLICAR")),
      ...plan.eliminar.map(({ cuenta }) => errorConfiguracion(cuenta, "ELIMINAR"))];
  }

  let privateKey: string;
  try {
    privateKey = dependencies.descifrar(config.privateKeyCifrada);
  } catch {
    return [...plan.publicar.map(({ cuenta }) => errorConfiguracion(cuenta, "PUBLICAR")),
      ...plan.eliminar.map(({ cuenta }) => errorConfiguracion(cuenta, "ELIMINAR"))];
  }

  const docente = [
    meeting.solicitud.docentePrograma.docente.usuario.nombres,
    meeting.solicitud.docentePrograma.docente.usuario.apellidos,
  ].filter(Boolean).join(" ") || null;
  const joinUrl = meeting.eventosProveedor[0]?.joinUrl ?? null;

  const resultados = await Promise.all([
    ...plan.publicar.map(async ({ cuenta, eventId }) => ejecutar(
      cuenta,
      "PUBLICAR",
      async () => dependencies.publicarEvento(
        credenciales(config.serviceAccountEmail!, privateKey, cuenta.email),
        {
          id: eventId,
          titulo: `Asistencia técnica · ${meeting.solicitud.titulo}`,
          descripcion: meeting.descripcion ?? meeting.solicitud.descripcion,
          inicio: meeting.inicioProgramadoAt,
          fin: meeting.finProgramadoAt,
          timezone: meeting.timezone,
          instanciaSalaId: meeting.id,
          programa: meeting.solicitud.docentePrograma.programa.nombre,
          docente,
          joinUrl,
        },
      ),
    )),
    ...plan.eliminar.map(async ({ cuenta, eventId }) => ejecutar(
      cuenta,
      "ELIMINAR",
      async () => dependencies.eliminarEvento(
        credenciales(config.serviceAccountEmail!, privateKey, cuenta.email),
        eventId,
      ),
    )),
  ]);

  return resultados;
}

export async function sincronizarCalendariosAsistenteSolicitud(
  dependencies: SincronizacionCalendarioAsistenteDependencies,
  solicitudSalaId: string,
): Promise<readonly ResultadoSincronizacionCalendarioAsistente[]> {
  const instances = await dependencies.db.instanciaSala.findMany({
    where: { solicitudSalaId },
    select: { id: true },
  });
  const results = await Promise.all(
    instances.map(({ id }) => sincronizarCalendarioAsistenteInstancia(dependencies, id)),
  );
  return results.flat();
}

export async function sincronizarCalendariosAsistenteUsuario(
  dependencies: SincronizacionCalendarioAsistenteDependencies,
  usuarioId: string,
): Promise<readonly ResultadoSincronizacionCalendarioAsistente[]> {
  const assistant = await dependencies.db.asistenteTecnico.findUnique({
    where: { usuarioId },
    select: {
      asignaciones: {
        where: { estado: { in: ["ASIGNADO", "ACEPTADO"] } },
        select: { instanciaSalaId: true },
      },
    },
  });
  if (!assistant) return [];

  const uniqueIds = [...new Set(assistant.asignaciones.map(({ instanciaSalaId }) => instanciaSalaId))];
  const results = await Promise.all(
    uniqueIds.map((id) => sincronizarCalendarioAsistenteInstancia(dependencies, id)),
  );
  return results.flat();
}

export function hayErroresSincronizacionCalendarioAsistente(
  results: readonly ResultadoSincronizacionCalendarioAsistente[],
): boolean {
  return results.some(({ estado }) => estado === "ERROR");
}

async function ejecutar(
  cuenta: CuentaCalendarioAsistente,
  accion: "PUBLICAR" | "ELIMINAR",
  operation: () => Promise<void>,
): Promise<ResultadoSincronizacionCalendarioAsistente> {
  try {
    await operation();
    return {
      cuentaGoogleId: cuenta.id,
      email: cuenta.email,
      accion,
      estado: "SINCRONIZADA",
    };
  } catch (error) {
    return {
      cuentaGoogleId: cuenta.id,
      email: cuenta.email,
      accion,
      estado: "ERROR",
      error: error instanceof Error ? error.message : "Google Calendar rechazó la sincronización.",
    };
  }
}

function errorConfiguracion(
  cuenta: CuentaCalendarioAsistente,
  accion: "PUBLICAR" | "ELIMINAR",
): ResultadoSincronizacionCalendarioAsistente {
  return {
    cuentaGoogleId: cuenta.id,
    email: cuenta.email,
    accion,
    estado: "ERROR",
    error: "Google Workspace no está configurado para sincronizar calendarios de asistentes.",
  };
}

function credenciales(
  serviceAccountEmail: string,
  privateKey: string,
  subject: string,
): GoogleCalendarCredentials {
  return { serviceAccountEmail, privateKey, subject };
}
