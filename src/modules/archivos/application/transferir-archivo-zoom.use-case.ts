import {
  FALLOS_CONSECUTIVOS_PARA_REVISION_ZOOM,
  proximoIntentoZoom,
  sanearErrorZoom,
  type LeaseArchivoZoom,
  type LimitesCupoZoom
} from "../domain";
import type { ArchivoStoragePort, DestinoConservadoZoom, OrigenZoomPort, ZoomArchivoRepositoryPort } from "../ports";
import { TransferenciaZoomError, transferirStreamZoom } from "./zoom-transferencia-stream";

const GB = 1024n ** 3n;
const RESERVA_TAMANO_DESCONOCIDO = 50n * GB;
const VENTANA_RECIENTE_MS = 48 * 3600_000;

export type OpcionesTransferenciaZoom = Readonly<{
  ahora: () => Date;
  limites: LimitesCupoZoom;
  aleatorio: () => number;
  leaseMs: number;
  /** Cada cuánto se renueva el lease mientras se transfiere. */
  heartbeatMs: number;
  /** Margen antes de leaseHasta en que se aborta toda E/S local si no hubo renovación. */
  margenLeaseMs?: number;
  bloqueBytes?: number;
  maxDescarteBytes?: bigint;
  intentosMaximos?: number;
}>;

export type ResultadoTransferenciaArchivoZoom =
  | Readonly<{ tipo: "CONSERVADO"; destino: DestinoConservadoZoom }>
  | Readonly<{ tipo: "FALLO"; codigo: string }>
  | Readonly<{ tipo: "ESPERA"; codigo: string }>
  | Readonly<{ tipo: "LEASE_OBSOLETO" }>
  | Readonly<{ tipo: "INTERRUMPIDO" }>;

type ErrorZoomLike = Readonly<{ name?: string; code?: string; reintentarEnSegundos?: number | null; message?: string }>;

/**
 * Transfiere un archivo reclamado de Zoom a Drive. Cada paso persistente usa el lease: un worker
 * obsoleto nunca confirma. Drive es la fuente de verdad del offset; el ID de destino se persiste
 * antes de iniciar la subida para poder reconciliar si el worker cae.
 */
