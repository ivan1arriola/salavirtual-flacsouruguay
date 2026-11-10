import "server-only";
import { createHash } from "node:crypto";
import { crearGoogleAuthJwt } from "../integrations/google";
import { crearProveedorTokenZoom } from "../integrations/zoom/zoom-client";
import { descifrarConfiguracion } from "../lib/config/encryption";
import { db } from "../lib/db";
import { obtenerCredencialPrincipalGoogleWorkspace } from "../modules/configuracion/google-workspace.service";
import { obtenerCredencialesZoom } from "../modules/configuracion/zoom-config.service";
import {
  conciliarAsistenciaZoomUseCase,
  generarPlanillaAsistenciaZoomUseCase,
  sincronizarAsistenciaZoomUseCase,
  type EntradaConciliacionZoom
} from "../modules/archivos/application";
import type { ActorConciliacionZoom } from "../modules/archivos/domain";
import {
  crearGoogleZoomAsistenciaSheetsAdapter,
  crearPrismaAsistenciaZoomRepositoryAdapter,
  crearPrismaConciliacionAsistenciaZoomRepositoryAdapter,
  crearPrismaLecturaPlanillaZoomAdapter,
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

/** Genera o actualiza la planilla de Drive (solo administración) desde lo ya guardado. Usa el subject general de Workspace. */
export async function generarPlanillaAsistenciaOcurrenciaZoom(ocurrenciaId: string) {
  const workspace = await obtenerCredencialPrincipalGoogleWorkspace(db, descifrarConfiguracion, { requireActiva: true });
  if (!workspace) return { tipo: "ERROR", codigo: "WORKSPACE_NO_CONFIGURADO" } as const;
  const jwt = crearGoogleAuthJwt(
    {
      serviceAccountEmail: workspace.serviceAccountEmail,
      privateKey: workspace.privateKey,
      subject: workspace.serviceAccountSubject ?? undefined
    },
    ["https://www.googleapis.com/auth/drive", "https://www.googleapis.com/auth/spreadsheets"]
  );
  return generarPlanillaAsistenciaZoomUseCase(
    { lectura: crearPrismaLecturaPlanillaZoomAdapter({ db }), planillas: crearGoogleZoomAsistenciaSheetsAdapter(jwt) },
    ocurrenciaId
  );
}

/** Sincroniza cada ocurrencia del encuentro Zoom y luego intenta la planilla; ambos pasos son independientes. */
export async function regenerarAsistenciaInstanciaZoom(instanciaId: string) {
  const ocurrencias = await db.ocurrenciaArchivoZoom.findMany({
    where: { eventoProveedor: { instanciaSalaId: instanciaId, proveedor: { tipo: "ZOOM" } } },
    select: { id: true }, orderBy: { inicioRealAt: "asc" }
  });
  const resultados = [];
  for (const { id } of ocurrencias) {
    const sincronizacion = await sincronizarAsistenciaOcurrenciaZoom(id);
    const planilla = await generarPlanillaAsistenciaOcurrenciaZoom(id).catch(() => ({ tipo: "ERROR", codigo: "ERROR_PLANILLA" }) as const);
    resultados.push({ ocurrenciaId: id, sincronizacion, planilla });
  }
  return { ocurrencias: ocurrencias.length, resultados };
}
