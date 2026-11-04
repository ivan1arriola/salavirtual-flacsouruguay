import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { MigracionZoomSerieControl } from "@/src/components/migracion-zoom-serie-control";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { obtenerDiagnosticosSeriesZoom } from "@/src/modules/reuniones/diagnostico-serie-zoom.service";
import { obtenerVistaPreviaMigracionZoomPorSerie } from "@/src/modules/reuniones/migracion-zoom-serie.service";

export const dynamic = "force-dynamic";

export default async function MigracionZoomPage() {
  const session = await auth();
  if (session?.user?.role !== "ADMINISTRACION") redirect("/");
  const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
  if (!actor?.activo || actor.rol !== "ADMINISTRACION") redirect("/");
  const admin = { id: actor.id, rol: actor.rol };

  // Con un solo enlace por serie, la unidad de migración es la serie.
  const [vistaPrevia, diagnosticos] = await Promise.all([
    obtenerVistaPreviaMigracionZoomPorSerie(db, admin),
    obtenerDiagnosticosSeriesZoom(db, admin),
  ]);
  return <MigracionZoomSerieControl vistaPrevia={vistaPrevia} diagnosticos={Object.fromEntries(diagnosticos)} />;
}
