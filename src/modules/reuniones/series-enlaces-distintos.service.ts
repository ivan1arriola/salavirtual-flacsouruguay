import type { Prisma, PrismaClient } from "@prisma/client";
import { exigirAdministracion } from "./migracion-zoom.service";
import { proveedorActivoDeInstancia } from "./proveedor-reunion.domain";
import { claveSerieReunion, construirFiltroSerieSolicitud } from "./serie-reunion.domain";
import {
  evaluarEnlacesDeSerie,
  type EncuentroEnlaceSerie,
} from "./series-enlaces-distintos.domain";

type Actor = Readonly<{ id: string; rol: string }>;

export type SerieConEnlacesDistintos = Readonly<{
  serieClave: string;
  titulo: string;
  programa: string;
  docente: string;
  encuentros: readonly Readonly<{
    instanciaId: string;
    inicio: Date;
    joinUrl: string | null;
    externalEventId: string | null;
    cuentaProveedorId: string | null;
  }>[];
  enlacesDistintos: number;
  cuentasDistintas: number;
}>;

const seleccion = {
  id: true,
  estado: true,
  inicioProgramadoAt: true,
  proveedorActivoTipo: true,
  solicitud: {
    select: {
      titulo: true,
      serieReunionId: true,
      docenteProgramaId: true,
      createdAt: true,
      docentePrograma: {
        select: {
          programa: { select: { nombre: true } },
          docente: { select: { usuario: { select: { nombres: true, apellidos: true } } } },
        },
      },
    },
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
  const tipo = proveedor === "ZOOM" ? "ZOOM" : "GOOGLE_MEET";
  const evento = instancia.eventosProveedor.find((item) => item.proveedor.tipo === tipo);
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

function agruparPorSerie(
  instancias: readonly InstanciaCargada[],
): ReadonlyMap<string, readonly InstanciaCargada[]> {
  return instancias.reduce<ReadonlyMap<string, readonly InstanciaCargada[]>>((mapa, instancia) => {
    const clave = claveSerieReunion(instancia.solicitud);
    return new Map([...mapa, [clave, [...(mapa.get(clave) ?? []), instancia]]]);
  }, new Map());
}

const futuras = (ahora: Date) =>
  ({ estado: "PROGRAMADA", inicioProgramadoAt: { gt: ahora } }) as const;

/**
 * Series cuyos encuentros futuros de Zoom no comparten un solo enlace y una sola cuenta anfitriona.
 * Solo Administración. No escribe. Las series mixtas (Meet y Zoom) y las ya unificadas no aparecen.
 */
export async function detectarSeriesConEnlacesDistintos(
  db: PrismaClient,
  actor: Actor,
  ahora: Date = new Date(),
): Promise<readonly SerieConEnlacesDistintos[]> {
  exigirAdministracion(actor);
  const instancias = await db.instanciaSala.findMany({
    where: futuras(ahora),
    orderBy: [{ inicioProgramadoAt: "asc" }, { id: "asc" }],
    select: seleccion,
  });

  return [...agruparPorSerie(instancias)].flatMap(([serieClave, delaSerie]) => {
    const encuentros = delaSerie.map(aEncuentro);
    const evaluacion = evaluarEnlacesDeSerie(encuentros, ahora);
    if (!evaluacion.necesitaCorreccion) {
      return [];
    }
    const { solicitud } = delaSerie[0];
    const { usuario } = solicitud.docentePrograma.docente;
    return [
      {
        serieClave,
        titulo: solicitud.titulo,
        programa: solicitud.docentePrograma.programa.nombre,
        docente: `${usuario.nombres} ${usuario.apellidos ?? ""}`.trim(),
        encuentros: encuentros
          .filter(({ proveedor }) => proveedor === "ZOOM")
          .map(({ instanciaId, inicio, joinUrl, externalEventId, cuentaProveedorId }) => ({
            instanciaId,
            inicio,
            joinUrl,
            externalEventId,
            cuentaProveedorId,
          })),
        enlacesDistintos: evaluacion.enlacesDistintos,
        cuentasDistintas: evaluacion.cuentasDistintas,
      },
    ];
  });
}

/**
 * Claves de las series (de las solicitudes dadas) que necesitan corrección. Sin chequeo de rol:
 * sirve para marcar series que la persona ya tiene a la vista; corregir sí exige Administración.
 * La clave de una solicitud es `claveSerieReunion(solicitud)`.
 */
export async function detectarSerieClavesConEnlacesDistintos(
  db: PrismaClient,
  solicitudIds: readonly string[],
  ahora: Date = new Date(),
): Promise<ReadonlySet<string>> {
  if (solicitudIds.length === 0) {
    return new Set();
  }
  const solicitudes = await db.solicitudSala.findMany({
    where: { id: { in: [...solicitudIds] } },
    select: { serieReunionId: true, docenteProgramaId: true, titulo: true, createdAt: true },
  });
  if (solicitudes.length === 0) {
    return new Set();
  }
  const instancias = await db.instanciaSala.findMany({
    where: { ...futuras(ahora), solicitud: { OR: solicitudes.map(construirFiltroSerieSolicitud) } },
    orderBy: [{ inicioProgramadoAt: "asc" }, { id: "asc" }],
    select: seleccion,
  });
  return new Set(
    [...agruparPorSerie(instancias)]
      .filter(
        ([, delaSerie]) =>
          evaluarEnlacesDeSerie(delaSerie.map(aEncuentro), ahora).necesitaCorreccion,
      )
      .map(([serieClave]) => serieClave),
  );
}
