import { NextResponse } from "next/server";
import { db } from "@/src/lib/db";
import { descifrarConfiguracion } from "@/src/lib/config/encryption";
import { obtenerCredencialesWorkspaceActivas } from "@/src/modules/configuracion/api";
import { enviarCorreoConfigurado } from "@/src/modules/configuracion/correo.service";
import { consultarCohostsEspacioMeet } from "@/src/modules/conferencias/api";
import { procesarRecordatorios24h } from "@/src/modules/reuniones/recordatorios-24h.service";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || request.headers.get("authorization") !== "Bearer " + secreto) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Se resuelven credenciales una vez por ejecución. En caso de falta de acceso,
  // jamás se presentan como verificados los coanfitriones configurados localmente.
  let credenciales: Awaited<ReturnType<typeof obtenerCredencialesWorkspaceActivas>> | null = null;
  try {
    credenciales = await obtenerCredencialesWorkspaceActivas(db, descifrarConfiguracion);
  } catch {
    console.warn("Recordatorios: no se pudieron cargar credenciales Meet para verificar coanfitriones.");
  }

  try {
    const resultado = await procesarRecordatorios24h(db, {
      verificarCohosts: async (organizador, codigoReunion) => {
        if (!credenciales?.principal) {
          return null;
        }
        const candidatos = [
          {
            serviceAccountEmail: credenciales.principal.serviceAccountEmail,
            privateKey: credenciales.principal.privateKey,
            subject: organizador,
            origen: "PRINCIPAL" as const
          },
          ...credenciales.legacy.map((legacy) => ({
            serviceAccountEmail: legacy.serviceAccountEmail,
            privateKey: legacy.privateKey,
            subject: organizador,
            origen: "LEGACY" as const
          }))
        ];
        const resultadoMeet = await consultarCohostsEspacioMeet(candidatos, codigoReunion);
        return resultadoMeet.cohosts;
      },
      enviarCorreo: (input) => enviarCorreoConfigurado(db, input)
    });
    return NextResponse.json(resultado, {
      status: resultado.errores ? 502 : 200,
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    console.error(
      "Error al procesar recordatorios de reunión:",
      error instanceof Error ? error.name : "Error"
    );
    return NextResponse.json({ error: "No fue posible procesar los recordatorios." }, { status: 500 });
  }
}
