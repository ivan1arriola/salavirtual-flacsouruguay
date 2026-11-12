import type { PrismaClient } from "@prisma/client";
import { ForbiddenApiError, NotFoundApiError, ValidationApiError } from "@/src/lib/http/api-error";
import { seleccionarEventoProveedorActivo } from "./evento-proveedor-activo.domain";
import { CUENTA_ZOOM_ASIGNABLE } from "./cuenta-asignable.domain";
import { claveBloqueoSerieMigracion, claveSerieReunion } from "./serie-reunion.domain";
import {
  meetPreparadoParaMigracion,
  planificarMigracionZoom,
  type EstadoVistaPreviaZoom
} from "./migracion-zoom-preview.domain";

type Actor = Readonly<{ id: string; rol: string }>;

const MARGEN_SEGURIDAD_HORAS = 24;
const MOTIVO_MAX = 500;

export type FilaVistaPreviaMigracion = Readonly<{
  id: string;
  titulo: string;
  programa: string;
  inicio: string;
  fin: string;
  estado: EstadoVistaPreviaZoom;
  hostZoom: Readonly<{ id: string; nombre: string; email: string | null }> | null;
  enlaceActual: string | null;
  tieneMeetHistorico: boolean;
  cambioEnlace: boolean;
  destinatarios: readonly string[];
  motivoExcepcion: string | null;
}>;

export type VistaPreviaMigracionZoom = Readonly<{
  generadaAt: string;
  margenSeguridadHoras: number;
  conteos: Readonly<Record<EstadoVistaPreviaZoom, number>>;
  filas: readonly FilaVistaPreviaMigracion[];
}>;

export function exigirAdministracion(actor: Actor) {
  if (actor.rol !== "ADMINISTRACION") {
    throw new ForbiddenApiError("Solo Administración puede gestionar la migración a Zoom.");
  }
}

/**
 * Marca o desmarca una instancia futura para conservarla en Google Meet.
 * Solo aplica a encuentros programados, aún no iniciados, cuyo enlace vigente
 * es Meet. No toca eventos de proveedor ni el calendario.
 */
export async function actualizarExcepcionGoogleMeet(
  db: PrismaClient,
  actor: Actor,
  input: Readonly<{ instanciaId: string; conservar: boolean; motivo?: string | null }>,
  ahora: Date = new Date()
) {
  exigirAdministracion(actor);
  const motivo = input.conservar ? (input.motivo ?? "").trim() : null;
  if (input.conservar && motivo!.length < 3) {
    throw new ValidationApiError("Indicá el motivo para conservar el encuentro en Google Meet.");
  }
  if (motivo && motivo.length > MOTIVO_MAX) {
    throw new ValidationApiError(`El motivo no puede superar ${MOTIVO_MAX} caracteres.`);
  }

  return db.$transaction(async (tx) => {
    // Misma clave que la migración por serie: una excepción no cambia mientras se convierte su serie.
    const base = await tx.instanciaSala.findUnique({
      where: { id: input.instanciaId },
      select: {
        solicitud: {
          select: { serieReunionId: true, docenteProgramaId: true, titulo: true, createdAt: true }
        }
      }
    });
    if (base?.solicitud) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${claveBloqueoSerieMigracion(claveSerieReunion(base.solicitud))}))`;
    }
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`flacso-meet:migracion-zoom:${input.instanciaId}`}))`;
    const instancia = await tx.instanciaSala.findUnique({
      where: { id: input.instanciaId },
      select: {
        id: true,
        estado: true,
        inicioProgramadoAt: true,
        proveedorActivoTipo: true,
        conservarGoogleMeet: true,
        motivoConservarGoogleMeet: true,
        eventosProveedor: { select: { proveedor: { select: { tipo: true } } } }
      }
    });
    if (!instancia) {
      throw new NotFoundApiError("El encuentro no existe.");
    }
    if (instancia.estado !== "PROGRAMADA" || instancia.inicioProgramadoAt <= ahora) {
      throw new ValidationApiError("Solo se puede marcar un encuentro programado que todavía no comenzó.");
    }
    if (seleccionarEventoProveedorActivo(instancia)?.proveedor.tipo !== "GOOGLE_MEET") {
      throw new ValidationApiError("El encuentro no tiene Google Meet como enlace vigente.");
    }
    if (input.conservar && instancia.eventosProveedor.some(({ proveedor }) => proveedor.tipo === "ZOOM")) {
      throw new ValidationApiError(
        "Ya se inició una conversión a Zoom para este encuentro. Revisá su estado antes de marcar una excepción."
      );
    }

    const actualizada = await tx.instanciaSala.update({
      where: { id: instancia.id },
      data: { conservarGoogleMeet: input.conservar, motivoConservarGoogleMeet: motivo },
      select: { id: true, conservarGoogleMeet: true, motivoConservarGoogleMeet: true }
    });
    await tx.auditoria.create({
      data: {
        actorUsuarioId: actor.id,
        accion: input.conservar ? "EXCEPCION_GOOGLE_MEET_MARCADA" : "EXCEPCION_GOOGLE_MEET_QUITADA",
        entidadTipo: "InstanciaSala",
        entidadId: instancia.id,
        valorAnterior: {
          conservarGoogleMeet: instancia.conservarGoogleMeet,
          motivo: instancia.motivoConservarGoogleMeet
        },
        valorNuevo: { conservarGoogleMeet: actualizada.conservarGoogleMeet, motivo }
      }
    });
    return actualizada;
  });
}

