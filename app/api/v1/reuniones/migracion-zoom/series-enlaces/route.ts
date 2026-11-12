import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { toHttpError } from "@/src/lib/http/api-error";
import { crearDependenciasCorreccionSerie } from "@/src/bootstrap/migracion-zoom.server";
import { planificarCorreccionSerie } from "@/src/modules/reuniones/corregir-serie-enlaces.domain";
import { CUENTA_ZOOM_ASIGNABLE } from "@/src/modules/reuniones/cuenta-asignable.domain";
import {
  corregirSeriesEnlaces,
  limpiarReunionesAntiguas,
  MAXIMO_LOTE_CORRECCION_SERIE
} from "@/src/modules/reuniones/corregir-serie-enlaces.service";
import { MARGEN_SEGURIDAD_HORAS_APLICAR } from "@/src/modules/reuniones/migracion-zoom-aplicar.service";
import { detectarSeriesConEnlacesDistintos } from "@/src/modules/reuniones/series-enlaces-distintos.service";

export const runtime = "nodejs";
export const maxDuration = 300;

// Corregir una serie crea una reunión compartida, así que solo debe usarse con el worker que ya
// soporta reuniones compartidas (sin versiones anteriores en ejecución).
const bodySchema = z.union([
  z.object({
    modo: z.enum(["PILOTO", "LOTE"]),
    serieClaves: z.array(z.string().min(1)).min(1).max(MAXIMO_LOTE_CORRECCION_SERIE)
  }),
  z.object({ accion: z.literal("LIMPIAR") })
]);

async function actorAdministracion() {
  const session = await auth();
  if (!session?.user) {
    return null;
  }
  const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
  return actor?.activo ? { id: actor.id, rol: actor.rol } : null;
}

/** Series con enlaces o cuentas distintas y su plan de corrección. Solo lectura; solo Administración. */
export async function GET() {
  try {
    const actor = await actorAdministracion();
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const series = await detectarSeriesConEnlacesDistintos(db, actor);
    const planes = await vistaPreviaPlanes(series);
    return NextResponse.json({ series, planes }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const mapped = toHttpError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}

/** Corrige series (piloto de una o lote de hasta 5) o limpia las reuniones antiguas vencidas. Solo Administración. */
export async function POST(request: Request) {
  try {
    const actor = await actorAdministracion();
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const input = bodySchema.parse(await request.json().catch(() => null));
    const deps = crearDependenciasCorreccionSerie();
    if ("accion" in input) {
      const limpieza = await limpiarReunionesAntiguas(deps, actor);
      return NextResponse.json({ limpieza }, { headers: { "Cache-Control": "no-store" } });
    }
    const resultados = await corregirSeriesEnlaces(deps, actor, input);
    return NextResponse.json({ resultados }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const mapped = toHttpError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}

/** Plan de cada serie detectada (host propuesto y estado) sin escribir nada. */
async function vistaPreviaPlanes(series: Awaited<ReturnType<typeof detectarSeriesConEnlacesDistintos>>) {
  const hosts = await db.cuentaProveedor.findMany({
    where: { ...CUENTA_ZOOM_ASIGNABLE, proveedor: { tipo: "ZOOM" } },
    orderBy: [{ prioridad: "asc" }, { id: "asc" }],
    select: { id: true, prioridad: true, limiteConcurrente: true }
  });
  const ahora = new Date();
  const reservas = await db.eventoProveedor.findMany({
    where: {
      proveedor: { tipo: "ZOOM" },
      cuentaProveedorId: { not: null },
      instancia: { estado: { in: ["PROGRAMADA", "EN_CURSO"] }, finProgramadoAt: { gt: ahora } }
    },
    select: {
      cuentaProveedorId: true,
      instanciaSalaId: true,
      instancia: { select: { inicioProgramadoAt: true, finProgramadoAt: true } }
    }
  });
  const reservasZoom = reservas.flatMap(({ cuentaProveedorId, instanciaSalaId, instancia }) =>
    cuentaProveedorId
      ? [
          {
            cuentaProveedorId,
            inicio: instancia.inicioProgramadoAt,
            fin: instancia.finProgramadoAt,
            instanciaId: instanciaSalaId
          }
        ]
      : []
  );
  const fines = await db.instanciaSala.findMany({
    where: {
      id: { in: series.flatMap(({ encuentros }) => encuentros.map(({ instanciaId }) => instanciaId)) }
    },
    select: { id: true, finProgramadoAt: true }
  });
  const finPorId = new Map(fines.map(({ id, finProgramadoAt }) => [id, finProgramadoAt]));
  // La vista previa no lee Calendar: `encuentrosSinCalendar` solo es fiable al aplicar, así que no se informa.
  return Object.fromEntries(
    series.map((serie) => {
      const { encuentrosSinCalendar: _sinCalendar, ...plan } = planificarCorreccionSerie({
        ahora,
        margenSeguridadHoras: MARGEN_SEGURIDAD_HORAS_APLICAR,
        encuentros: serie.encuentros.map((encuentro) => ({
          instanciaId: encuentro.instanciaId,
          inicio: encuentro.inicio,
          fin: finPorId.get(encuentro.instanciaId) ?? encuentro.inicio,
          joinUrl: encuentro.joinUrl,
          externalEventId: encuentro.externalEventId,
          cuentaProveedorId: encuentro.cuentaProveedorId,
          calendarId: null,
          calendarEventId: null
        })),
        hosts,
        reservasZoom
      });
      return [serie.serieClave, plan];
    })
  );
}
