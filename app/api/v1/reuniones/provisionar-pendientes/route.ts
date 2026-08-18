import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { descifrarConfiguracion } from "@/src/lib/config/encryption";
import { db } from "@/src/lib/db";
import { toHttpError } from "@/src/lib/http/api-error";
import { crearGoogleCalendarProvider } from "@/src/modules/meet/google-calendar.adapter";
import { sincronizarEventosPendientes } from "@/src/modules/meet/provisionar-eventos.service";

export const runtime = "nodejs";

const revisionSchema = z.object({
  eventoProveedorId: z.string().min(1),
  operacion: z.enum(["PROVISIONAR", "REPROGRAMAR", "CONFIGURAR_MEET", "CANCELAR"]).optional(),
});

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
    let targetIds: readonly string[] | null = null;

    if (body !== null) {
      const revision = revisionSchema.parse(body);
      const current = await db.eventoProveedor.findFirst({
        where: {
          id: revision.eventoProveedorId,
          proveedor: { tipo: "GOOGLE_MEET" },
        },
        select: {
          id: true,
          estadoIntegracion: true,
          operacionPendiente: true,
        },
      });

      if (!current) {
        return NextResponse.json({ error: "El evento Meet no existe." }, { status: 404 });
      }

      if (!current.operacionPendiente) {
        if (!revision.operacion) {
          return NextResponse.json(
            { error: "El evento no tiene una operación pendiente para reintentar." },
            { status: 409 },
          );
        }
        if (!(["PENDIENTE", "ERROR"] as const).includes(current.estadoIntegracion as "PENDIENTE" | "ERROR")) {
          return NextResponse.json(
            { error: "El evento no requiere reparación." },
            { status: 409 },
          );
        }

        const assigned = await db.eventoProveedor.updateMany({
          where: {
            id: revision.eventoProveedorId,
            proveedor: { tipo: "GOOGLE_MEET" },
            operacionPendiente: null,
            estadoIntegracion: { in: ["PENDIENTE", "ERROR"] },
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

    const ids = targetIds ?? (await db.eventoProveedor.findMany({
      where: {
        proveedor: { tipo: "GOOGLE_MEET" },
        operacionPendiente: { not: null },
      },
      select: { id: true },
    })).map(({ id }) => id);

    const results = await sincronizarEventosPendientes(
      { db, descifrar: descifrarConfiguracion, crearProvider: crearGoogleCalendarProvider },
      ids,
    );
    const payload = {
      procesadas: results.length,
      sincronizadas: results.filter(({ estado }) => estado === "SINCRONIZADA").length,
      enProceso: results.filter(({ estado }) => estado === "EN_PROCESO").length,
      pendientesConfiguracion: results.filter(({ estado }) => estado === "PENDIENTE_CONFIGURACION").length,
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
