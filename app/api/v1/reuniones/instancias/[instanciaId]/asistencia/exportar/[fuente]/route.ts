import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/src/lib/db";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { descifrarConfiguracion } from "@/src/lib/config/encryption";
import { crearGoogleAuthJwt } from "@/src/integrations/google";
import { crearArchivosRepository } from "@/src/bootstrap/archivos.server";
import { puedeGestionarPrograma } from "@/src/modules/reuniones/permisos-programa.service";
import {
  seleccionarRegistrosBrutos,
  serializarExportacionCsv,
  serializarExportacionJson,
  type FuenteExportacionAsistencia
} from "@/src/modules/archivos/domain/attendance-raw-export.domain";
import { leerPlanillaAsistenciaGoogle } from "@/src/modules/archivos/infrastructure/google/google-attendance-sheet-reader.client";
import { FILTRO_PROVEEDOR_OPERATIVO } from "@/src/modules/conferencias/proveedores";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = Readonly<{ params: Promise<{ instanciaId: string; fuente: string }> }>;
const NO_CACHE = { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" };

function errorJson(mensaje: string, status: number) {
  return NextResponse.json({ error: mensaje }, { status, headers: NO_CACHE });
}

export async function GET(request: Request, { params }: Context) {
  const session = await auth();
  if (!session?.user) return errorJson("Sin sesión", 401);
  const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
  if (!actor?.activo) return errorJson("Acceso denegado", 403);

  const { instanciaId, fuente: rawFuente } = await params;
  if (rawFuente !== "meet" && rawFuente !== "reports") return errorJson("Fuente inválida", 400);
  const fuente: FuenteExportacionAsistencia = rawFuente;
  const url = new URL(request.url);
  const formato = url.searchParams.get("formato") ?? "csv";
  if (formato !== "csv" && formato !== "json") return errorJson("Formato inválido", 400);

  const instancia = await db.instanciaSala.findUnique({
    where: { id: instanciaId },
    select: {
      inicioProgramadoAt: true,
      finProgramadoAt: true,
      solicitud: { select: { docentePrograma: { select: { programaId: true } } } },
      eventosProveedor: {
        where: { proveedor: FILTRO_PROVEEDOR_OPERATIVO },
        take: 1,
        select: {
          codigoReunion: true,
          cuentaProveedor: { select: { emailOrganizador: true } },
          archivos: {
            where: { tipo: "LISTA_ASISTENCIA" }, take: 1,
            select: { driveFileId: true, mimeType: true }
          }
        }
      }
    }
  });

  if (!instancia || !await puedeGestionarPrograma(db, actor, instancia.solicitud.docentePrograma.programaId)) {
    // Igual que la ficha: no revelar ni la existencia de reuniones ajenas.
    return errorJson("Encuentro no encontrado", 404);
  }
  const evento = instancia.eventosProveedor[0];
  const archivo = evento?.archivos[0];
  if (!archivo?.driveFileId || archivo.mimeType !== "application/vnd.google-apps.spreadsheet") {
    return errorJson("No existe una planilla de asistencia sincronizada para este encuentro.", 404);
  }
  try {
    const configuracion = await crearArchivosRepository().obtenerConfiguracionWorkspacePrincipal();
    const subject = evento?.cuentaProveedor?.emailOrganizador?.trim();
    if (!configuracion?.activa || !configuracion.serviceAccountEmail || !configuracion.privateKeyCifrada || !subject) {
      return errorJson("No están disponibles las credenciales de Google Sheets.", 503);
    }
    const jwt = crearGoogleAuthJwt({
      serviceAccountEmail: configuracion.serviceAccountEmail,
      privateKey: descifrarConfiguracion(configuracion.privateKeyCifrada),
      subject
    }, ["https://www.googleapis.com/auth/spreadsheets"]);

    // Se obtiene la planilla registrada para esta instancia, sin confiar en un
    // spreadsheetId suministrado por el navegador y sin filtrar por participante.
    const datos = await leerPlanillaAsistenciaGoogle(jwt, archivo.driveFileId);
    const registros = seleccionarRegistrosBrutos(datos.datosBrutos, fuente);
    if (registros.registros.length === 0) {
      return errorJson(`La planilla aún no contiene registros brutos de ${fuente === "meet" ? "Meet" : "Reports"}. Esto no demuestra ausencia de asistentes.`, 409);
    }

    const dateParts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/Montevideo", day: "2-digit", month: "2-digit", year: "numeric"
    }).formatToParts(instancia.inicioProgramadoAt);
    const value = (type: "day" | "month" | "year") => dateParts.find(p => p.type === type)?.value ?? "00";
    const fecha = `${value("year")}${value("month")}${value("day")}`;
    const safeId = instanciaId.replace(/[^a-zA-Z0-9_-]/g, "");
    const filename = `asistencia_${fecha}_${safeId}_${fuente}.${formato}`;

    const body = formato === "csv"
      ? serializarExportacionCsv(registros)
      : serializarExportacionJson(registros, {
          instanciaId,
          codigoMeet: evento?.codigoReunion ?? null,
          inicioProgramadoAt: instancia.inicioProgramadoAt.toISOString(),
          finProgramadoAt: instancia.finProgramadoAt.toISOString(),
          exportadoAt: new Date().toISOString()
        });
    return new Response(body, {
      status: 200,
      headers: {
        ...NO_CACHE,
        "Content-Type": formato === "csv" ? "text/csv; charset=utf-8" : "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`
      }
    });
  } catch {
    // No exponer errores de Google ni parámetros que puedan contener datos personales.
    return errorJson("No se pudieron recuperar los datos de la planilla. Intentá nuevamente.", 502);
  }
}
