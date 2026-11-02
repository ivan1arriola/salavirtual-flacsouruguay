import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { MigracionZoomAplicarControl } from "@/src/components/migracion-zoom-aplicar-control";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { obtenerVistaPreviaMigracionZoom } from "@/src/modules/reuniones/migracion-zoom.service";

export const dynamic = "force-dynamic";

export default async function MigracionZoomPage() {
  const session = await auth();
  if (session?.user?.role !== "ADMINISTRACION") redirect("/");
  const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
  if (!actor?.activo || actor.rol !== "ADMINISTRACION") redirect("/");

  const vistaPrevia = await obtenerVistaPreviaMigracionZoom(db, { id: actor.id, rol: actor.rol });

  return <MigracionZoomAplicarControl vistaPrevia={vistaPrevia} />;
}
