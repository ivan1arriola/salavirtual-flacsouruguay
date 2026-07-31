import { ArrowLeft, Video } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { formatDateTime } from "@/src/lib/ui/format";
import { buscarGrabacionVisible } from "@/src/modules/meet/grabaciones.adapter";

export default async function ReproducirGrabacionPage({
  params
}: Readonly<{ params: Promise<{ archivoId: string }> }>) {
  const session = await auth();
  if (!session?.user) redirect("/acceso");
  const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
  if (!actor?.activo) redirect("/acceso");
  const { archivoId } = await params;
  const recording = await buscarGrabacionVisible(db, actor, archivoId);
  if (!recording) notFound();

  const meeting = recording.eventoProveedor.instancia;
  const association = meeting.solicitud.docentePrograma;
  return (
    <>
      <Link className="text-link recording-back" href="/grabaciones"><ArrowLeft size={16} />Grabaciones</Link>
      <header className="page-header recording-header">
        <div>
          <p className="page-eyebrow">{association.programa.nombre}</p>
          <h1>{meeting.solicitud.titulo}</h1>
          <p>{formatDateTime(meeting.inicioProgramadoAt)} · {association.docente.usuario.nombres} {association.docente.usuario.apellidos}</p>
        </div>
        <Video size={28} color="var(--brand)" aria-hidden="true" />
      </header>
      <section className="content-section recording-player-section">
        <video
          className="recording-player"
          controls
          preload="metadata"
          src={`/api/v1/grabaciones/${recording.id}/contenido`}
        >
          Tu navegador no puede reproducir este video.
        </video>
        <div className="recording-file-meta">
          <strong>{recording.nombre}</strong>
          <span>{recording.mimeType ?? "video/mp4"}</span>
        </div>
      </section>
    </>
  );
}
