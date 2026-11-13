import "server-only";
import type { Prisma } from "@prisma/client";
import { crearProveedorTokenZoom } from "@/src/integrations/zoom/zoom-client";
import {
  listarProximasReunionesCuentaZoom,
  obtenerDetalleReunionPasadaZoom
} from "@/src/integrations/zoom/zoom-operations.client";
import { ZoomApiError } from "@/src/integrations/zoom/zoom-http";
import { descifrarConfiguracion } from "@/src/lib/config/encryption";
import { db } from "@/src/lib/db";
import { obtenerCredencialesZoom } from "@/src/modules/configuracion/zoom-config.service";
import {
  auditarSeriesZoom,
  compararAgendaZoom,
  detectarSolapesCuentasZoom,
  type ReunionZoomAuditable
} from "@/src/modules/operaciones/zoom-diagnostico.domain";
import { seleccionarEventoProveedorActivo } from "@/src/modules/reuniones/evento-proveedor-activo.domain";
import { filtroProveedorActivo } from "@/src/modules/reuniones/proveedor-reunion.domain";

const LIMITE_ENCUENTROS = 2000;

async function autenticacionZoom() {
  const credenciales = await obtenerCredencialesZoom(db, descifrarConfiguracion);
  return credenciales.disponible ? crearProveedorTokenZoom(credenciales) : null;
}

function mensajeZoom(error: unknown): string {
  if (error instanceof ZoomApiError && error.code === "CAPACIDAD_PENDIENTE") {
    return "La app de Zoom no tiene permiso para esta consulta.";
  }
  if (error instanceof ZoomApiError && error.code === "NO_ENCONTRADO") {
    return "Zoom no encontró la cuenta o reunión.";
  }
  return "No se pudo completar la consulta a Zoom. Revisá la integración e intentá de nuevo.";
}

export async function leerDiagnosticoZoom(ahora = new Date()) {
  const hasta = new Date(ahora.getTime() + 60 * 86400000);
  const desdeHistorico = new Date(ahora.getTime() - 30 * 86400000);
  const [cuentas, instancias, pasadas] = await Promise.all([
    db.cuentaProveedor.findMany({
      where: { proveedor: { tipo: "ZOOM" } },
      select: {
        id: true,
        nombre: true,
        emailOrganizador: true,
        externalAccountId: true,
        tieneLicencia: true,
        activa: true,
        origenGrupoZoom: true,
        fueraDelGrupoAt: true
      },
      orderBy: [{ activa: "desc" }, { prioridad: "asc" }, { nombre: "asc" }]
    }),
    db.instanciaSala.findMany({
      where: {
        estado: { not: "CANCELADA" },
        inicioProgramadoAt: { gte: ahora, lte: hasta },
        ...(filtroProveedorActivo("ZOOM") as Prisma.InstanciaSalaWhereInput)
      },
      select: {
        id: true,
        solicitudSalaId: true,
        inicioProgramadoAt: true,
        finProgramadoAt: true,
        proveedorActivoTipo: true,
        solicitud: { select: { titulo: true } },
        eventosProveedor: {
          select: {
            proveedor: { select: { tipo: true } },
            cuentaProveedorId: true,
            codigoReunion: true
          }
        }
      },
      orderBy: { inicioProgramadoAt: "asc" },
      take: LIMITE_ENCUENTROS + 1
    }),
    db.ocurrenciaArchivoZoom.findMany({
      where: { inicioRealAt: { gte: desdeHistorico }, eventoProveedorId: { not: null } },
      select: {
        id: true,
        uuid: true,
        inicioRealAt: true,
        meetingId: true,
        estadoAsistencia: true,
        sesionesAsistencia: { select: { id: true } },
        eventoProveedor: {
          select: {
            instanciaSalaId: true,
            instancia: { select: { solicitudSalaId: true, solicitud: { select: { titulo: true } } } }
          }
        }
      },
      orderBy: { inicioRealAt: "desc" },
      take: 30
    })
  ]);
  const reuniones: ReunionZoomAuditable[] = instancias.slice(0, LIMITE_ENCUENTROS).map((instancia) => {
    const evento = seleccionarEventoProveedorActivo(instancia);
    return {
      instanciaId: instancia.id,
      solicitudId: instancia.solicitudSalaId,
      titulo: instancia.solicitud.titulo,
      inicio: instancia.inicioProgramadoAt,
      fin: instancia.finProgramadoAt,
      cuentaId: evento?.cuentaProveedorId ?? null,
      meetingId: evento?.codigoReunion ?? null
    };
  });
  return {
    cuentas,
    reuniones,
    incidencias: auditarSeriesZoom(reuniones),
    solapes: detectarSolapesCuentasZoom(reuniones),
    pasadas: pasadas.filter(({ eventoProveedor }) => Boolean(eventoProveedor)),
    parcial: instancias.length > LIMITE_ENCUENTROS,
    desde: ahora,
    hasta
  };
}

export async function comprobarCuentaZoom(cuentaId: string, reuniones: readonly ReunionZoomAuditable[]) {
  const cuenta = await db.cuentaProveedor.findFirst({
    where: { id: cuentaId, proveedor: { tipo: "ZOOM" } },
    select: { id: true, externalAccountId: true, emailOrganizador: true }
  });
  if (!cuenta) {
    return { estado: "NO_DISPONIBLE" as const, mensaje: "Cuenta no encontrada." };
  }
  const usuarioId = cuenta.externalAccountId ?? cuenta.emailOrganizador;
  if (!usuarioId) {
    return { estado: "NO_DISPONIBLE" as const, mensaje: "Falta la identidad o la configuración de Zoom." };
  }
  try {
    const auth = await autenticacionZoom();
    if (!auth) {
      return { estado: "NO_DISPONIBLE" as const, mensaje: "Zoom no está configurado." };
    }
    const remotas = await listarProximasReunionesCuentaZoom(auth, usuarioId);
    return {
      estado: "DISPONIBLE" as const,
      totalZoom: remotas.length,
      ...compararAgendaZoom(
        reuniones.filter(({ cuentaId: id }) => id === cuenta.id),
        remotas
      )
    };
  } catch (error) {
    return { estado: "NO_DISPONIBLE" as const, mensaje: mensajeZoom(error) };
  }
}

export async function comprobarReunionPasadaZoom(ocurrenciaId: string) {
  const ocurrencia = await db.ocurrenciaArchivoZoom.findFirst({
    where: { id: ocurrenciaId, eventoProveedorId: { not: null } },
    select: { uuid: true }
  });
  if (!ocurrencia) {
    return { estado: "NO_DISPONIBLE" as const, mensaje: "Ocurrencia vinculada no encontrada." };
  }
  try {
    const auth = await autenticacionZoom();
    if (!auth) {
      return { estado: "NO_DISPONIBLE" as const, mensaje: "Zoom no está configurado." };
    }
    const detalle = await obtenerDetalleReunionPasadaZoom(auth, ocurrencia.uuid);
    return detalle
      ? { estado: "DISPONIBLE" as const, detalle }
      : {
          estado: "NO_DISPONIBLE" as const,
          mensaje: "Zoom todavía no ofrece el detalle de esta ocurrencia."
        };
  } catch (error) {
    return { estado: "NO_DISPONIBLE" as const, mensaje: mensajeZoom(error) };
  }
}
