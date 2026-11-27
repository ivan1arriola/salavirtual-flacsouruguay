import type { Prisma, PrismaClient } from "@prisma/client";
import { formatLongDate, formatTime } from "@/src/lib/ui/format";
import {
  construirAvisoEnlaceSerieZoom,
  type TipoAvisoEnlaceSerie,
} from "./aviso-enlace-serie-email.domain";
import { esUrlZoom } from "./migracion-zoom-aviso-email.domain";
import {
  normalizarEmailAviso,
  type EnviarCorreoMigracion,
  type EstadoAvisoDestinatario,
  type ResumenAvisosMigracion,
} from "./migracion-zoom-avisos.service";

export type { TipoAvisoEnlaceSerie };

export type DependenciasAvisoEnlaceSerie = Readonly<{
  db: PrismaClient;
  enviarCorreo: EnviarCorreoMigracion;
  leerInvitadosCalendar?: (calendarId: string, eventId: string) => Promise<readonly string[]>;
  ahora?: () => Date;
}>;

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

const vacio = (motivo: string): ResumenAvisosMigracion => ({
  estado: "NO_APLICA",
  motivo,
  destinatarios: 0,
  enviados: 0,
  yaEnviados: 0,
  enCurso: 0,
  errores: 0,
  detalle: [],
});

