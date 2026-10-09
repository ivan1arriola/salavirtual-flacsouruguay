import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { descifrarConfiguracion } from "@/src/lib/config/encryption";
import { db } from "@/src/lib/db";
import { toHttpError, ForbiddenApiError, NotFoundApiError, IntegrationApiError } from "@/src/lib/http/api-error";
import { puedeGestionarPrograma } from "@/src/modules/reuniones/permisos-programa.service";
import { crearGoogleMeetAuthClient } from "@/src/integrations/google/auth";
import { listarMiembrosMeetHttp, obtenerEspacioMeet } from "@/src/integrations/google/meet";

type RouteContext = Readonly<{ params: Promise<{ solicitudId: string }> }>;
type Result = "confirmed" | "rejected" | "unknown";

export async function GET(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
    if (!actor?.activo) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { solicitudId } = await context.params;
    const request = await db.solicitudSala.findUnique({
      where: { id: solicitudId },
      select: { docenteProgramaId: true, titulo: true, createdAt: true, docentePrograma: { select: { programaId: true } } },
    });
    if (!request) throw new NotFoundApiError("La serie no existe.");
    if (!await puedeGestionarPrograma(db, actor, request.docentePrograma.programaId)) {
      throw new ForbiddenApiError("Sin permiso para verificar cohosts.");
    }
    const series = await db.solicitudSala.findMany({
      where: {
        docenteProgramaId: request.docenteProgramaId, titulo: request.titulo, createdAt: request.createdAt,
      },
      select: {
        instancias: {
          where: { estado: "PROGRAMADA", finProgramadoAt: { gt: new Date() } },
          orderBy: { inicioProgramadoAt: "asc" },
          select: {
            id: true,
            inicioProgramadoAt: true,
            cohosts: { select: { cuentaGoogle: { select: { email: true } } } },
            cohostEmails: { select: { email: true } },
            eventosProveedor: {
              where: { proveedor: { tipo: "GOOGLE_MEET" } },
              select: { codigoReunion: true, cuentaProveedor: { select: { emailOrganizador: true } } },
              take: 1,
            },
          },
        },
      },
    });
    const meetings = series.flatMap((item) => item.instancias);
    if (meetings.length > 100) {
      return NextResponse.json({ error: "La serie excede el límite de verificación. Contactá a administración." }, { status: 422 });
    }
    const config = await db.configuracionGoogleWorkspace.findUnique({
      where: { id: "principal", activa: true },
    });
    if (!config?.serviceAccountEmail || !config.privateKeyCifrada) {
      throw new IntegrationApiError("Google Workspace no está configurado.", 503);
    }
    const privateKey = descifrarConfiguracion(config.privateKeyCifrada);
    const memberCache = new Map<string, Set<string> | null>();
    const perEmail = new Map<string, {
      email: string; confirmed: number; rejected: number; unknown: number; total: number;
      meetings: { id: string; fecha: string; result: Result }[];
    }>();

    for (const meeting of meetings) {
      const event = meeting.eventosProveedor[0];
      const host = event?.cuentaProveedor?.emailOrganizador ?? "";
      const code = event?.codigoReunion ?? "";
      const emails = [...new Set([
        ...meeting.cohosts.map(({ cuentaGoogle }) => cuentaGoogle.email.toLowerCase()),
        ...meeting.cohostEmails.map(({ email }) => email.toLowerCase()),
      ])].filter((email) => email !== host.toLowerCase());
      if (!emails.length) continue;
      const cacheKey = host.toLowerCase() + "|" + code;
      if (!memberCache.has(cacheKey)) {
        if (!host || !code) {
          memberCache.set(cacheKey, null);
        } else {
          try {
            const client = crearGoogleMeetAuthClient({
              serviceAccountEmail: config.serviceAccountEmail, privateKey, subject: host,
            });
            const space = await obtenerEspacioMeet(client, code);
            if (!space.name) throw new Error("Espacio Meet no disponible.");
            const members = await listarMiembrosMeetHttp(client, space.name);
            memberCache.set(cacheKey, new Set(members
              .filter((member) => member.role === "COHOST" && typeof member.email === "string")
              .map((member) => member.email!.trim().toLowerCase())));
          } catch {
            // A failed read cannot prove someone is not a cohost.
            memberCache.set(cacheKey, null);
          }
        }
      }
      const members = memberCache.get(cacheKey) ?? null;
      for (const email of emails) {
        const entry = perEmail.get(email) ?? {
          email, confirmed: 0, rejected: 0, unknown: 0, total: 0,
          meetings: [] as { id: string; fecha: string; result: Result }[],
        };
        const result: Result = members === null ? "unknown" : members.has(email) ? "confirmed" : "rejected";
        entry.total++;
        entry[result === "confirmed" ? "confirmed" : result === "rejected" ? "rejected" : "unknown"]++;
        entry.meetings.push({ id: meeting.id, fecha: meeting.inicioProgramadoAt.toISOString(), result });
        perEmail.set(email, entry);
      }
    }
    return NextResponse.json({
      verifiedAt: new Date().toISOString(),
      meetings: meetings.length,
      entries: [...perEmail.values()].sort((a, b) => a.email.localeCompare(b.email)),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const mapped = toHttpError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
