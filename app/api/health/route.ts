import { NextResponse } from "next/server";

import { db } from "@/src/lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, app: "flacso-meet", database: "ok" });
  } catch {
    return NextResponse.json(
      { ok: false, app: "flacso-meet", database: "unavailable" },
      { status: 503 },
    );
  }
}
