import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { ZoomPermisosError } from "@/src/integrations/zoom/zoom-grupos-client";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { descifrarConfiguracion } from "@/src/lib/config/encryption";
import { db } from "@/src/lib/db";
import {
  elegirGrupoZoom,
  listarGruposZoom,
  sincronizarCuentasZoomConGrupo
} from "@/src/modules/configuracion/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const ERROR_GRUPOS = "No se pudo obtener la lista de grupos de Zoom. Revisá la conexión con Zoom y probá de nuevo.";
const ERROR_GUARDAR = "No se pudo guardar el grupo de Zoom. Probá de nuevo.";
const ERROR_SINCRONIZAR = "No se pudo sincronizar con el grupo de Zoom. Probá de nuevo más tarde.";
const GRUPO_INVALIDO = "Elegí un grupo de Zoom válido.";

const grupoSchema = z.object(
  {
    grupoId: z.string({ error: GRUPO_INVALIDO }).trim().min(1, GRUPO_INVALIDO).max(200, GRUPO_INVALIDO),
    grupoNombre: z
      .string({ error: "El nombre del grupo de Zoom es obligatorio." })
      .trim()
      .min(1, "El nombre del grupo de Zoom es obligatorio.")
      .max(200, "El nombre del grupo de Zoom es demasiado largo.")
  },
  { error: GRUPO_INVALIDO }
);

export async function GET() {
  const actor = await requireAdmin();
  if (actor instanceof NextResponse) return actor;

  try {
    const grupos = await listarGruposZoom(db, descifrarConfiguracion);
    return NextResponse.json({ grupos });
  } catch (error) {
    if (error instanceof ZoomPermisosError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    console.error("[zoom] No se pudo listar los grupos de Zoom", error);
    return NextResponse.json({ error: ERROR_GRUPOS }, { status: 502 });
  }
}

export async function PUT(request: Request) {
  const actor = await requireAdmin();
  if (actor instanceof NextResponse) return actor;

  const parsed = grupoSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? GRUPO_INVALIDO }, { status: 400 });
  }

  try {
    const { grupoId, grupoNombre } = parsed.data;
    await elegirGrupoZoom(db, { grupoId, grupoNombre, actorId: actor.id });
    return NextResponse.json({ grupoId, grupoNombre, message: `Grupo de Zoom «${grupoNombre}» guardado.` });
  } catch (error) {
    console.error("[zoom] No se pudo guardar el grupo de Zoom elegido", error);
    return NextResponse.json({ error: ERROR_GUARDAR }, { status: 500 });
  }
}

/** Sincronización a pedido (botón): el resultado viaja en `ok`, también cuando no se pudo sincronizar. */
export async function POST() {
  const actor = await requireAdmin();
  if (actor instanceof NextResponse) return actor;

  try {
    const { ok, resumen } = await sincronizarCuentasZoomConGrupo(db, descifrarConfiguracion, new Date());
    return NextResponse.json({ ok, resumen });
  } catch (error) {
    console.error("[zoom] Falló la sincronización a pedido de las cuentas Zoom", error);
    return NextResponse.json({ ok: false, resumen: ERROR_SINCRONIZAR }, { status: 502 });
  }
}

async function requireAdmin(): Promise<{ id: string } | NextResponse> {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMINISTRACION") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
  if (!actor?.activo || actor.rol !== "ADMINISTRACION") {
    return NextResponse.json({ error: "La sesión está desactualizada. Volvé a iniciar sesión." }, { status: 401 });
  }
  return { id: actor.id };
}
