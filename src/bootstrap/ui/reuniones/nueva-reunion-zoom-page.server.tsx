import { BookOpen } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { MeetingFormZoom } from "@/src/modules/reuniones/presentation/components/meeting-form-zoom";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { puedeAbrirCreacionReuniones } from "@/src/modules/reuniones/reuniones.domain";
import { requiereCompletarRegistro } from "@/src/modules/usuarios/registro-institucional.domain";
import styles from "@/src/modules/reuniones/presentation/components/nueva-reunion/nueva-reunion.module.css";

export default async function NuevaReunionZoomPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/acceso");
  }
  const actor = await resolveSessionActor(db, {
    id: session.user.id,
    email: session.user.email
  });
  if (!actor?.activo || !puedeAbrirCreacionReuniones(actor.rol)) {
    redirect("/mi-agenda");
  }

  const [associations, assistants] = await Promise.all([
    db.docentePrograma.findMany({
      where: {
        activo: true,
        programa: { activo: true },
        ...(actor.rol === "DOCENTE" ? { docente: { usuarioId: actor.id } } : {})
      },
      orderBy: { programa: { nombre: "asc" } },
      include: {
        programa: true,
        docente: {
          include: {
            usuario: true
          }
        }
      }
    }),
    actor.rol === "ADMINISTRACION"
      ? db.asistenteTecnico.findMany({
          where: {
            cesadoHastaProximoInicioSesion: false,
            usuario: { activo: true, rol: "ASISTENTE_TECNICO" }
          },
          orderBy: { usuario: { nombres: "asc" } },
          include: { usuario: true }
        })
      : Promise.resolve([])
  ]);

  if (
    requiereCompletarRegistro({
      rol: actor.rol,
      programasActivos: associations.length
    })
  ) {
    redirect("/completar-registro");
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerCopy}>
          <p className="page-eyebrow">Sala Virtual</p>
          <h1>Programar una reunión</h1>
          <p>Completá los datos, definí las fechas y ajustá la organización.</p>
        </div>
        <Link className={styles.programsAction} href="/mis-programas">
          <BookOpen size={19} aria-hidden="true" />
          <span>
            <strong>Editar mis programas</strong>
            <small>Revisar asociaciones académicas</small>
          </span>
        </Link>
      </header>
      <MeetingFormZoom
        canAssignAssistant={actor.rol === "ADMINISTRACION"}
        assistants={assistants.map(({ id, usuario }) => ({
          id,
          label: `${usuario.nombres} ${usuario.apellidos ?? ""}`.trim()
        }))}
        programs={associations.map(({ id, docente, programa }) => ({
          id,
          label: programa.nombre,
          teacher: `${docente.usuario.nombres} ${docente.usuario.apellidos ?? ""}`.trim()
        }))}
      />
    </div>
  );
}
