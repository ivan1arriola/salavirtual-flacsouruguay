// Consumido por el proceso Node del worker, sin dependencia del runtime de Next.
import { db } from "../lib/db";
import { vincularAutomaticamenteSiInequivoco } from "../modules/archivos/infrastructure/prisma/zoom-vinculo-automatico";

const MAX_INTENTOS = 10;
const LEASE_MS = 5 * 60_000;
const TIPOS_GRABACION = ["recording.completed", "recording.transcript_completed"];

function proximoIntento(ahora: Date, intentos: number): Date {
  return new Date(ahora.getTime() + Math.min(24 * 60, 2 ** Math.min(intentos, 10)) * 60_000);
}

/** Reclamo atómico: varios workers pueden compartir la misma bandeja sin ejecutar un aviso dos veces. */
async function reclamar(ahora: Date) {
  const elegibles = await db.eventoWebhookZoom.findMany({
    where: {
      estado: { in: ["RECIBIDO", "ERROR"] },
      intentos: { lt: MAX_INTENTOS },
      proximoIntentoAt: { lte: ahora },
      OR: [{ claimHasta: null }, { claimHasta: { lte: ahora } }]
    },
    orderBy: [{ proximoIntentoAt: "asc" }, { id: "asc" }],
    take: 25
  });
  for (const aviso of elegibles) {
    const claimHasta = new Date(ahora.getTime() + LEASE_MS);
    const { count } = await db.eventoWebhookZoom.updateMany({
      where: {
        id: aviso.id,
        intentos: aviso.intentos,
        estado: { in: ["RECIBIDO", "ERROR"] },
        OR: [{ claimHasta: null }, { claimHasta: { lte: ahora } }]
      },
      data: { claimHasta, intentos: { increment: 1 } }
    });
    if (count === 1) {
      return { ...aviso, intentos: aviso.intentos + 1, claimHasta };
    }
  }
  return null;
}

async function aplicarAviso(
  aviso: NonNullable<Awaited<ReturnType<typeof reclamar>>>,
  cuentaConfigurada: string,
  ahora: Date
): Promise<"PROCESADO" | "IGNORADO"> {
  if (aviso.cuentaZoomId !== cuentaConfigurada) {
    return "IGNORADO";
  }
  await db.$transaction(async (tx) => {
    const cuenta = await tx.cuentaProveedor.findFirst({
      where: { externalAccountId: aviso.anfitrionZoomId, proveedor: { tipo: "ZOOM" } },
      select: { id: true }
    });
    const esGrabacion = TIPOS_GRABACION.includes(aviso.tipo);
    const ocurrencia = await tx.ocurrenciaArchivoZoom.upsert({
      where: { cuentaZoomId_uuid: { cuentaZoomId: aviso.cuentaZoomId, uuid: aviso.uuid } },
      create: {
        cuentaZoomId: aviso.cuentaZoomId,
        uuid: aviso.uuid,
        meetingId: aviso.meetingId,
        anfitrionZoomId: aviso.anfitrionZoomId,
        cuentaProveedorId: cuenta?.id ?? null,
        inicioRealAt: aviso.inicioRealAt,
        titulo: aviso.titulo,
        proximoInventarioAt: esGrabacion ? ahora : null
      },
      update: {
        // La señal sólo adelanta el inventario; los archivos y la asistencia previos nunca se reemplazan.
        ...(esGrabacion ? { proximoInventarioAt: ahora } : {}),
        ...(cuenta ? { cuentaProveedorId: cuenta.id } : {})
      },
      select: { id: true, eventoProveedorId: true }
    });
    const vinculo = await vincularAutomaticamenteSiInequivoco(tx, {
      ocurrenciaId: ocurrencia.id,
      uuid: aviso.uuid,
      meetingId: aviso.meetingId,
      inicioRealAt: aviso.inicioRealAt,
      eventoProveedorId: ocurrencia.eventoProveedorId,
      ahora
    });
    const eventoId =
      ocurrencia.eventoProveedorId ?? (vinculo.tipo === "VINCULADA" ? vinculo.eventoProveedorId : null);
    if (!eventoId) {
      return;
    }
    const evento = await tx.eventoProveedor.findUnique({
      where: { id: eventoId },
      select: { instanciaSalaId: true }
    });
    if (!evento) {
      return;
    }
    if (aviso.tipo === "meeting.started") {
      await tx.instanciaSala.updateMany({
        where: { id: evento.instanciaSalaId, estado: "PROGRAMADA" },
        data: { estado: "EN_CURSO", inicioRealAt: aviso.inicioRealAt }
      });
    }
    if (aviso.tipo === "meeting.ended") {
      await tx.instanciaSala.updateMany({
        where: { id: evento.instanciaSalaId, estado: { in: ["PROGRAMADA", "EN_CURSO"] } },
        data: { estado: "FINALIZADA", inicioRealAt: aviso.inicioRealAt, finRealAt: aviso.finRealAt }
      });
    }
  });
  return "PROCESADO";
}

/** El inventario y la asistencia existentes recogen después las ocurrencias señaladas por el webhook. */
export async function procesarWebhooksZoom(cuentaZoomId: string, limite = 25) {
  let procesados = 0;
  let ignorados = 0;
  let errores = 0;
  for (let indice = 0; indice < limite; indice++) {
    const ahora = new Date();
    const aviso = await reclamar(ahora);
    if (!aviso) {
      break;
    }
    try {
      const estado = await aplicarAviso(aviso, cuentaZoomId, ahora);
      await db.eventoWebhookZoom.updateMany({
        where: { id: aviso.id, claimHasta: aviso.claimHasta },
        data: { estado, claimHasta: null, procesadoAt: new Date(), errorCodigo: null }
      });
      if (estado === "IGNORADO") {
        ignorados++;
      } else {
        procesados++;
      }
    } catch (error) {
      errores++;
      const codigo =
        error instanceof Error && /^\w{1,60}$/.test(error.name) ? error.name : "ERROR_INESPERADO";
      await db.eventoWebhookZoom.updateMany({
        where: { id: aviso.id, claimHasta: aviso.claimHasta },
        data: {
          estado: aviso.intentos >= MAX_INTENTOS ? "FALLIDO" : "ERROR",
          claimHasta: null,
          errorCodigo: codigo,
          proximoIntentoAt: proximoIntento(new Date(), aviso.intentos)
        }
      });
    }
  }
  return { procesados, ignorados, errores };
}
