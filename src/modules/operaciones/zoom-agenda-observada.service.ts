import type { PrismaClient } from "@prisma/client";
import type { MovimientoReunionZoom } from "@/src/integrations/zoom/zoom-agenda";
import type { ReunionAgendaZoom } from "@/src/integrations/zoom/zoom-operations.client";
import { detectarInconsistenciasAgendaZoom, type ObservadaAgendaZoom } from "./zoom-agenda-observada.domain";
import type { ReunionZoomAuditable } from "./zoom-diagnostico.domain";

type Db = Pick<PrismaClient, "reunionZoomObservada" | "cuentaProveedor" | "eventoProveedor">;

/** Zoom no siempre informa la duración en una actualización parcial: sin dato previo se asume una hora. */
const DURACION_POR_DEFECTO_MIN = 60;
const minutosAMs = (min: number) => min * 60_000;

type FilaObservada = Awaited<ReturnType<Db["reunionZoomObservada"]["findMany"]>>[number];

/** Actualización sin horario: solo se aplican el tema y/o la duración a lo futuro que ya se conoce. */
async function aplicarCambiosSinHorario(
  db: Db,
  existentes: readonly FilaObservada[],
  mov: MovimientoReunionZoom,
  ahora: Date
): Promise<void> {
  for (const fila of existentes.filter(({ estado, inicioAt }) => estado === "ACTIVA" && inicioAt > ahora)) {
    await db.reunionZoomObservada.update({
      where: { id: fila.id },
      data: {
        ...(mov.tema ? { tema: mov.tema } : {}),
        ...(mov.duracionMin
          ? { finAt: new Date(fila.inicioAt.getTime() + minutosAMs(mov.duracionMin)) }
          : {}),
        origen: "WEBHOOK",
        observadaAt: ahora
      }
    });
  }
}

/** Una lista de ocurrencias es la lista completa: las futuras que ya no están fueron quitadas en Zoom. */
async function quitarOcurrenciasSobrantes(
  db: Db,
  existentes: readonly FilaObservada[],
  mov: MovimientoReunionZoom,
  ahora: Date
): Promise<void> {
  if (!mov.ocurrencias.some(({ ocurrenciaZoomId }) => ocurrenciaZoomId !== "")) {
    return;
  }
  const vigentes = new Set(mov.ocurrencias.map(({ ocurrenciaZoomId }) => ocurrenciaZoomId));
  const sobrantes = existentes
    .filter(
      ({ estado, ocurrenciaZoomId, inicioAt }) =>
        estado === "ACTIVA" && inicioAt > ahora && !vigentes.has(ocurrenciaZoomId)
    )
    .map(({ id }) => id);
  if (sobrantes.length) {
    await db.reunionZoomObservada.updateMany({
      where: { id: { in: sobrantes } },
      data: { estado: "ELIMINADA", origen: "WEBHOOK", observadaAt: ahora }
    });
  }
}

