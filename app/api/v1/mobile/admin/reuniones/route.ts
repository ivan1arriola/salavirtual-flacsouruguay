import { NextResponse } from "next/server";
import { MobileActorError, requireMobileActor } from "@/src/lib/auth/mobile-actor.adapter";
import { listAdminMeetings } from "@/src/modules/mobile-admin/queries.adapter";
import { db } from "@/src/lib/db";

export async function GET(request: Request) {
  try {
    await requireMobileActor(request, ["ADMINISTRACION"]);
    const url = new URL(request.url);
    const today = new Date();
    const from =
      url.searchParams.get("from") ?? new Date(today.getTime() - 7 * 24 * 3600_000).toISOString();
    const to =
      url.searchParams.get("to") ?? new Date(today.getTime() + 90 * 24 * 3600_000).toISOString();
    const limitParam = url.searchParams.get("limit");
    const limit = limitParam === null ? 40 : Number(limitParam);
    const page = await listAdminMeetings(db, {
      from,
      to,
      q: url.searchParams.get("q") || undefined,
      programId: url.searchParams.get("programId") || undefined,
      state: url.searchParams.get("state") || undefined,
      coverage: (url.searchParams.get("coverage") || undefined) as
        "assigned" | "unassigned" | undefined,
      cursor: url.searchParams.get("cursor") || undefined,
      limit,
    });
    return NextResponse.json(page);
  } catch (error) {
    if (error instanceof MobileActorError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof Error && /^(from|to|limit|state|coverage|cursor)\b/.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
