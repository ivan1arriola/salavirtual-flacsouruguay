import type { Prisma, PrismaClient } from "@prisma/client";
import { formatLongDate, formatTime } from "@/src/lib/ui/format";
import { seleccionarEventoProveedorActivo } from "./evento-proveedor-activo.domain";
import { construirAvisoMigracionZoom, esUrlZoom } from "./migracion-zoom-aviso-email.domain";

export type EnviarCorreoMigracion = (
  input: Readonly<{
    to: readonly string[];
    subject: string;
    text: string;
    html: string;
  }>,
) => Promise<Readonly<{ sent: boolean; skipped?: string; error?: string }>>;

export type DependenciasAvisosMigracionZoom = Readonly<{
  db: PrismaClient;
  enviarCorreo: EnviarCorreoMigracion;
  leerInvitadosCalendar?: (calendarId: string, eventId: string) => Promise<readonly string[]>;
  ahora?: () => Date;
}>;

export type EstadoAvisoDestinatario = "ENVIADO" | "YA_ENVIADO" | "EN_CURSO" | "ERROR" | "OBSOLETO";

export type ResumenAvisosMigracion = Readonly<{
  /**
   * COMPLETO: todos los destinatarios tienen aviso aceptado (o no hay a quién avisar).
   * PARCIAL: hay errores o envíos en curso; reintentar el encuentro reenvía solo los fallidos.
   * NO_APLICA: el proveedor activo aún no es Zoom (no se envía nada) o el encuentro no es vigente.
   * NO_CONFIGURADO: no hay transporte de correo disponible.
   */
  estado: "COMPLETO" | "PARCIAL" | "NO_APLICA" | "NO_CONFIGURADO";
  motivo?: string;
  destinatarios: number;
  enviados: number;
  yaEnviados: number;
  enCurso: number;
  errores: number;
  detalle: readonly Readonly<{ email: string; estado: EstadoAvisoDestinatario; error?: string }>[];
}>;

const vacio = (
  estado: ResumenAvisosMigracion["estado"],
  motivo: string,
): ResumenAvisosMigracion => ({
  estado,
  motivo,
  destinatarios: 0,
  enviados: 0,
  yaEnviados: 0,
  enCurso: 0,
  errores: 0,
  detalle: [],
});

export function normalizarEmailAviso(email: string | null | undefined): string | null {
  const limpio = email?.trim().toLowerCase();
  return limpio && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpio) ? limpio : null;
}

