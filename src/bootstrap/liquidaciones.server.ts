import "server-only";
import { db } from "@/src/lib/db";
import { enviarCorreoConfigurado } from "@/src/modules/configuracion/correo.service";
import {
  crearExceljsPlanillaPagosAdapter,
  crearPrismaLiquidacionesRepositoryAdapter,
  crearPrismaTarifasRepositoryAdapter,
  crearServicioLiquidaciones,
  type LiquidacionesRepositoryPort,
  type PlanillaPagosExporterPort,
  type ServicioLiquidaciones,
  type TarifasRepositoryPort,
} from "@/src/modules/liquidaciones/api";

export function crearTarifasRepository(): TarifasRepositoryPort {
  return crearPrismaTarifasRepositoryAdapter(db);
}

export function crearLiquidacionesRepository(): LiquidacionesRepositoryPort {
  return crearPrismaLiquidacionesRepositoryAdapter(db);
}

export function crearPlanillaPagosExporter(): PlanillaPagosExporterPort {
  return crearExceljsPlanillaPagosAdapter();
}

export function obtenerServicioLiquidaciones(): ServicioLiquidaciones {
  return crearServicioLiquidaciones({
    liquidacionesRepo: crearLiquidacionesRepository(),
    tarifasRepo: crearTarifasRepository(),
    exporter: crearPlanillaPagosExporter(),
    enviarCorreo: (input) => enviarCorreoConfigurado(db, input),
  });
}

export async function enviarReportesMensuales(ahora?: Date) {
  return obtenerServicioLiquidaciones().enviarReportesMensuales(ahora);
}
