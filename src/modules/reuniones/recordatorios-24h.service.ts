import type { PrismaClient } from "@prisma/client";
import { formatLongDate, formatTime } from "@/src/lib/ui/format";
import { construirRecordatorioReunion, type AccesoRecordatorio } from "./recordatorio-reunion-email.domain";
import { construirCorreoParticipacion } from "./avisos-participacion.domain";
import { FILTRO_PROVEEDOR_OPERATIVO } from "@/src/modules/conferencias/proveedores";

const HORA = 60 * 60 * 1000;
const APP_URL = "https://salavirtual.flacso.edu.uy";

export type DependenciasRecordatorios = Readonly<{
  /** Google Meet spaces.members (COHOST); null significa resultado desconocido, nunca rechazado. */
  verificarCohosts: (organizador: string, codigo: string) => Promise<ReadonlySet<string> | null>;
  enviarCorreo: (input: Readonly<{
    to: readonly string[];
    subject: string;
    text: string;
    html: string;
  }>) => Promise<Readonly<{ sent: boolean; skipped?: string; error?: string }>>;
}>;

export type ResultadoRecordatorios = Readonly<{
  reuniones: number;
  destinatarios: number;
  enviados: number;
  omitidos: number;
  errores: number;
  verificacionesFallidas: number;
}>;

function normalizarEmail(email: string | null | undefined): string | null {
  const trimmed = email?.trim().toLowerCase();
  return trimmed && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ? trimmed : null;
}

/** No informa "verificado" por la DB: solamente la respuesta actual de spaces.members. */
export function clasificarAccesosPropios(
  cuentas: readonly string[],
  cohostsRemotos: ReadonlySet<string> | null,
  organizador: string | null
): AccesoRecordatorio {
  const propias = [...new Set(cuentas.map(normalizarEmail).filter((email): email is string => Boolean(email)))]
    .filter(email => email !== normalizarEmail(organizador));
  if (cohostsRemotos === null) {
    return { estado: "NO_VERIFICABLE", cuentasConfirmadas: [], cuentasSinPermiso: [] };
  }
  const remotas = new Set([...cohostsRemotos].map(normalizarEmail).filter((email): email is string => Boolean(email)));
  const cuentasConfirmadas = propias.filter(email => remotas.has(email));
  return {
    estado: cuentasConfirmadas.length ? "CONFIRMADO" : "SIN_PERMISOS",
    cuentasConfirmadas,
    cuentasSinPermiso: propias.filter(email => !remotas.has(email))
  };
}

function esDuplicado(error: unknown): boolean {
  return typeof error === "object" && error !== null &&
    "code" in error && error.code === "P2002";
}

/**
 * Corre en EC2 cada 5 minutos. En condiciones normales envía cuando faltan
 * hasta 24h para la clase; reuniones creadas con menos anticipación o después
 * de una interrupción reciben aviso tardío, siempre antes del encuentro.
 * La reserva única impide reenvíos tras fallos inciertos del proveedor.
 */