export async function transferirArchivoZoomUseCase(
  repo: ZoomArchivoRepositoryPort,
  origen: OrigenZoomPort,
  storage: ArchivoStoragePort,
  lease: LeaseArchivoZoom,
  signal: AbortSignal,
  opciones: OpcionesTransferenciaZoom
): Promise<ResultadoTransferenciaArchivoZoom> {
  const archivo = await repo.obtenerArchivoReclamado(lease);
  if (!archivo) return { tipo: "LEASE_OBSOLETO" };

  const ahora = opciones.ahora;
  const intentosMaximos = opciones.intentosMaximos ?? FALLOS_CONSECUTIVOS_PARA_REVISION_ZOOM;
  const margen = opciones.margenLeaseMs ?? 60_000;
  const origenKey = archivo.recurso.claveOrigen;

  const control = new AbortController();
  let leaseObsoleto = false;
  const abortarPorSenal = () => control.abort();
  signal.addEventListener("abort", abortarPorSenal, { once: true });
  if (signal.aborted) control.abort();

  let reservaId: string | null = null;
  let bytesTransferidos = 0n;
  let confirmados = archivo.bytesConfirmados;
  let plazo: ReturnType<typeof setTimeout> | undefined;
  let latido: ReturnType<typeof setInterval> | undefined;

  const armarPlazo = () => {
    if (plazo) clearTimeout(plazo);
    plazo = setTimeout(() => {
      leaseObsoleto = true;
      control.abort();
    }, Math.max(opciones.leaseMs - margen, 0));
    plazo.unref?.();
  };
  const progreso = async (extra: { driveFileId?: string | null; uploadSessionCifrada?: string | null } = {}): Promise<void> => {
    const ok = await repo.guardarProgreso(lease, {
      bytesConfirmados: confirmados,
      leaseHasta: new Date(ahora().getTime() + opciones.leaseMs),
      ...extra
    });
    if (!ok) {
      leaseObsoleto = true;
      control.abort();
      return;
    }
    armarPlazo();
  };
  const fallo = async (
    tipo: "REINTENTABLE" | "ESPERA" | "REVISION",
    codigo: string,
    detalle: string | null,
    proximoIntentoAt: Date | null
  ): Promise<ResultadoTransferenciaArchivoZoom> => {
    const ok = await repo.registrarFallo(lease, {
      tipo,
      codigo,
      detalle: sanearErrorZoom(detalle),
      proximoIntentoAt,
      ...(tipo === "REINTENTABLE" ? { limiteIntentos: intentosMaximos } : {})
    });
    if (!ok) return { tipo: "LEASE_OBSOLETO" };
    return tipo === "ESPERA" ? { tipo: "ESPERA", codigo } : { tipo: "FALLO", codigo };
  };

  try {
    armarPlazo();
    latido = setInterval(() => {
      void progreso().catch(() => undefined);
    }, opciones.heartbeatMs);
    latido.unref?.();

    // 1. Reconciliar siempre (por ID si se conoce, luego por marca de origen) antes de reservar o transferir.
    {
      const hallado = await storage.buscarConservado(origenKey, archivo.driveFileId, control.signal);
      if (hallado.tipo === "AMBIGUO") {
        return await fallo("REVISION", "DESTINO_AMBIGUO", `Drive tiene ${hallado.cantidad} recursos con la misma marca.`, null);
      }
      if (hallado.tipo === "UNO") {
        if (!(await repo.confirmarConservado(lease, hallado.destino))) return { tipo: "LEASE_OBSOLETO" };
        return { tipo: "CONSERVADO", destino: hallado.destino };
      }
    }

    // 2. Sesión: la consulta a Drive fija el offset real.
    let sesion = archivo.uploadSessionCifrada;
    let offset = 0n;
    if (sesion) {
      const estado = await storage.consultarSubida(sesion, null, control.signal);
      if (estado.estado === "COMPLETA") {
        if (!(await repo.confirmarConservado(lease, estado.destino))) return { tipo: "LEASE_OBSOLETO" };
        return { tipo: "CONSERVADO", destino: estado.destino };
      }
      if (estado.estado === "PARCIAL") {
        offset = estado.bytesConfirmados;
      } else {
        sesion = null;
        offset = 0n;
      }
    }
    confirmados = offset;

    // 3. Cupo: reservar lo que falta (el tamaño completo en un archivo nuevo).
    const total = archivo.recurso.tamanoBytes;
    const faltante = total === null ? RESERVA_TAMANO_DESCONOCIDO : total > offset ? total - offset : 0n;
    const historico = ahora().getTime() - archivo.ocurrencia.inicioRealAt.getTime() > VENTANA_RECIENTE_MS;
    const reserva = await repo.reservarTransferencia(lease, {
      bytes: faltante,
      prioridad: historico ? "HISTORICO" : "RECIENTE",
      ahora: ahora(),
      limites: opciones.limites
    });
    if (reserva.tipo === "LEASE_OBSOLETO") return { tipo: "LEASE_OBSOLETO" };
    if (reserva.tipo === "SIN_CUPO") {
      return await fallo("ESPERA", "TOPE_DIARIO", "Tope de transferencia de 24 h alcanzado.", reserva.liberacionEstimadaAt);
    }
    reservaId = reserva.reservaId;

    // 4. Destino: ID pregenerado persistido antes del POST; la sesión se crea una sola vez.
    let fileId = archivo.driveFileId;
    if (!fileId) {
      fileId = await storage.generarId();
      await progreso({ driveFileId: fileId });
      if (leaseObsoleto) return { tipo: "LEASE_OBSOLETO" };
    }
    if (!sesion) {
      sesion = await storage.iniciarSubida(
        {
          fileId,
          nombre: archivo.nombreDestino,
          carpetaId: archivo.driveFolderId ?? "",
          mimeType: "application/octet-stream",
          tamanoTotal: null
        },
        origenKey
      );
      confirmados = 0n;
      offset = 0n;
      await progreso({ uploadSessionCifrada: sesion });
      if (leaseObsoleto) return { tipo: "LEASE_OBSOLETO" };
    }

    // 5. Origen y transferencia con memoria acotada.
    const descarga = await origen.abrirDescarga(archivo.ocurrencia, archivo.recurso, offset, control.signal);
    if (descarga.tipo === "REQUIERE_REVISION") {
      return await fallo("REVISION", "ORIGEN_REQUIERE_REVISION", descarga.motivo, null);
    }

    let destinoFinal: DestinoConservadoZoom | null = null;
    const sesionActual = sesion;
    const resultado = await transferirStreamZoom({
      stream: descarga.contenido,
      offsetConfirmado: offset,
      offsetOrigen: descarga.offsetOrigen,
      bloqueBytes: opciones.bloqueBytes,
      totalConocido: null,
      maxDescarteBytes: opciones.maxDescarteBytes,
      signal: control.signal,
      subirBloque: async (desde, bytes, { ultimo }) => {
        const res = await storage.subirBloque(sesionActual, desde, bytes, null, { ultimo, signal: control.signal });
        if (res.estado === "COMPLETA") {
          destinoFinal = res.destino;
          bytesTransferidos += BigInt(bytes.byteLength);
          return { estado: "COMPLETA" };
        }
        if (res.estado === "PARCIAL") {
          bytesTransferidos += res.bytesConfirmados > desde ? res.bytesConfirmados - desde : 0n;
          confirmados = res.bytesConfirmados;
          await progreso();
        }
        return res;
      }
    });
    if (leaseObsoleto) return { tipo: "LEASE_OBSOLETO" };
    if (destinoFinal === null) {
      return await fallo(
        "REINTENTABLE",
        "SUBIDA_SIN_FINALIZAR",
        "Drive no confirmó la finalización.",
        proximoIntentoZoom(archivo.intentos + 1, ahora(), opciones.aleatorio)
      );
    }

    // 6. Verificación contra Drive antes de declarar conservado.
    const verificado = await storage.verificarArchivo((destinoFinal as DestinoConservadoZoom).id, control.signal);
    if (!verificado || verificado.tamanoBytes !== resultado.bytesTotales) {
      return await fallo("REVISION", "TAMANO_DISTINTO", "El tamaño en Drive no coincide con los bytes transferidos.", null);
    }
    if (!(await repo.confirmarConservado(lease, verificado))) return { tipo: "LEASE_OBSOLETO" };
    return { tipo: "CONSERVADO", destino: verificado };
  } catch (error) {
    if (leaseObsoleto) return { tipo: "LEASE_OBSOLETO" };
    if (signal.aborted) return { tipo: "INTERRUMPIDO" };
    if (error instanceof TransferenciaZoomError) {
      if (error.codigo === "SESION_VENCIDA") {
        await repo.guardarProgreso(lease, { bytesConfirmados: 0n, uploadSessionCifrada: null });
        return await fallo("ESPERA", "SESION_VENCIDA", error.message, ahora());
      }
      if (error.codigo === "CONFIRMACION_PARCIAL") {
        await repo.guardarProgreso(lease, { bytesConfirmados: error.bytesConfirmados ?? 0n });
        return await fallo("ESPERA", "CONFIRMACION_PARCIAL", error.message, ahora());
      }
      if (error.codigo === "ABORTADA") return { tipo: "INTERRUMPIDO" };
      return await fallo("REVISION", error.codigo, error.message, null);
    }
    const e = error as ErrorZoomLike;
    const esZoom = e.name === "ZoomApiError";
    return await fallo(
      "REINTENTABLE",
      esZoom && e.code ? String(e.code) : "ERROR_TRANSFERENCIA",
      e.message ?? "Error de transferencia.",
      proximoIntentoZoom(archivo.intentos + 1, ahora(), opciones.aleatorio, esZoom ? (e.reintentarEnSegundos ?? null) : null)
    );
  } finally {
    if (latido) clearInterval(latido);
    if (plazo) clearTimeout(plazo);
    signal.removeEventListener("abort", abortarPorSenal);
    if (reservaId !== null) await repo.liberarReserva(reservaId, bytesTransferidos, ahora()).catch(() => undefined);
  }
}