/** Registra un movimiento (webhook meeting.created/updated/deleted) en el espejo de la agenda de Zoom. */
export async function registrarMovimientoReunionZoom(
  db: Db,
  mov: MovimientoReunionZoom,
  ahora = new Date()
): Promise<void> {
  const clave = { cuentaZoomId: mov.cuentaZoomId, meetingId: mov.meetingId };
  // Lo que ya empezó (en curso o transcurrido) nunca se modifica: solo se tocan ocurrencias futuras.
  const vigente = { ...clave, estado: "ACTIVA", inicioAt: { gt: ahora } };
  const marcaEliminada = { estado: "ELIMINADA", origen: "WEBHOOK", observadaAt: ahora };

  if (mov.tipo === "deleted") {
    await db.reunionZoomObservada.updateMany({
      where: {
        ...vigente,
        ...(mov.ocurrenciasEliminadas.length
          ? { ocurrenciaZoomId: { in: [...mov.ocurrenciasEliminadas] } }
          : {})
      },
      data: marcaEliminada
    });
    return;
  }
  if (mov.sinHorarioFijo) {
    // Cambió a instantánea o sin horario fijo: ya no ocupa la agenda.
    await db.reunionZoomObservada.updateMany({ where: vigente, data: marcaEliminada });
    return;
  }

  const existentes = await db.reunionZoomObservada.findMany({ where: clave });
  if (mov.ocurrencias.length === 0) {
    await aplicarCambiosSinHorario(db, existentes, mov, ahora);
    return;
  }

  const cuenta = await db.cuentaProveedor.findFirst({
    where: { externalAccountId: mov.anfitrionZoomId, proveedor: { tipo: "ZOOM" } },
    select: { id: true }
  });
  for (const o of mov.ocurrencias) {
    const previa = existentes.find(({ ocurrenciaZoomId }) => ocurrenciaZoomId === o.ocurrenciaZoomId);
    const duracion =
      o.duracionMin ??
      (previa ? (previa.finAt.getTime() - previa.inicioAt.getTime()) / 60_000 : DURACION_POR_DEFECTO_MIN);
    // Una ocurrencia que ya empezó se conserva como estaba; una que ya terminó ni se registra.
    if (previa ? previa.inicioAt <= ahora : o.inicio.getTime() + minutosAMs(duracion) <= ahora.getTime()) {
      continue;
    }
    const datos = {
      anfitrionZoomId: mov.anfitrionZoomId,
      cuentaProveedorId: cuenta?.id ?? previa?.cuentaProveedorId ?? null,
      tema: mov.tema ?? previa?.tema ?? "Reunión Zoom",
      inicioAt: o.inicio,
      finAt: new Date(o.inicio.getTime() + minutosAMs(duracion)),
      estado: "ACTIVA",
      origen: "WEBHOOK",
      observadaAt: ahora
    };
    await db.reunionZoomObservada.upsert({
      where: { cuentaZoomId_meetingId_ocurrenciaZoomId: { ...clave, ocurrenciaZoomId: o.ocurrenciaZoomId } },
      create: { ...clave, ocurrenciaZoomId: o.ocurrenciaZoomId, ...datos },
      update: datos
    });
  }
  await quitarOcurrenciasSobrantes(db, existentes, mov, ahora);
}

export type CuentaAgendaZoom = Readonly<{
  id: string;
  nombre: string;
  /** Usuario de Zoom a consultar (id o correo). */
  usuarioZoomId: string;
  /** Id de usuario de Zoom con el que llegan los webhooks (host_id). */
  anfitrionZoomId: string | null;
}>;

export type ResultadoSincronizacionAgendaZoom = Readonly<{
  cuenta: string;
  ok: boolean;
  reuniones: number;
  eliminadas: number;
}>;

/**
 * Pull completo: reemplaza lo que el espejo creía de cada cuenta por lo que Zoom informa ahora.
 * Si Zoom falla para una cuenta no se toca nada de esa cuenta (un error nunca es "agenda vacía").
 */
export async function sincronizarAgendaZoom(
  db: Db,
  entrada: Readonly<{
    cuentaZoomId: string;
    cuentas: readonly CuentaAgendaZoom[];
    listar: (usuarioZoomId: string) => Promise<readonly ReunionAgendaZoom[]>;
  }>,
  ahora = new Date()
): Promise<readonly ResultadoSincronizacionAgendaZoom[]> {
  const resultados: ResultadoSincronizacionAgendaZoom[] = [];
  for (const cuenta of entrada.cuentas) {
    let remotas: readonly ReunionAgendaZoom[];
    try {
      remotas = await entrada.listar(cuenta.usuarioZoomId);
    } catch {
      resultados.push({ cuenta: cuenta.nombre, ok: false, reuniones: 0, eliminadas: 0 });
      continue;
    }
    const anfitrion = cuenta.anfitrionZoomId ?? cuenta.usuarioZoomId;
    const vistas = new Set<string>();
    for (const reunion of remotas) {
      for (const o of reunion.ocurrencias) {
        const clave = {
          cuentaZoomId: entrada.cuentaZoomId,
          meetingId: reunion.meetingId,
          ocurrenciaZoomId: o.ocurrenciaZoomId
        };
        vistas.add(`${reunion.meetingId}|${o.ocurrenciaZoomId}`);
        // Lo que ya empezó (en curso o transcurrido) no se vuelve a escribir.
        if (o.inicio <= ahora) {
          continue;
        }
        const datos = {
          anfitrionZoomId: anfitrion,
          cuentaProveedorId: cuenta.id,
          tema: reunion.tema,
          inicioAt: o.inicio,
          finAt: new Date(o.inicio.getTime() + minutosAMs(o.duracionMin ?? DURACION_POR_DEFECTO_MIN)),
          estado: "ACTIVA",
          origen: "PULL",
          observadaAt: ahora
        };
        await db.reunionZoomObservada.upsert({
          where: { cuentaZoomId_meetingId_ocurrenciaZoomId: clave },
          create: { ...clave, ...datos },
          update: datos
        });
      }
    }
    const previas = await db.reunionZoomObservada.findMany({
      where: {
        cuentaZoomId: entrada.cuentaZoomId,
        estado: "ACTIVA",
        inicioAt: { gt: ahora },
        OR: [{ cuentaProveedorId: cuenta.id }, { anfitrionZoomId: anfitrion }]
      },
      select: { id: true, meetingId: true, ocurrenciaZoomId: true }
    });
    const sobrantes = previas
      .filter(({ meetingId, ocurrenciaZoomId }) => !vistas.has(`${meetingId}|${ocurrenciaZoomId}`))
      .map(({ id }) => id);
    if (sobrantes.length) {
      await db.reunionZoomObservada.updateMany({
        where: { id: { in: sobrantes } },
        data: { estado: "ELIMINADA", origen: "PULL", observadaAt: ahora }
      });
    }
    resultados.push({
      cuenta: cuenta.nombre,
      ok: true,
      reuniones: remotas.length,
      eliminadas: sobrantes.length
    });
  }
  return resultados;
}