function esDuplicado(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

function codigoError(error: unknown): string {
  return error instanceof Error
    ? error.name.replace(/[^A-Za-z0-9_]/g, "").slice(0, 80) || "Error"
    : "Error";
}

const seleccion = {
  id: true,
  estado: true,
  inicioProgramadoAt: true,
  finProgramadoAt: true,
  proveedorActivoTipo: true,
  eventosProveedor: {
    select: {
      joinUrl: true,
      externalEventId: true,
      cuentaProveedor: { select: { emailOrganizador: true } },
      proveedor: { select: { tipo: true } },
    },
  },
  solicitud: {
    select: {
      titulo: true,
      estado: true,
      creadaPorUsuarioId: true,
      docentePrograma: {
        select: {
          docente: { select: { usuarioId: true } },
          programa: { select: { nombre: true } },
        },
      },
    },
  },
  asignaciones: {
    where: { estado: { in: ["ASIGNADO", "ACEPTADO"] } },
    select: {
      asistenteTecnico: { select: { usuarioId: true, cesadoHastaProximoInicioSesion: true } },
    },
  },
  cohosts: { select: { cuentaGoogle: { select: { email: true } } } },
  cohostEmails: { select: { email: true } },
  invitados: { select: { email: true, nombre: true } },
} satisfies Prisma.InstanciaSalaSelect;

/**
 * Avisa del cambio Meet → Zoom, una vez por encuentro y correo (outbox con
 * clave única instancia+email). Solo actúa cuando el proveedor activo ya es
 * ZOOM, así que jamás anuncia un cambio que no ocurrió. Es idempotente: los
 * ACEPTADOS no se reenvían y los ERROR se reintentan en la siguiente llamada.
 * El start_url del anfitrión nunca se incluye; solo el join_url real.
 */
export async function notificarMigracionZoom(
  deps: DependenciasAvisosMigracionZoom,
  instanciaId: string,
): Promise<ResumenAvisosMigracion> {
  const { db } = deps;
  const ahora = (deps.ahora ?? (() => new Date()))();
  const instancia = await db.instanciaSala.findUnique({
    where: { id: instanciaId },
    select: seleccion,
  });
  if (!instancia) {
    return vacio("NO_APLICA", "El encuentro no existe.");
  }
  if (instancia.proveedorActivoTipo !== "ZOOM") {
    return vacio("NO_APLICA", "El proveedor activo todavía no es Zoom.");
  }
  if (
    instancia.estado !== "PROGRAMADA" ||
    instancia.solicitud.estado === "CANCELADA" ||
    instancia.inicioProgramadoAt <= ahora
  ) {
    return vacio("NO_APLICA", "El encuentro ya no está programado a futuro.");
  }
  const joinUrl = seleccionarEventoProveedorActivo(instancia)?.joinUrl ?? "";
  if (!esUrlZoom(joinUrl)) {
    return vacio("NO_APLICA", "El encuentro no tiene un enlace de Zoom válido.");
  }

  // Destinatarios conocidos, deduplicados por correo normalizado.
  const nombres = new Map<string, string | null>();
  const agregar = (email: string | null | undefined, nombre: string | null = null) => {
    const normalizado = normalizarEmailAviso(email);
    if (normalizado && (!nombres.has(normalizado) || (nombre && !nombres.get(normalizado)))) {
      nombres.set(normalizado, nombre);
    }
  };
  const usuarioIds = [
    ...new Set([
      instancia.solicitud.creadaPorUsuarioId,
      instancia.solicitud.docentePrograma.docente.usuarioId,
      ...instancia.asignaciones
        .filter(({ asistenteTecnico }) => !asistenteTecnico.cesadoHastaProximoInicioSesion)
        .map(({ asistenteTecnico }) => asistenteTecnico.usuarioId),
    ]),
  ];
  const usuarios = await db.usuario.findMany({
    where: { id: { in: usuarioIds }, activo: true, fusionadoEnId: null },
    select: { nombres: true, emailPrincipal: true },
  });
  for (const u of usuarios) {
    agregar(u.emailPrincipal, u.nombres);
  }
  for (const c of instancia.cohosts) {
    agregar(c.cuentaGoogle.email);
  }
  for (const c of instancia.cohostEmails) {
    agregar(c.email);
  }
  for (const g of instancia.invitados) {
    agregar(g.email, g.nombre);
  }

  // Calendar puede contener invitados añadidos manualmente que aún no figuran
  // en Sala Virtual. La clave única de la outbox deduplica ambos orígenes.
  const meet = instancia.eventosProveedor.find(({ proveedor }) => proveedor.tipo === "GOOGLE_MEET");
  let errorCalendar: string | null = null;
  if (
    deps.leerInvitadosCalendar &&
    meet?.externalEventId &&
    meet.cuentaProveedor?.emailOrganizador
  ) {
    try {
      const invitadosCalendar = await deps.leerInvitadosCalendar(
        meet.cuentaProveedor.emailOrganizador,
        meet.externalEventId,
      );
      for (const email of invitadosCalendar) {
        agregar(email);
      }
    } catch (error) {
      errorCalendar =
        error instanceof Error ? error.message : "No se pudieron leer los invitados de Calendar.";
    }
  }

  const fecha = formatLongDate(instancia.inicioProgramadoAt);
  const horario =
    formatTime(instancia.inicioProgramadoAt) + "–" + formatTime(instancia.finProgramadoAt) + " h";
  const detalle: { email: string; estado: EstadoAvisoDestinatario; error?: string }[] = [];

  for (const [email, nombre] of nombres) {
    // 1. Reserva atómica. Un ERROR previo se re-reclama; ACEPTADO/RESERVADO/OBSOLETO no.
    let reservaId: string;
    try {
      reservaId = (
        await db.avisoMigracionZoom.create({
          data: {
            instanciaSalaId: instancia.id,
            email,
            inicioProgramadoAt: instancia.inicioProgramadoAt,
            joinUrl,
            estado: "RESERVADO",
          },
          select: { id: true },
        })
      ).id;
    } catch (error) {
      if (!esDuplicado(error)) {
        throw error;
      }
      const previo = await db.avisoMigracionZoom.findUnique({
        where: { instanciaSalaId_email: { instanciaSalaId: instancia.id, email } },
        select: { id: true, estado: true },
      });
      if (!previo) {
        detalle.push({ email, estado: "EN_CURSO" });
        continue;
      }
      if (previo.estado === "ACEPTADO") {
        detalle.push({ email, estado: "YA_ENVIADO" });
        continue;
      }
      if (previo.estado === "OBSOLETO") {
        detalle.push({ email, estado: "OBSOLETO" });
        continue;
      }
      if (previo.estado !== "ERROR") {
        detalle.push({ email, estado: "EN_CURSO" });
        continue;
      }
      const reclamo = await db.avisoMigracionZoom.updateMany({
        where: { id: previo.id, estado: "ERROR" },
        data: {
          estado: "RESERVADO",
          errorCodigo: null,
          joinUrl,
          inicioProgramadoAt: instancia.inicioProgramadoAt,
          intentos: { increment: 1 },
        },
      });
      if (reclamo.count !== 1) {
        detalle.push({ email, estado: "EN_CURSO" });
        continue;
      }
      reservaId = previo.id;
    }

    // 2. Revalida justo antes de enviar y manda un correo individual.
    try {
      const vigente = await db.instanciaSala.findUnique({
        where: { id: instancia.id },
        select: {
          estado: true,
          proveedorActivoTipo: true,
          inicioProgramadoAt: true,
          solicitud: { select: { estado: true } },
        },
      });
      if (
        !vigente ||
        vigente.estado !== "PROGRAMADA" ||
        vigente.proveedorActivoTipo !== "ZOOM" ||
        vigente.solicitud.estado === "CANCELADA" ||
        vigente.inicioProgramadoAt.getTime() !== instancia.inicioProgramadoAt.getTime()
      ) {
        await db.avisoMigracionZoom.update({
          where: { id: reservaId },
          data: { estado: "OBSOLETO" },
        });
        detalle.push({ email, estado: "OBSOLETO" });
        continue;
      }
      const correo = construirAvisoMigracionZoom({
        nombre,
        reunion: instancia.solicitud.titulo,
        programa: instancia.solicitud.docentePrograma.programa.nombre,
        fecha,
        horario,
        urlZoom: joinUrl,
      });
      const resultado = await deps.enviarCorreo({ to: [email], ...correo });
      if (!resultado.sent) {
        const codigo = (resultado.skipped ?? resultado.error ?? "NO_CONFIRMADO").slice(0, 80);
        await db.avisoMigracionZoom.update({
          where: { id: reservaId },
          data: { estado: "ERROR", errorCodigo: codigo },
        });
        detalle.push({ email, estado: "ERROR", error: codigo });
        continue;
      }
      await db.avisoMigracionZoom.update({
        where: { id: reservaId },
        data: { estado: "ACEPTADO", enviadoAt: new Date(), errorCodigo: null },
      });
      detalle.push({ email, estado: "ENVIADO" });
    } catch (error) {
      const codigo = codigoError(error);
      // Una excepción del transporte o al confirmar en la DB deja incierto si
      // el mensaje salió. Mantener RESERVADO evita reenviarlo automáticamente.
      await db.avisoMigracionZoom
        .update({ where: { id: reservaId }, data: { errorCodigo: codigo } })
        .catch(() => undefined);
      detalle.push({ email, estado: "EN_CURSO", error: codigo });
    }
  }

  const cuenta = (estado: EstadoAvisoDestinatario) =>
    detalle.filter((d) => d.estado === estado).length;
  const errores = cuenta("ERROR");
  const enCurso = cuenta("EN_CURSO");
  return {
    estado: errores || enCurso || errorCalendar ? "PARCIAL" : "COMPLETO",
    ...(errorCalendar
      ? { motivo: `No se pudieron leer todos los invitados de Calendar: ${errorCalendar}` }
      : {}),
    destinatarios: detalle.length,
    enviados: cuenta("ENVIADO"),
    yaEnviados: cuenta("YA_ENVIADO"),
    enCurso,
    errores,
    detalle,
  };
}
