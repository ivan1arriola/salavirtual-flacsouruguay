import { NextResponse } from "next/server";
import { MobileActorError, requireMobileActor } from "@/src/lib/auth/mobile-actor.adapter";
import { getAdminSummary } from "@/src/modules/mobile-admin/queries.adapter";
import { db } from "@/src/lib/db";

export async function GET(request: Request) {
  try {
    await requireMobileActor(request, ["ADMINISTRACION"]);
    return NextResponse.json(await getAdminSummary(db));
  } catch (error) {
    if (error instanceof MobileActorError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