/** Reuniones Zoom que la app conoce (creadas por ella); el resto de lo que hay en Zoom es externo. */
export async function idsReunionesZoomPropias(db: Db, ids: readonly string[]): Promise<ReadonlySet<string>> {
  if (ids.length === 0) {
    return new Set();
  }
  const eventos = await db.eventoProveedor.findMany({
    where: {
      proveedor: { tipo: "ZOOM" },
      OR: [{ codigoReunion: { in: [...ids] } }, { externalEventId: { in: [...ids] } }]
    },
    select: { codigoReunion: true, externalEventId: true }
  });
  return new Set(
    eventos.flatMap(({ codigoReunion, externalEventId }) =>
      [codigoReunion, externalEventId].filter((id): id is string => Boolean(id))
    )
  );
}

/**
 * Períodos ocupados en Zoom por reuniones que la app no creó, por cuenta anfitriona.
 * Alimenta la elección de sala para que una reunión nueva nunca se superponga con ellas.
 */
export async function reservasZoomExternas(
  db: Db,
  entrada: Readonly<{ cuentaIds: readonly string[]; desde: Date; hasta: Date }>,
  ahora = new Date()
): Promise<ReadonlyArray<Readonly<{ cuentaProveedorId: string; inicio: Date; fin: Date }>>> {
  const filas = await db.reunionZoomObservada.findMany({
    where: {
      // Ignorada solo oculta la diferencia del diagnóstico: Zoom sigue ocupado y la sala no se reasigna.
      estado: "ACTIVA",
      cuentaProveedorId: { in: [...entrada.cuentaIds] },
      inicioAt: { lt: entrada.hasta },
      finAt: { gt: entrada.desde > ahora ? entrada.desde : ahora }
    },
    select: { cuentaProveedorId: true, meetingId: true, inicioAt: true, finAt: true }
  });
  const propias = await idsReunionesZoomPropias(db, [...new Set(filas.map(({ meetingId }) => meetingId))]);
  return filas.flatMap(({ cuentaProveedorId, meetingId, inicioAt, finAt }) =>
    cuentaProveedorId && !propias.has(meetingId) ? [{ cuentaProveedorId, inicio: inicioAt, fin: finAt }] : []
  );
}

export async function leerInconsistenciasAgendaZoom(
  db: Db,
  reuniones: readonly ReunionZoomAuditable[],
  ahora = new Date()
) {
  const filas = await db.reunionZoomObservada.findMany({
    where: { finAt: { gt: ahora } },
    orderBy: { inicioAt: "asc" },
    take: 2000
  });
  const observadas: ObservadaAgendaZoom[] = filas.map((fila) => ({
    id: fila.id,
    meetingId: fila.meetingId,
    ocurrenciaZoomId: fila.ocurrenciaZoomId,
    cuentaProveedorId: fila.cuentaProveedorId,
    tema: fila.tema,
    inicio: fila.inicioAt,
    fin: fila.finAt,
    estado: fila.estado,
    ignoradaAt: fila.ignoradaAt
  }));
  const propios = await idsReunionesZoomPropias(db, [
    ...new Set(observadas.map(({ meetingId }) => meetingId))
  ]);
  return {
    ...detectarInconsistenciasAgendaZoom(observadas, reuniones, propios, ahora),
    ultimaObservacion: filas.reduce<Date | null>(
      (max, { observadaAt }) => (!max || observadaAt > max ? observadaAt : max),
      null
    )
  };
}
