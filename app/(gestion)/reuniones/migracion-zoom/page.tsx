import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { MigracionZoomAplicarControl } from "@/src/components/migracion-zoom-aplicar-control";
import { MigracionZoomSerieControl } from "@/src/components/migracion-zoom-serie-control";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { obtenerVistaPreviaMigracionZoom } from "@/src/modules/reuniones/migracion-zoom.service";
import { obtenerVistaPreviaMigracionZoomPorSerie } from "@/src/modules/reuniones/migracion-zoom-serie.service";
import { reunionCompartidaHabilitada } from "@/src/modules/reuniones/reunion-compartida.domain";

export const dynamic = "force-dynamic";

export default async function MigracionZoomPage() {
  const session = await auth();
  if (session?.user?.role !== "ADMINISTRACION") redirect("/");
  const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
  if (!actor?.activo || actor.rol !== "ADMINISTRACION") redirect("/");
  const admin = { id: actor.id, rol: actor.rol };

  // Con la bandera encendida la unidad de migración es la serie; apagada, todo sigue como antes.
  if (reunionCompartidaHabilitada(process.env)) {
    return <MigracionZoomSerieControl vistaPrevia={await obtenerVistaPreviaMigracionZoomPorSerie(db, admin)} />;
  }
  return <MigracionZoomAplicarControl vistaPrevia={await obtenerVistaPreviaMigracionZoom(db, admin)} />;
}
