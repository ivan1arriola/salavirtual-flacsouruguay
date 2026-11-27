import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { crearProveedorTokenZoom } from "@/src/integrations/zoom/zoom-client";
import { errorPorRespuesta, pedirZoom, ZoomApiError } from "@/src/integrations/zoom/zoom-http";
import { descifrarConfiguracion } from "@/src/lib/config/encryption";
import { db } from "@/src/lib/db";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { obtenerCredencialesZoom } from "@/src/modules/configuracion/zoom-config.service";
import { seleccionarEventoProveedorActivo } from "@/src/modules/reuniones/evento-proveedor-activo.domain";
import { puedeGestionarPrograma } from "@/src/modules/reuniones/permisos-programa.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store, max-age=0" };

type RouteContext = Readonly<{ params: Promise<{ instanciaId: string }> }>;

async function consultarParticipantes(
  codigoReunion: string,
  authZoom: ReturnType<typeof crearProveedorTokenZoom>,
) {
  const participantes: { id: string; nombre: string; email: string | null }[] = [];
  const tokens = new Set<string>();
  let token = "";
  do {
    const url = new URL(
      `https://api.zoom.us/v2/metrics/meetings/${encodeURIComponent(codigoReunion)}/participants`,
    );
    url.searchParams.set("type", "live");
    url.searchParams.set("page_size", "300");
    if (token) {
      url.searchParams.set("next_page_token", token);
    }
    const response = await pedirZoom(authZoom, "participantes-vivos", (accessToken) =>
      fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" }),
    );
    if (!response.ok) {
      throw await errorPorRespuesta("participantes-vivos", response);
    }
    const body = (await response.json()) as {
      participants?: { id?: string; user_name?: string; name?: string; email?: string }[];
      next_page_token?: string;
    };
    for (const item of body.participants ?? []) {
      participantes.push({
        id: item.id ?? `${participantes.length}`,
        nombre: item.user_name ?? item.name ?? "Participante",
        email: item.email ?? null,
      });
    }
    token = body.next_page_token ?? "";
    if (token && tokens.has(token)) {
      throw new ZoomApiError("PAGINACION_REPETIDA", "participantes-vivos");
    }
    if (token) {
      tokens.add(token);
    }
  } while (token && tokens.size < 10);
  if (token) {
    throw new ZoomApiError("PAGINACION_REPETIDA", "participantes-vivos");
  }
  return participantes;
}

export async function GET(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401, headers });
  }
  const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
  if (!actor?.activo || (actor.rol !== "DOCENTE" && actor.rol !== "ADMINISTRACION")) {
    return NextResponse.json({ error: "Sin acceso" }, { status: 403, headers });
  }
  const { instanciaId } = await context.params;
  const instancia = await db.instanciaSala.findUnique({
    where: { id: instanciaId },
    select: {
      estado: true,
      proveedorActivoTipo: true,
      inicioProgramadoAt: true,
      finProgramadoAt: true,
      solicitud: { select: { docentePrograma: { select: { programaId: true } } } },
      eventosProveedor: { select: { proveedor: { select: { tipo: true } }, codigoReunion: true } },
    },
  });
  if (!instancia || instancia.estado === "CANCELADA") {
    return NextResponse.json({ error: "Clase no encontrada" }, { status: 404, headers });
  }
  if (!(await puedeGestionarPrograma(db, actor, instancia.solicitud.docentePrograma.programaId))) {
    return NextResponse.json({ error: "Sin acceso" }, { status: 403, headers });
  }
  const evento = seleccionarEventoProveedorActivo(instancia);
  if (evento?.proveedor.tipo !== "ZOOM" || !evento.codigoReunion) {
    return NextResponse.json(
      { estado: "NO_DISPONIBLE", motivo: "Esta clase no tiene una reunión de Zoom activa." },
      { headers },
    );
  }
  const ahora = Date.now();
  if (
    ahora < instancia.inicioProgramadoAt.getTime() ||
    ahora > instancia.finProgramadoAt.getTime() + 3600000
  ) {
    return NextResponse.json(
      {
        estado: "NO_DISPONIBLE",
        motivo: "La consulta en vivo está disponible durante el horario de la clase.",
      },
      { headers },
    );
  }
  const credenciales = await obtenerCredencialesZoom(db, descifrarConfiguracion);
  if (!credenciales.disponible) {
    return NextResponse.json(
      { estado: "NO_DISPONIBLE", motivo: "Zoom no está configurado." },
      { headers },
    );
  }
  const authZoom = crearProveedorTokenZoom(credenciales);
  try {
    const participantes = await consultarParticipantes(evento.codigoReunion, authZoom);
    return NextResponse.json(
      { estado: "DISPONIBLE", participantes, actualizadoAt: new Date().toISOString() },
      { headers },
    );
  } catch (error) {
    const motivo =
      error instanceof ZoomApiError && error.code === "CAPACIDAD_PENDIENTE"
        ? "La cuenta de Zoom necesita acceso al Dashboard y el permiso de lectura de participantes."
        : "No se pudieron consultar los participantes en vivo. Probá desde Zoom.";
    return NextResponse.json({ estado: "NO_DISPONIBLE", motivo }, { headers });
  }
}
