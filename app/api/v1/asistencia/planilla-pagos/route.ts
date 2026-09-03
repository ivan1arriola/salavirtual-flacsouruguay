import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/src/lib/db";
import { obtenerFilasPlanillaPagos } from "@/src/modules/asistencia/planilla-pagos.adapter";
import { crearPlanillaPagos } from "@/src/modules/asistencia/planilla-pagos.xlsx";
import { periodoMesAnteriorUtc3 } from "@/src/modules/asistencia/reporte-mensual.domain";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMINISTRACION") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const periodo = periodoMesAnteriorUtc3(new Date());
  const filas = await obtenerFilasPlanillaPagos(db, periodo);
  const workbook = await crearPlanillaPagos(filas, periodo);
  const filename = `pagos-asistencia-tecnica-${periodo.clave}.xlsx`;

  return new NextResponse(new Uint8Array(workbook), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store"
    }
  });
}
