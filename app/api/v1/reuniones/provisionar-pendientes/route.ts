import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { toHttpError } from "@/src/lib/http/api-error";
import { obtenerServicioConferencias } from "@/src/bootstrap/conferencias.server";

export const runtime = "nodejs";

const revisionSchema = z.object({
  eventoProveedorId: z.string().min(1),
  operacion: z.enum(["PROVISIONAR", "REPROGRAMAR", "CONFIGURAR_MEET", "CANCELAR"]).optional(),
});

const eventoReintentable = {
  OR: [
    { proveedor: { tipo: "ZOOM" } },
    {
      proveedor: { tipo: "GOOGLE_MEET" },
      externalEventId: { not: null },
      instancia: { proveedorActivoTipo: "GOOGLE_MEET", conservarGoogleMeet: true },
    },
  ],
} satisfies Prisma.EventoProveedorWhereInput;

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMINISTRACION") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const actor = await resolveSessionActor(db, {
      id: session.user.id,
      email: session.user.email,
    });
    if (!actor?.activo || actor.rol !== "ADMINISTRACION") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const hasTargetPayload = Boolean(
      body && typeof body === "object" && !Array.isArray(body) && Object.keys(body).length > 0,
    );

    let targetIds: readonly string[] | null = null;

    if (hasTargetPayload) {
      const revision = revisionSchema.parse(body);
      const current = await db.eventoProveedor.findFirst({
        where: {
          id: revision.eventoProveedorId,
          ...eventoReintentable,
        },
        select: {
          id: true,
          estadoIntegracion: true,
          operacionPendiente: true,
        },
      });

      if (!current) {
        return NextResponse.json({ error: "El evento no admite este reintento." }, { status: 404 });
      }

      if (!current.operacionPendiente) {
        if (!revision.operacion) {
          return NextResponse.json(
            { error: "El evento no tiene una operación pendiente para reintentar." },
            { status: 409 },
          );
        }
        const puedeReconfigurar = revision.operacion === "CONFIGURAR_MEET";
        if (
          current.estadoIntegracion !== "PENDIENTE" &&
          current.estadoIntegracion !== "ERROR" &&
          !puedeReconfigurar
        ) {
          return NextResponse.json({ error: "El evento no requiere reparación." }, { status: 409 });
        }

        const validStates = puedeReconfigurar
          ? (["PENDIENTE", "ERROR", "SINCRONIZADA"] as const)
          : (["PENDIENTE", "ERROR"] as const);

        const assigned = await db.eventoProveedor.updateMany({
          where: {
            id: revision.eventoProveedorId,
            ...eventoReintentable,
            operacionPendiente: null,
            estadoIntegracion: { in: [...validStates] },
          },
          data: {
            operacionPendiente: revision.operacion,
            estadoIntegracion: "PENDIENTE",
            reclamoIntegracionAt: null,
            reclamoIntegracionToken: null,
            errorIntegracion: null,
          },
        });
        if (assigned.count !== 1) {
          return NextResponse.json(
            { error: "El evento cambió mientras se intentaba preparar la reparación." },
            { status: 409 },
          );
        }
      }

      targetIds = [revision.eventoProveedorId];
    }

    const ids =
      targetIds ??
      (
        await db.eventoProveedor.findMany({
          where: {
            ...eventoReintentable,
            operacionPendiente: { not: null },
          },
          select: { id: true },
        })
      ).map(({ id }) => id);

    const results = await obtenerServicioConferencias().sincronizarEventosPendientes(ids);
    const payload = {
      procesadas: results.length,
      sincronizadas: results.filter(({ estado }) => estado === "SINCRONIZADA").length,
      enProceso: results.filter(({ estado }) => estado === "EN_PROCESO").length,
      pendientesConfiguracion: results.filter(({ estado }) => estado === "PENDIENTE_CONFIGURACION")
        .length,
      requierenRevision: results.filter(({ estado }) => estado === "REQUIERE_REVISION").length,
      errores: results.filter(({ estado }) => estado === "ERROR").length,
      resultados: results,
    };
    const pending = results.some(({ estado }) => estado !== "SINCRONIZADA");
    return NextResponse.json(payload, { status: pending ? 202 : 200 });
  } catch (error) {
    const mapped = toHttpError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
