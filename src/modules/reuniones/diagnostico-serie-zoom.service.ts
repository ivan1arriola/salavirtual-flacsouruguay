import type { Prisma, PrismaClient } from "@prisma/client";
import { diagnosticarSerieZoom, type DiagnosticoSerieZoom } from "./diagnostico-serie-zoom.domain";
import { exigirAdministracion } from "./migracion-zoom.service";
import { proveedorActivoDeInstancia } from "./proveedor-reunion.domain";
import { claveSerieReunion } from "./serie-reunion.domain";
import type { EncuentroEnlaceSerie } from "./series-enlaces-distintos.domain";

const seleccion = {
  id: true,
  estado: true,
  inicioProgramadoAt: true,
  proveedorActivoTipo: true,
  solicitud: {
    select: { titulo: true, serieReunionId: true, docenteProgramaId: true, createdAt: true },
  },
  eventosProveedor: {
    select: {
      joinUrl: true,
      externalEventId: true,
      cuentaProveedorId: true,
      reunionProveedorId: true,
      proveedor: { select: { tipo: true } },
    },
  },
} satisfies Prisma.InstanciaSalaSelect;

type InstanciaCargada = Prisma.InstanciaSalaGetPayload<{ select: typeof seleccion }>;

function aEncuentro(instancia: InstanciaCargada): EncuentroEnlaceSerie {
  const proveedor = proveedorActivoDeInstancia(instancia);
  const evento = instancia.eventosProveedor.find((item) => item.proveedor.tipo === proveedor);
  return {
    instanciaId: instancia.id,
    inicio: instancia.inicioProgramadoAt,
    estado: instancia.estado,
    proveedor,
    joinUrl: evento?.joinUrl ?? null,
    externalEventId: evento?.externalEventId ?? null,
    cuentaProveedorId: evento?.cuentaProveedorId ?? null,
    reunionProveedorId: evento?.reunionProveedorId ?? null,
  };
}

/**
 * Diagnóstico de las series con encuentros futuros programados. Solo Administración; solo lectura.
 * Con `incluirHuerfanas` suma las series que ya no tienen encuentros futuros pero conservan una reunión
 * Zoom activa (se diagnostican como `HUERFANA`); por defecto no, porque incluye series históricas.
 */
export async function obtenerDiagnosticosSeriesZoom(
  db: PrismaClient,
  actor: Readonly<{ id: string; rol: string }>,
  ahora: Date = new Date(),
  opciones: Readonly<{ incluirHuerfanas?: boolean }> = {},
): Promise<ReadonlyMap<string, DiagnosticoSerieZoom>> {
  exigirAdministracion(actor);
  const instancias = await db.instanciaSala.findMany({
    where: { estado: "PROGRAMADA", inicioProgramadoAt: { gt: ahora } },
    orderBy: [{ inicioProgramadoAt: "asc" }, { id: "asc" }],
    select: seleccion,
  });
  const porSerie = new Map<string, EncuentroEnlaceSerie[]>();
  for (const instancia of instancias) {
    const clave = claveSerieReunion(instancia.solicitud);
    const encuentros = porSerie.get(clave) ?? [];
    encuentros.push(aEncuentro(instancia));
    porSerie.set(clave, encuentros);
  }

  const claves = [...porSerie.keys()];
  const reunionesDeLaSerie = { serieClave: { in: claves }, proveedor: { tipo: "ZOOM" } } as const;
  const reuniones = await db.reunionProveedor.findMany({
    where: opciones.incluirHuerfanas
      ? {
        proveedor: { tipo: "ZOOM" },
        OR: [
          { serieClave: { in: claves } },
          { serieClave: { notIn: claves }, estadoCreacion: { in: ["PENDIENTE", "CREANDO", "CREADA"] } },
        ],
      }
      : reunionesDeLaSerie,
    select: {
      serieClave: true, id: true, estadoCreacion: true, externalId: true, joinUrl: true, cuentaProveedorId: true,
    },
  });
  const clavesConAvisos = [...new Set([...claves, ...reuniones.map(({ serieClave }) => serieClave)])];
  const avisos = await db.avisoEnlaceSerie.findMany({
    where: { serieClave: { in: clavesConAvisos } },
    select: { serieClave: true, email: true, tipo: true, estado: true },
  });
  const reunionesPorSerie = new Map<string, typeof reuniones>();
  for (const reunion of reuniones) {
    const delaSerie = reunionesPorSerie.get(reunion.serieClave) ?? [];
    delaSerie.push(reunion);
    reunionesPorSerie.set(reunion.serieClave, delaSerie);
  }
  const avisosPorSerie = new Map<string, typeof avisos>();
  for (const aviso of avisos) {
    const delaSerie = avisosPorSerie.get(aviso.serieClave) ?? [];
    delaSerie.push(aviso);
    avisosPorSerie.set(aviso.serieClave, delaSerie);
  }

  const clavesDiagnosticadas = opciones.incluirHuerfanas
    ? [...new Set([...porSerie.keys(), ...reunionesPorSerie.keys()])]
    : [...porSerie.keys()];
  return new Map(clavesDiagnosticadas.map((serieClave) => [serieClave, diagnosticarSerieZoom({
    serieClave,
    ahora,
    encuentros: porSerie.get(serieClave) ?? [],
    reuniones: reunionesPorSerie.get(serieClave) ?? [],
    avisos: avisosPorSerie.get(serieClave) ?? [],
  })]));
}
