import "server-only";
import { createHash } from "node:crypto";
import { crearProveedorTokenZoom } from "../integrations/zoom/zoom-client";
import { descifrarConfiguracion } from "../lib/config/encryption";
import { db } from "../lib/db";
import { obtenerCredencialesZoom } from "../modules/configuracion/zoom-config.service";
import {
  conciliarAsistenciaZoomUseCase,
  sincronizarAsistenciaZoomUseCase,
  type EntradaConciliacionZoom
} from "../modules/archivos/application";
import type { ActorConciliacionZoom } from "../modules/archivos/domain";
import {
  crearPrismaAsistenciaZoomRepositoryAdapter,
  crearPrismaConciliacionAsistenciaZoomRepositoryAdapter,
  crearPrismaSincronizacionAsistenciaZoomAdapter,
  crearZoomAsistenciaProviderAdapter
} from "../modules/archivos/infrastructure";

const hash = (texto: string): string => createHash("sha256").update(texto).digest("hex");

/** Sincroniza una ocurrencia: solo base de datos y Zoom, sin Workspace ni Meet. */
export async function sincronizarAsistenciaOcurrenciaZoom(ocurrenciaId: string) {
  const zoom = await obtenerCredencialesZoom(db, descifrarConfiguracion);
  if (!zoom.disponible) return { tipo: "ERROR", codigo: "ZOOM_NO_CONFIGURADO" } as const;
  const auth = crearProveedorTokenZoom({ accountId: zoom.accountId, clientId: zoom.clientId, clientSecret: zoom.clientSecret });
  return sincronizarAsistenciaZoomUseCase(
    {
      sync: crearPrismaSincronizacionAsistenciaZoomAdapter({ db }),
      repo: crearPrismaAsistenciaZoomRepositoryAdapter({ db }),
      provider: crearZoomAsistenciaProviderAdapter({ auth, hash })
    },
    ocurrenciaId
  );
}

export function conciliarAsistenciaZoom(actor: ActorConciliacionZoom, entrada: EntradaConciliacionZoom) {
  return conciliarAsistenciaZoomUseCase(
    { repo: crearPrismaConciliacionAsistenciaZoomRepositoryAdapter({ db }) },
    actor,
    entrada
  );
}
