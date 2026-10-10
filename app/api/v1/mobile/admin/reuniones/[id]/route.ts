import { NextResponse } from "next/server";
import { MobileActorError, requireMobileActor } from "@/src/lib/auth/mobile-actor.adapter";
import { getAdminMeeting } from "@/src/modules/mobile-admin/queries.adapter";
import { db } from "@/src/lib/db";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireMobileActor(request, ["ADMINISTRACION"]);
    const { id } = await context.params;
    if (!id || id.length > 128) return NextResponse.json({ error: "Identificador inválido." }, { status: 400 });
    const meeting = await getAdminMeeting(db, id);
    if (!meeting) return NextResponse.json({ error: "Encuentro no encontrado." }, { status: 404 });
    return NextResponse.json({ meeting });
  } catch (error) {
    if (error instanceof MobileActorError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