function esDuplicado(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

function codigoError(error: unknown): string {
  return error instanceof Error
    ? error.name.replace(/[^A-Za-z0-9_]/g, "").slice(0, 80) || "Error"
    : "Error";
}

/** Encuentro que todavía corresponde avisar: programado a futuro, en Zoom y de una solicitud vigente. */
function esVigente(
  instancia: Readonly<{
    estado: string;
    inicioProgramadoAt: Date;
    proveedorActivoTipo: string | null;
    solicitud: Readonly<{ estado: string }>;
  }>,
  ahora: Date,
): boolean {
  return (
    instancia.estado === "PROGRAMADA" &&
    instancia.inicioProgramadoAt > ahora &&
    instancia.proveedorActivoTipo === "ZOOM" &&
    instancia.solicitud.estado !== "CANCELADA"
  );
}

/**
 * Avisa del cambio de enlace de una serie: un correo por destinatario con TODOS los encuentros
 * próximos, una sola vez por serie, correo y tipo (outbox `AvisoEnlaceSerie`). Solo avisa de
 * encuentros que ya están en Zoom, así que nunca anuncia un cambio que no ocurrió. Idempotente:
 * los ACEPTADOS no se reenvían y los ERROR se reintentan. El `start_url` del anfitrión nunca se incluye.
 */
export async function notificarCambioEnlaceSerie(
  deps: DependenciasAvisoEnlaceSerie,
  input: Readonly<{
    serieClave: string;
    instanciaIds: readonly string[];
    tipo: TipoAvisoEnlaceSerie;
    joinUrl: string;
  }>,
): Promise<ResumenAvisosMigracion> {
  const { db } = deps;
  const ahora = (deps.ahora ?? (() => new Date()))();
  if (!esUrlZoom(input.joinUrl)) {
    return vacio("El enlace no es una URL de Zoom válida.");
  }

  const instancias = await db.instanciaSala.findMany({
    where: { id: { in: [...input.instanciaIds] } },
    select: seleccion,
  });
  const vigentes = instancias
    .filter((instancia) => esVigente(instancia, ahora))
    .sort((a, b) => a.inicioProgramadoAt.getTime() - b.inicioProgramadoAt.getTime());
  if (vigentes.length === 0) {
    return vacio("La serie no tiene encuentros programados a futuro en Zoom.");
  }

  // Destinatarios de todos los encuentros, deduplicados por correo normalizado.
  const nombres = new Map<string, string | null>();
  const agregar = (email: string | null | undefined, nombre: string | null = null) => {
    const normalizado = normalizarEmailAviso(email);
    if (normalizado && (!nombres.has(normalizado) || (nombre && !nombres.get(normalizado)))) {
      nombres.set(normalizado, nombre);
    }
  };
  const usuarioIds = [
    ...new Set(
      vigentes.flatMap((instancia) => [
        instancia.solicitud.creadaPorUsuarioId,
        instancia.solicitud.docentePrograma.docente.usuarioId,
        ...instancia.asignaciones
          .filter(({ asistenteTecnico }) => !asistenteTecnico.cesadoHastaProximoInicioSesion)
          .map(({ asistenteTecnico }) => asistenteTecnico.usuarioId),
      ]),
    ),
  ];
  const usuarios = await db.usuario.findMany({
    where: { id: { in: usuarioIds }, activo: true, fusionadoEnId: null },
    select: { nombres: true, emailPrincipal: true },
  });
  for (const usuario of usuarios) {
    agregar(usuario.emailPrincipal, usuario.nombres);
  }

  let errorCalendar: string | null = null;
  for (const instancia of vigentes) {
    for (const cohost of instancia.cohosts) {
      agregar(cohost.cuentaGoogle.email);
    }
    for (const cohost of instancia.cohostEmails) {
      agregar(cohost.email);
    }
    for (const invitado of instancia.invitados) {
      agregar(invitado.email, invitado.nombre);
    }
    // Calendar puede tener invitados añadidos a mano que no figuran en Sala Virtual.
    const meet = instancia.eventosProveedor.find(
      ({ proveedor }) => proveedor.tipo === "GOOGLE_MEET",
    );
    if (
      deps.leerInvitadosCalendar &&
      meet?.externalEventId &&
      meet.cuentaProveedor?.emailOrganizador
    ) {
      try {
        for (const email of await deps.leerInvitadosCalendar(
          meet.cuentaProveedor.emailOrganizador,
          meet.externalEventId,
        )) {
          agregar(email);
        }
      } catch (error) {
        errorCalendar =
          error instanceof Error ? error.message : "No se pudieron leer los invitados de Calendar.";
      }
    }
  }

  const primera = vigentes[0];
  const encuentros = vigentes.map((instancia) => ({
    fecha: formatLongDate(instancia.inicioProgramadoAt),
    horario: `${formatTime(instancia.inicioProgramadoAt)}–${formatTime(instancia.finProgramadoAt)} h`,
  }));
  const detalle: { email: string; estado: EstadoAvisoDestinatario; error?: string }[] = [];

  for (const [email, nombre] of nombres) {
    // 1. Reserva atómica. Un ERROR previo se re-reclama; ACEPTADO/RESERVADO/OBSOLETO no.
    let reservaId: string;
    try {
      reservaId = (
        await db.avisoEnlaceSerie.create({
          data: { serieClave: input.serieClave, email, tipo: input.tipo, estado: "RESERVADO" },
          select: { id: true },
        })
      ).id;
    } catch (error) {
      if (!esDuplicado(error)) {
        throw error;
      }
      const previo = await db.avisoEnlaceSerie.findUnique({
        where: { serieClave_email_tipo: { serieClave: input.serieClave, email, tipo: input.tipo } },
        select: { id: true, estado: true },
      });
      if (
        !previo ||
        (previo.estado !== "ACEPTADO" && previo.estado !== "OBSOLETO" && previo.estado !== "ERROR")
      ) {
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
      const reclamo = await db.avisoEnlaceSerie.updateMany({
        where: { id: previo.id, estado: "ERROR" },
        data: { estado: "RESERVADO" },
      });
      if (reclamo.count !== 1) {
        detalle.push({ email, estado: "EN_CURSO" });
        continue;
      }
      reservaId = previo.id;
    }

    // 2. Revalida justo antes de enviar y manda un correo individual.
    try {
      const actuales = await db.instanciaSala.findMany({
        where: { id: { in: [...input.instanciaIds] } },
        select: {
          estado: true,
          proveedorActivoTipo: true,
          inicioProgramadoAt: true,
          solicitud: { select: { estado: true } },
        },
      });
      if (!actuales.some((instancia) => esVigente(instancia, ahora))) {
        await db.avisoEnlaceSerie.update({
          where: { id: reservaId },
          data: { estado: "OBSOLETO" },
        });
        detalle.push({ email, estado: "OBSOLETO" });
        continue;
      }
      const correo = construirAvisoEnlaceSerieZoom({
        nombre,
        reunion: primera.solicitud.titulo,
        programa: primera.solicitud.docentePrograma.programa.nombre,
        encuentros,
        urlZoom: input.joinUrl,
        tipo: input.tipo,
      });
      const resultado = await deps.enviarCorreo({ to: [email], ...correo });
      if (!resultado.sent) {
        const codigo = (resultado.skipped ?? resultado.error ?? "NO_CONFIRMADO").slice(0, 80);
        await db.avisoEnlaceSerie.update({ where: { id: reservaId }, data: { estado: "ERROR" } });
        detalle.push({ email, estado: "ERROR", error: codigo });
        continue;
      }
      await db.avisoEnlaceSerie.update({
        where: { id: reservaId },
        data: { estado: "ACEPTADO", enviadoAt: new Date() },
      });
      detalle.push({ email, estado: "ENVIADO" });
    } catch (error) {
      // Una excepción del transporte o al confirmar en la base deja incierto si el mensaje salió:
      // mantener RESERVADO evita reenviarlo automáticamente.
      detalle.push({ email, estado: "EN_CURSO", error: codigoError(error) });
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
