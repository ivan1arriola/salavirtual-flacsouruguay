import { abrirDescargaZoomHttp } from "../../../../integrations/zoom/zoom-download.client";
import {
  listarGrabacionesAnfitrionZoomHttp,
  obtenerInventarioOcurrenciaZoomHttp
} from "../../../../integrations/zoom/zoom-recordings.client";
import type { AutenticacionZoom } from "../../../../integrations/zoom/zoom-http";
import { normalizarInventarioZoom, type HashZoom } from "../../domain";
import type { InventarioOrigenZoomPort } from "../../application/inventariar-zoom.use-case";
import type { OrigenZoomPort } from "../../ports";

/** Tipos cuyo contenido legítimo es JSON: un 200 JSON no debe tratarse como error de API. */
const TIPOS_JSON = new Set(["TIMELINE", "SUMMARY"]);

export type ZoomOrigenAdapterDeps = Readonly<{
  auth: AutenticacionZoom;
  /** Cuenta de Zoom propietaria de las credenciales (no el anfitrión). */
  cuentaZoomId: string;
  hash: HashZoom;
}>;

/**
 * Adaptador de lectura de Zoom. La URL autorizada de descarga vive solo dentro de `abrirDescarga`:
 * se obtiene del inventario fresco en cada intento y nunca se devuelve ni se persiste.
 */
export function crearZoomOrigenAdapter(deps: ZoomOrigenAdapterDeps): OrigenZoomPort & InventarioOrigenZoomPort {
  return {
    async obtenerInventario(ocurrencia) {
      const inventario = await obtenerInventarioOcurrenciaZoomHttp(deps.auth, ocurrencia.uuid);
      if (inventario === null) return null;
      return normalizarInventarioZoom(ocurrencia, inventario.respuesta, deps.hash);
    },

    listarOcurrencias(anfitrion, ventana, cursor) {
      return listarGrabacionesAnfitrionZoomHttp(
        deps.auth,
        anfitrion.anfitrionZoomId,
        { ...ventana, cuentaZoomId: anfitrion.cuentaZoomId },
        cursor
      );
    },

    async abrirDescarga(ocurrencia, recurso, offset, signal) {
      if (recurso.archivoZoomId === null) return { tipo: "REQUIERE_REVISION", motivo: "RECURSO_SIN_ID" };
      const inventario = await obtenerInventarioOcurrenciaZoomHttp(deps.auth, ocurrencia.uuid);
      if (inventario === null) return { tipo: "REQUIERE_REVISION", motivo: "OCURRENCIA_NO_ENCONTRADA" };
      const url = inventario.urlDescarga(recurso.archivoZoomId);
      if (url === null) return { tipo: "REQUIERE_REVISION", motivo: "SIN_URL_DESCARGA" };

      const descarga = await abrirDescargaZoomHttp(deps.auth, url, offset, signal, {
        permitirJson: TIPOS_JSON.has(recurso.tipoOriginal.trim().toUpperCase())
      });
      if (descarga.tipo === "REQUIERE_REVISION") return { tipo: "REQUIERE_REVISION", motivo: descarga.motivo };
      return {
        tipo: "CONTENIDO",
        // El cliente ya descartó el prefijo si Zoom ignoró Range: en PARCIAL el flujo empieza en `offset`.
        contenido: descarga.contenido as unknown as AsyncIterable<Uint8Array>,
        offsetOrigen: descarga.modo === "PARCIAL" ? BigInt(offset) : 0n,
        totalBytes: descarga.totalBytes
      };
    }
  };
}
