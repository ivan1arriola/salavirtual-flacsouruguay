import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { puedeVerEnlaceAnfitrion } from "@/src/modules/reuniones/enlace-anfitrion.domain";
import { resumenEnlaceZoom } from "@/src/modules/reuniones/estado-enlace-zoom.domain";
import { seleccionarEventoProveedorActivo } from "@/src/modules/reuniones/evento-proveedor-activo.domain";
import { puedeGestionarPrograma } from "@/src/modules/reuniones/permisos-programa.service";
import { construirFiltroSerieSolicitud } from "@/src/modules/reuniones/serie-reunion.domain";
import { ReunionZoomEncuentros } from "@/src/modules/reuniones/presentation/components/reunion-zoom-encuentros";

export default async function ReunionZoomDetailPage({
  params
}: Readonly<{ params: Promise<{ solicitudId: string }> }>) {
  const session = await auth();
  if (!session?.user) redirect("/acceso");
  const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
  if (!actor?.activo) redirect("/acceso");

  const { solicitudId } = await params;
  const solicitud = await db.solicitudSala.findUnique({
    where: { id: solicitudId },
    include: {
      docentePrograma: { include: { programa: true, docente: { include: { usuario: true } } } }
    }
  });
  if (!solicitud || !await puedeGestionarPrograma(db, actor, solicitud.docentePrograma.programaId)) notFound();

  const serie = await db.solicitudSala.findMany({
    where: construirFiltroSerieSolicitud(solicitud),
    orderBy: { id: "asc" },
    select: {
      id: true,
      instancias: {
        orderBy: { inicioProgramadoAt: "asc" },
        include: { eventosProveedor: { include: { proveedor: true } } }
      }
    }
  });

  const ahora = new Date();
  const docente = solicitud.docentePrograma.docente.usuario;
  const verAnfitrion = puedeVerEnlaceAnfitrion(actor, docente.id);
  const esAdmin = actor.rol === "ADMINISTRACION";

  const encuentros = serie.flatMap(({ id, instancias }) => instancias.map((instancia) => {
    const enlace = resumenEnlaceZoom(instancia);
    const activo = seleccionarEventoProveedorActivo(instancia);
    return {
      id: instancia.id,
      solicitudId: id,
      inicioIso: instancia.inicioProgramadoAt.toISOString(),
      finIso: instancia.finProgramadoAt.toISOString(),
      descripcion: instancia.descripcion ?? null,
      estado: instancia.estado,
      editable: instancia.estado === "PROGRAMADA" && instancia.inicioProgramadoAt > ahora,
      joinUrl: enlace.joinUrl,
      hostUrl: verAnfitrion && activo?.proveedor.tipo === "ZOOM" ? activo.hostUrl : null,
      estadoEnlace: enlace.estado,
      eventoProveedorId: enlace.eventoProveedorId,
      operacion: enlace.operacion
    };
  }));

  return (
    <div className="meeting-detail-v2">
      <Link className="meeting-detail-back" href="/reuniones">
        <ArrowLeft size={15} aria-hidden="true" />Volver a reuniones
      </Link>
      <header>
        <p className="page-eyebrow">{solicitud.docentePrograma.programa.nombre}</p>
        <h1>{solicitud.titulo}</h1>
        <p>{[docente.nombres, docente.apellidos].filter(Boolean).join(" ")}</p>
        {solicitud.descripcion ? <p>{solicitud.descripcion}</p> : null}
      </header>
      <ReunionZoomEncuentros
        encuentros={encuentros}
        esAdmin={esAdmin}
        solicitudIds={serie.map(({ id }) => id)}
      />
    </div>
  );
}
