import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { puedeGestionarPrograma } from "@/src/modules/reuniones/permisos-programa.service";
import {
  elegirProveedorDetalle,
  proveedorActivoDeInstancia,
  resolverProveedorReunion,
} from "@/src/modules/reuniones/proveedor-reunion.domain";
import { construirFiltroSerieSolicitud } from "@/src/modules/reuniones/serie-reunion.domain";
import ReunionDetailPage from "./reunion-detail-page.server";
import ReunionZoomDetailPage from "./reunion-zoom-detail-page.server";

/**
 * Detalle de una reunión. Una serie migrada en parte se divide en dos paneles:
 * el de Meet con sus encuentros sin migrar y el de Zoom con los demás.
 */
export default async function ReunionDetallePage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ solicitudId: string }>;
  searchParams: Promise<{ proveedor?: string }>;
}>) {
  const session = await auth();
  if (!session?.user) {
    redirect("/acceso");
  }
  const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
  if (!actor?.activo) {
    redirect("/acceso");
  }

  const { solicitudId } = await params;
  const solicitud = await db.solicitudSala.findUnique({
    where: { id: solicitudId },
    include: { docentePrograma: { select: { programaId: true } } },
  });
  if (
    !solicitud ||
    !(await puedeGestionarPrograma(db, actor, solicitud.docentePrograma.programaId))
  ) {
    notFound();
  }

  const serie = await db.solicitudSala.findMany({
    where: construirFiltroSerieSolicitud(solicitud),
    select: {
      instancias: {
        select: {
          estado: true,
          inicioProgramadoAt: true,
          finProgramadoAt: true,
          proveedorActivoTipo: true,
          eventosProveedor: { select: { proveedor: { select: { tipo: true } } } },
        },
      },
    },
  });

  const { proveedor } = await searchParams;
  const { proveedor: elegido, otro } = elegirProveedorDetalle(
    serie.flatMap(({ instancias }) =>
      instancias.map((instancia) => ({
        estado: instancia.estado,
        inicioProgramadoAt: instancia.inicioProgramadoAt,
        finProgramadoAt: instancia.finProgramadoAt,
        proveedor: proveedorActivoDeInstancia(instancia),
      })),
    ),
    new Date(),
    resolverProveedorReunion(proveedor),
  );
  const otroProveedor = otro
    ? {
        ...otro,
        href: `/reuniones/${solicitudId}?proveedor=${otro.proveedor === "ZOOM" ? "zoom" : "meet"}`,
      }
    : null;

  return elegido === "ZOOM" ? (
    <ReunionZoomDetailPage params={params} otroProveedor={otroProveedor} />
  ) : (
    <ReunionDetailPage params={params} otroProveedor={otroProveedor} />
  );
}