export async function procesarRecordatorios24h(
  db: PrismaClient,
  deps: DependenciasRecordatorios,
  ahora = new Date()
): Promise<ResultadoRecordatorios> {
  const limite = new Date(ahora.getTime() + 24 * HORA);
  const reuniones = await db.instanciaSala.findMany({
    where: {
      estado: "PROGRAMADA",
      inicioProgramadoAt: { gt: ahora, lte: limite },
      solicitud: { estado: { not: "CANCELADA" } }
    },
    orderBy: [{ inicioProgramadoAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      inicioProgramadoAt: true,
      finProgramadoAt: true,
      inicioAsistenciaTecnicaAt: true,
      finAsistenciaTecnicaAt: true,
      modalidadOverride: true,
      requiereAsistenciaTecnica: true,
      invitados: { select: { email: true } },
      solicitud: {
        select: {
          id: true, titulo: true, modalidad: true, creadaPorUsuarioId: true,
          docentePrograma: {
            select: {
              docente: { select: { usuarioId: true } },
              programa: { select: { nombre: true } }
            }
          }
        }
      },
      asignaciones: {
        where: { estado: { in: ["ASIGNADO", "ACEPTADO"] } },
        select: { asistenteTecnico: { select: { usuarioId: true, cesadoHastaProximoInicioSesion: true } } }
      },
      eventosProveedor: {
        where: { proveedor: FILTRO_PROVEEDOR_OPERATIVO },
        take: 1,
        select: {
          codigoReunion: true,
          joinUrl: true,
          payloadUltimo: true,
          proveedor: { select: { tipo: true } },
          cuentaProveedor: { select: { emailOrganizador: true } }
        }
      }
    }
  });

  const counters = { reuniones: reuniones.length, destinatarios: 0, enviados: 0, omitidos: 0, errores: 0, verificacionesFallidas: 0 };
  const cacheMeet = new Map<string, Promise<ReadonlySet<string> | null>>();

  for (const meeting of reuniones) {
    const ids = [...new Set([
      meeting.solicitud.creadaPorUsuarioId,
      meeting.solicitud.docentePrograma.docente.usuarioId,
      ...meeting.asignaciones
        .filter(asignacion => !asignacion.asistenteTecnico.cesadoHastaProximoInicioSesion)
        .map(asignacion => asignacion.asistenteTecnico.usuarioId)
    ])];
    const usuarios = await db.usuario.findMany({
      where: { id: { in: ids }, activo: true, fusionadoEnId: null },
      select: {
        id: true,
        nombres: true,
        emailPrincipal: true,
        cuentasGoogle: { select: { email: true } },
        emailAliases: { select: { email: true } },
        preferenciasNotificacion: {
          where: { tipo: "REUNION_RECORDATORIO" },
          select: { push: true, email: true }
        }
      }
    });
    const event = meeting.eventosProveedor[0];
    const organizador = normalizarEmail(event?.cuentaProveedor?.emailOrganizador);
    const codigo = event?.codigoReunion;
    let confirmados: ReadonlySet<string> | null = null;
    const esZoom = event?.proveedor?.tipo === "ZOOM";
    if (esZoom) {
      // Zoom: los alternative hosts aplicados quedan registrados al sincronizar.
      confirmados = cohostsVerificadosEnPayload(event?.payloadUltimo);
    } else if (organizador && codigo) {
      const key = organizador + "|" + codigo;
      let consulta = cacheMeet.get(key);
      if (!consulta) {
        consulta = deps.verificarCohosts(organizador, codigo).catch(() => null);
        cacheMeet.set(key, consulta);
      }
      confirmados = await consulta;
    }
    if (confirmados === null) counters.verificacionesFallidas++;

    for (const usuario of usuarios) {
      const destino = normalizarEmail(usuario.emailPrincipal);
      const preference = usuario.preferenciasNotificacion[0];
      if (!destino || preference?.email === false) {
        counters.omitidos++;
        continue;
      }
      counters.destinatarios++;

      // Claim atómico antes de hablar con SES/Gmail. Una ejecución concurrente
      // o un timeout del transporte jamás reenvía automáticamente el mismo correo.
      let reservado: { id: string };
      try {
        reservado = await db.recordatorioReunion.create({
          data: {
            instanciaSalaId: meeting.id,
            usuarioId: usuario.id,
            inicioProgramadoAt: meeting.inicioProgramadoAt,
            estado: "RESERVADO"
          },
          select: { id: true }
        });
      } catch (error) {
        if (esDuplicado(error)) {
          counters.omitidos++;
          continue;
        }
        throw error;
      }

      try {
        // Segunda comprobación justo antes del envío: evita recordatorios de
        // encuentros cancelados/reprogramados durante el procesamiento.
        const vigente = await db.instanciaSala.findUnique({
          where: { id: meeting.id },
          select: {
            estado: true, inicioProgramadoAt: true,
            solicitud: { select: { estado: true } }
          }
        });
        if (!vigente || vigente.estado !== "PROGRAMADA" ||
          vigente.solicitud.estado === "CANCELADA" ||
          vigente.inicioProgramadoAt.getTime() !== meeting.inicioProgramadoAt.getTime()) {
          await db.recordatorioReunion.update({
            where: { id: reservado.id },
            data: { estado: "OBSOLETO" }
          });
          counters.omitidos++;
          continue;
        }

        const cuentas = [
          usuario.emailPrincipal ?? "",
          ...usuario.cuentasGoogle.map(({ email }) => email),
          ...usuario.emailAliases.map(({ email }) => email)
        ];
        const acceso = clasificarAccesosPropios(cuentas, confirmados, organizador);
        const esMonitor = meeting.asignaciones.some(asignacion =>
          asignacion.asistenteTecnico.usuarioId === usuario.id &&
          !asignacion.asistenteTecnico.cesadoHastaProximoInicioSesion
        );
        const inicioMonitor = meeting.inicioAsistenciaTecnicaAt ?? meeting.inicioProgramadoAt;
        const finMonitor = meeting.finAsistenciaTecnicaAt ?? meeting.finProgramadoAt;
        const correo = construirRecordatorioReunion({
          plataforma: esZoom ? "Zoom" : "Google Meet",
          nombre: usuario.nombres,
          reunion: meeting.solicitud.titulo,
          programa: meeting.solicitud.docentePrograma.programa.nombre,
          fecha: formatLongDate(meeting.inicioProgramadoAt),
          horarioClase: formatTime(meeting.inicioProgramadoAt) + "–" + formatTime(meeting.finProgramadoAt) + " h",
          horarioMonitoreo: esMonitor
            ? formatTime(inicioMonitor) + "–" + formatTime(finMonitor) + " h" : null,
          modalidad: (meeting.modalidadOverride ?? meeting.solicitud.modalidad) === "HIBRIDA" ? "Híbrida" : "Virtual",
          urlMeet: event?.joinUrl ?? null,
          urlDetalle: APP_URL + "/reuniones/" + encodeURIComponent(meeting.solicitud.id),
          acceso
        });
        const resultado = await deps.enviarCorreo({ to: [destino], ...correo });
        if (!resultado.sent) {
          await db.recordatorioReunion.update({
            where: { id: reservado.id },
            data: { estado: "ERROR", errorCodigo: resultado.skipped ?? "NO_CONFIRMADO" }
          });
          counters.errores++;
          continue;
        }
        await db.recordatorioReunion.update({
          where: { id: reservado.id },
          data: { estado: "ACEPTADO", enviadoAt: new Date(), errorCodigo: null }
        });
        counters.enviados++;

        // La bandeja en la app acompaña al aviso por correo cuando está habilitada.
        if (preference?.push !== false) {
          await db.notificacion.create({
            data: {
              usuarioId: usuario.id,
              tipo: "REUNION_RECORDATORIO",
              titulo: "Tu próxima reunión",
              cuerpo: meeting.solicitud.titulo,
              href: "/reuniones/" + meeting.solicitud.id,
              metadata: { instanciaSalaId: meeting.id }
            }
          }).catch(() => undefined);
        }
      } catch (error) {
        const codigoError = error instanceof Error
          ? error.name.replace(/[^A-Za-z0-9_]/g, "").slice(0,80) : "Error";
        await db.recordatorioReunion.update({
          where: { id: reservado.id },
          data: { estado: "ERROR", errorCodigo: codigoError }
        }).catch(() => undefined);
        counters.errores++;
      }
    }

    // Invitados sin rol de usuario: la deduplicación usa su email normalizado,
    // no un UsuarioId inexistente. No se duplican los avisos que ya reciben
    // los responsables o monitores de esta misma reunión.
    const avisadosComoUsuario = new Set(usuarios
      .map(u => normalizarEmail(u.emailPrincipal))
      .filter((email): email is string => Boolean(email)));
    const invitados = [...new Set((meeting.invitados ?? [])
      .map(g => normalizarEmail(g.email))
      .filter((email): email is string => Boolean(email)))];
    for (const email of invitados) {
      if (avisadosComoUsuario.has(email)) { counters.omitidos++; continue; }
      counters.destinatarios++;
      let reservado: { id: string };
      try {
        reservado = await db.recordatorioInvitadoReunion.create({
          data: {
            instanciaSalaId: meeting.id, email,
            inicioProgramadoAt: meeting.inicioProgramadoAt,
            estado: "RESERVADO"
          }, select: { id: true }
        });
      } catch (error) {
        if (esDuplicado(error)) { counters.omitidos++; continue; }
        throw error;
      }
      try {
        const vigente = await db.instanciaSala.findUnique({
          where: { id: meeting.id },
          select: { estado: true, inicioProgramadoAt: true,
            solicitud: { select: { estado: true } },
            invitados: { where: { email }, select: { id: true } }
          }
        });
        if (!vigente || vigente.estado !== "PROGRAMADA" ||
            vigente.solicitud.estado === "CANCELADA" ||
            vigente.inicioProgramadoAt.getTime() !== meeting.inicioProgramadoAt.getTime() ||
            vigente.invitados.length === 0) {
          await db.recordatorioInvitadoReunion.update({
            where: { id: reservado.id }, data: { estado: "OBSOLETO" }
          });
          counters.omitidos++;
          continue;
        }
        const correo = construirCorreoParticipacion("RECORDATORIO", [{
          id: meeting.id, titulo: meeting.solicitud.titulo,
          inicio: meeting.inicioProgramadoAt, fin: meeting.finProgramadoAt,
          urlMeet: event?.joinUrl ?? null
        }], "INVITADO");
        const result = await deps.enviarCorreo({ to: [email], ...correo });
        await db.recordatorioInvitadoReunion.update({
          where: { id: reservado.id },
          data: { estado: result.sent ? "ACEPTADO" : "ERROR", enviadoAt: result.sent ? new Date() : null }
        });
        if (result.sent) counters.enviados++;
        else counters.errores++;
      } catch {
        await db.recordatorioInvitadoReunion.update({
          where: { id: reservado.id }, data: { estado: "ERROR" }
        }).catch(() => undefined);
        counters.errores++;
      }
    }
  }
  return counters;
}

function cohostsVerificadosEnPayload(payload: unknown): ReadonlySet<string> | null {
  if (!payload || typeof payload !== "object") return null;
  const verification = (payload as { salaVirtual?: { cohostVerification?: { emails?: unknown } | null } })
    .salaVirtual?.cohostVerification;
  return Array.isArray(verification?.emails)
    ? new Set(verification.emails.filter((email): email is string => typeof email === "string"))
    : null;
}
