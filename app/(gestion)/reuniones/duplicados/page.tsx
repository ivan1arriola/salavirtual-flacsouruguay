import { AlertTriangle, ArrowLeft, CalendarClock, CheckCircle2, ExternalLink, GitCompareArrows, XCircle } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { formatDate, formatTime } from "@/src/lib/ui/format";
import { listarCasosRevisionDuplicados } from "@/src/modules/reuniones/duplicados.service";
import { guardarRevisionDuplicado } from "./actions";

type VistaRevision = "pendientes" | "actualizar" | "falsos";

export default async function DuplicadosPage({
  searchParams
}: Readonly<{ searchParams: Promise<{ vista?: string; estado?: string }> }>) {
  const session = await auth();
  if (!session?.user) redirect("/acceso");
  const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
  if (!actor?.activo || actor.rol !== "ADMINISTRACION") redirect("/reuniones");

  const params = await searchParams;
  const vista: VistaRevision = params.vista === "actualizar" || params.vista === "falsos"
    ? params.vista
    : "pendientes";
  const cases = await listarCasosRevisionDuplicados(db, new Date());
  const pending = cases.filter(({ decision }) => decision === null);
  const update = cases.filter(({ decision }) => decision === "REQUIERE_ACTUALIZACION");
  const falsePositives = cases.filter(({ decision }) => decision === "FALSO_POSITIVO");
  const visible = vista === "actualizar" ? update : vista === "falsos" ? falsePositives : pending;

  return (
    <div className="duplicate-review-page">
      <header className="page-header duplicate-review-header">
        <div>
          <p className="page-eyebrow">Control de agenda</p>
          <h1>Revisión de posibles duplicados</h1>
          <p>Compará cada coincidencia y registrá si requiere actualización o si es un falso positivo.</p>
        </div>
        <Link className="secondary-action" href="/reuniones"><ArrowLeft size={17} />Volver a agenda</Link>
      </header>

      {params.estado === "revision-guardada" ? <p className="form-notice" role="status">La revisión quedó registrada.</p> : null}
      {params.estado === "error-revision" ? <p className="form-notice form-notice-error" role="alert">No se pudo registrar la revisión. Las reuniones pueden haber cambiado.</p> : null}

      <nav className="duplicate-review-tabs" aria-label="Estado de revisión">
        <ReviewTab active={vista === "pendientes"} count={pending.length} href="/reuniones/duplicados" icon={AlertTriangle} label="Pendientes" />
        <ReviewTab active={vista === "actualizar"} count={update.length} href="/reuniones/duplicados?vista=actualizar" icon={CheckCircle2} label="Requieren actualización" />
        <ReviewTab active={vista === "falsos"} count={falsePositives.length} href="/reuniones/duplicados?vista=falsos" icon={XCircle} label="Falsos positivos" />
      </nav>

      <section className="duplicate-review-list" aria-label="Comparaciones de reuniones">
        {visible.length === 0 ? (
          <div className="content-section empty-state duplicate-review-empty"><GitCompareArrows size={25} /><p>No hay casos en esta sección.</p></div>
        ) : visible.map(({ izquierda, derecha, motivo, clave }) => (
          <article className="duplicate-review-card" key={clave}>
            <header>
              <span className="duplicate-reason">{motivo === "COINCIDENCIA_EXACTA" ? "Coincidencia exacta" : "Horario superpuesto"}</span>
              <strong>{izquierda.docenteNombre}</strong>
            </header>
            <div className="duplicate-comparison">
              {[izquierda, derecha].map((meeting, index) => (
                <section key={meeting.id}>
                  <small>Reunión {index + 1}</small>
                  <h2>{meeting.titulo}</h2>
                  <p><CalendarClock size={15} />{formatDate(meeting.inicio)} · {formatTime(meeting.inicio)}–{formatTime(meeting.fin)}</p>
                  <p>{meeting.programaNombre}</p>
                  <Link className="text-link" href={`/reuniones/${meeting.solicitudId}`}>Abrir detalle <ExternalLink size={14} /></Link>
                </section>
              ))}
            </div>
            <footer>
              <p>La decisión clasifica el caso; no modifica ni cancela reuniones automáticamente.</p>
              <form action={guardarRevisionDuplicado}>
                <input name="izquierdaId" type="hidden" value={izquierda.id} />
                <input name="derechaId" type="hidden" value={derecha.id} />
                <button className="secondary-action danger-action" name="decision" type="submit" value="FALSO_POSITIVO"><XCircle size={16} />Falso positivo</button>
                <button className="primary-action" name="decision" type="submit" value="REQUIERE_ACTUALIZACION"><CheckCircle2 size={16} />Requiere actualización</button>
              </form>
            </footer>
          </article>
        ))}
      </section>
    </div>
  );
}

function ReviewTab({ active, count, href, icon: Icon, label }: Readonly<{
  active: boolean;
  count: number;
  href: string;
  icon: typeof AlertTriangle;
  label: string;
}>) {
  return <Link aria-current={active ? "page" : undefined} className={active ? "active" : ""} href={href}><Icon size={17} /><span>{label}</span><strong>{count}</strong></Link>;
}
