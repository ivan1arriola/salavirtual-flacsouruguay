import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { OtroProveedorAviso } from "@/src/components/proveedor-tabs";
import { puedeVerEnlaceAnfitrion } from "@/src/modules/reuniones/enlace-anfitrion.domain";
import { proveedorActivoDeInstancia, type ProveedorReunion } from "@/src/modules/reuniones/proveedor-reunion.domain";
import { puedeGestionarEncuentros } from "@/src/modules/reuniones/encuentros.domain";
import { resumenEnlaceZoom } from "@/src/modules/reuniones/estado-enlace-zoom.domain";
import { seleccionarEventoProveedorActivo } from "@/src/modules/reuniones/evento-proveedor-activo.domain";
import { puedeGestionarPrograma } from "@/src/modules/reuniones/permisos-programa.service";
import { construirFiltroSerieSolicitud } from "@/src/modules/reuniones/serie-reunion.domain";
import { ReunionZoomEncuentros } from "@/src/modules/reuniones/presentation/components/reunion-zoom-encuentros";

export default async function ReunionZoomDetailPage({
  params,
  otroProveedor = null
}: Readonly<{
  params: Promise<{ solicitudId: string }>;
  /** Encuentros de la misma serie que siguen en el otro proveedor: viven en su propio panel. */
  otroProveedor?: Readonly<{ proveedor: ProveedorReunion; cantidad: number; href: string }> | null;
}>) {
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
  const puedeModificar = puedeGestionarEncuentros(actor.rol, actor.id, docente.id);
  const esAdmin = actor.rol === "ADMINISTRACION";

  const encuentros = serie.flatMap(({ id, instancias }) => {
    // El servidor exige conservar al menos un encuentro por solicitud.
    const activos = instancias.filter(({ estado }) => estado !== "CANCELADA").length;
    return instancias.filter((instancia) => proveedorActivoDeInstancia(instancia) === "ZOOM").map((instancia) => {
    const enlace = resumenEnlaceZoom(instancia);
    const activo = seleccionarEventoProveedorActivo(instancia);
    const puedeUnirse = instancia.estado === "PROGRAMADA" && instancia.finProgramadoAt > ahora;
    return {
      id: instancia.id,
      solicitudId: id,
      inicioIso: instancia.inicioProgramadoAt.toISOString(),
      finIso: instancia.finProgramadoAt.toISOString(),
      descripcion: instancia.descripcion ?? null,
      estado: instancia.estado,
      editable: instancia.estado === "PROGRAMADA" && instancia.inicioProgramadoAt > ahora,
      puedeCancelar: instancia.estado === "PROGRAMADA" && instancia.inicioProgramadoAt > ahora && activos > 1,
      puedeUnirse,
      joinUrl: enlace.joinUrl,
      zoomMeetingId: activo?.proveedor.tipo === "ZOOM" ? (activo.codigoReunion ?? activo.externalEventId ?? null) : null,
      puedeIniciar: puedeUnirse && verAnfitrion && activo?.proveedor.tipo === "ZOOM",
      estadoEnlace: enlace.estado,
      eventoProveedorId: enlace.eventoProveedorId,
      operacion: enlace.operacion
    };
    });
  }).sort((a, b) => a.inicioIso.localeCompare(b.inicioIso));

  return (
    <div className="meeting-detail-v2">
      <Link className="meeting-detail-back" href="/reuniones?proveedor=zoom">
        <ArrowLeft size={15} aria-hidden="true" />Volver a reuniones
      </Link>
      {otroProveedor ? <OtroProveedorAviso {...otroProveedor} /> : null}
      <header>
        <p className="page-eyebrow">{solicitud.docentePrograma.programa.nombre}</p>
        <h1>{solicitud.titulo}</h1>
        <p>{[docente.nombres, docente.apellidos].filter(Boolean).join(" ")}</p>
        {solicitud.descripcion ? <p>{solicitud.descripcion}</p> : null}
      </header>
      <ReunionZoomEncuentros
        encuentros={encuentros}
        esAdmin={esAdmin}
        puedeModificar={puedeModificar}
        permiteCancelarSerie={!otroProveedor}
        solicitudIds={serie.map(({ id }) => id)}
      />
    </div>
  );
}
