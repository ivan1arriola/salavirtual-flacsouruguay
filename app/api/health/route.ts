import { NextResponse } from "next/server";

const HEALTH_STATUS = Object.freeze({
  ok: true,
  app: "gestor-flacso-google-meet"
});

export function GET() {
  return NextResponse.json(HEALTH_STATUS);
}