/** Encuentros futuros, salas Zoom y reservas vigentes. Solo lectura; la comparten las vistas por encuentro y por serie. */
export async function cargarDatosMigracionZoom(db: PrismaClient, ahora: Date) {
  const [instancias, hosts, reservas] = await Promise.all([
    db.instanciaSala.findMany({
      where: { estado: "PROGRAMADA", inicioProgramadoAt: { gt: ahora } },
      orderBy: [{ inicioProgramadoAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        estado: true,
        inicioProgramadoAt: true,
        finProgramadoAt: true,
        proveedorActivoTipo: true,
        conservarGoogleMeet: true,
        motivoConservarGoogleMeet: true,
        solicitud: {
          select: {
            titulo: true,
            serieReunionId: true,
            docenteProgramaId: true,
            createdAt: true,
            creadaPor: { select: { emailPrincipal: true } },
            docentePrograma: {
              select: {
                programa: { select: { nombre: true } },
                docente: { select: { usuario: { select: { emailPrincipal: true } } } }
              }
            }
          }
        },
        asignaciones: {
          where: { estado: { in: ["ASIGNADO", "ACEPTADO"] } },
          select: { asistenteTecnico: { select: { usuario: { select: { emailPrincipal: true } } } } }
        },
        cohostEmails: { select: { email: true } },
        invitados: { select: { email: true } },
        eventosProveedor: {
          select: {
            joinUrl: true,
            externalEventId: true,
            estadoIntegracion: true,
            operacionPendiente: true,
            reunionProveedorId: true,
            cuentaProveedorId: true,
            cuentaProveedor: { select: { emailOrganizador: true } },
            proveedor: { select: { tipo: true } }
          }
        }
      }
    }),
    db.cuentaProveedor.findMany({
      where: { ...CUENTA_ZOOM_ASIGNABLE, proveedor: { tipo: "ZOOM" } },
      orderBy: [{ prioridad: "asc" }, { id: "asc" }],
      select: { id: true, nombre: true, emailOrganizador: true, prioridad: true, limiteConcurrente: true }
    }),
    db.eventoProveedor.findMany({
      where: {
        proveedor: { tipo: "ZOOM" },
        cuentaProveedorId: { not: null },
        instancia: { estado: { in: ["PROGRAMADA", "EN_CURSO"] }, finProgramadoAt: { gt: ahora } }
      },
      select: {
        cuentaProveedorId: true,
        instanciaSalaId: true,
        instancia: { select: { inicioProgramadoAt: true, finProgramadoAt: true } }
      }
    })
  ]);
  return { instancias, hosts, reservas };
}

/** Calcula la propuesta de migración. No realiza ninguna escritura. */
export async function obtenerVistaPreviaMigracionZoom(
  db: PrismaClient,
  actor: Actor,
  ahora: Date = new Date()
): Promise<VistaPreviaMigracionZoom> {
  exigirAdministracion(actor);

  const { instancias, hosts, reservas } = await cargarDatosMigracionZoom(db, ahora);

  const porInstancia = new Map(instancias.map((instancia) => [instancia.id, instancia]));
  // Encuentros futuros por serie: una serie de Meet comparte un solo enlace, y migrarla
  // encuentro por encuentro dejaría un enlace distinto en cada uno.
  const encuentrosPorSerie = instancias.reduce<ReadonlyMap<string, number>>((conteo, { solicitud }) => {
    const clave = claveSerieReunion(solicitud);
    return new Map([...conteo, [clave, (conteo.get(clave) ?? 0) + 1]]);
  }, new Map());
  const hostPorId = new Map(hosts.map((host) => [host.id, host]));

  const plan = planificarMigracionZoom({
    ahora,
    margenSeguridadHoras: MARGEN_SEGURIDAD_HORAS,
    hosts: hosts.map((host) => ({ ...host, limiteConcurrente: 1 })),
    reservasZoom: reservas.flatMap(({ cuentaProveedorId, instancia }) =>
      cuentaProveedorId
        ? [{ cuentaProveedorId, inicio: instancia.inicioProgramadoAt, fin: instancia.finProgramadoAt }]
        : []
    ),
    candidatos: instancias.map((instancia) => {
      const activo = seleccionarEventoProveedorActivo(instancia)?.proveedor.tipo;
      const meet = instancia.eventosProveedor.find(({ proveedor }) => proveedor.tipo === "GOOGLE_MEET");
      const zoom = instancia.eventosProveedor.find(({ proveedor }) => proveedor.tipo === "ZOOM");
      const emailMeet = meet?.cuentaProveedor?.emailOrganizador?.trim().toLowerCase();
      const cuentaZoomPreferidaId = emailMeet
        ? (hosts.find((host) => host.emailOrganizador?.trim().toLowerCase() === emailMeet)?.id ?? null)
        : null;
      return {
        id: instancia.id,
        inicio: instancia.inicioProgramadoAt,
        fin: instancia.finProgramadoAt,
        estado: instancia.estado,
        proveedorActivo: activo === "GOOGLE_MEET" || activo === "ZOOM" ? activo : null,
        conservarGoogleMeet: instancia.conservarGoogleMeet,
        meetPreparado: meetPreparadoParaMigracion(
          meet
            ? {
                ...meet,
                emailOrganizador: meet.cuentaProveedor?.emailOrganizador ?? null
              }
            : null
        ),
        meetJoinUrl: meet?.joinUrl ?? null,
        cuentaZoomPreferidaId,
        zoomSincronizado: zoom?.estadoIntegracion === "SINCRONIZADA",
        encuentrosSerie: encuentrosPorSerie.get(claveSerieReunion(instancia.solicitud)) ?? 1
      };
    })
  });

  const conteos: Record<EstadoVistaPreviaZoom, number> = {
    MIGRABLE: 0,
    EXCEPCION: 0,
    SERIE: 0,
    YA_ZOOM: 0,
    SIN_SALA: 0,
    CERCANO: 0,
    NO_FUTURO: 0,
    REVISAR: 0
  };
  const filas = plan.map((fila): FilaVistaPreviaMigracion => {
    conteos[fila.estado] += 1;
    const instancia = porInstancia.get(fila.id)!;
    const host = fila.hostId ? hostPorId.get(fila.hostId) : undefined;
    const meet = instancia.eventosProveedor.find(({ proveedor }) => proveedor.tipo === "GOOGLE_MEET");
    const activo = seleccionarEventoProveedorActivo(instancia);
    const correos = new Set<string>();
    for (const email of [
      instancia.solicitud.docentePrograma.docente.usuario.emailPrincipal,
      instancia.solicitud.creadaPor.emailPrincipal,
      ...instancia.asignaciones.map(({ asistenteTecnico }) => asistenteTecnico.usuario.emailPrincipal),
      ...instancia.cohostEmails.map(({ email }) => email),
      ...instancia.invitados.map(({ email }) => email)
    ]) {
      if (email) {
        correos.add(email.toLowerCase());
      }
    }
    return {
      id: instancia.id,
      titulo: instancia.solicitud.titulo,
      programa: instancia.solicitud.docentePrograma.programa.nombre,
      inicio: instancia.inicioProgramadoAt.toISOString(),
      fin: instancia.finProgramadoAt.toISOString(),
      estado: fila.estado,
      hostZoom: host ? { id: host.id, nombre: host.nombre, email: host.emailOrganizador } : null,
      enlaceActual: activo?.joinUrl ?? null,
      tieneMeetHistorico: Boolean(meet),
      cambioEnlace: fila.estado === "MIGRABLE",
      destinatarios: fila.estado === "MIGRABLE" ? [...correos].sort() : [],
      motivoExcepcion: instancia.conservarGoogleMeet ? instancia.motivoConservarGoogleMeet : null
    };
  });

  return { generadaAt: ahora.toISOString(), margenSeguridadHoras: MARGEN_SEGURIDAD_HORAS, conteos, filas };
}
