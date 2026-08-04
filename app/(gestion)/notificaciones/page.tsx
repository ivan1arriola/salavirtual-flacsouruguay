import { Bell, Inbox } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import {
  NotificationReadAllButton,
  NotificationReadButton
} from "@/src/components/notification-actions";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { formatDateTime } from "@/src/lib/ui/format";

export default async function NotificacionesPage({
  searchParams
}: Readonly<{ searchParams: Promise<{ estado?: string }> }>) {
  const session = await auth();
  if (!session?.user) redirect("/acceso");
  const actor = await resolveSessionActor(db, {
    id: session.user.id,
    email: session.user.email
  });
  if (!actor?.activo) redirect("/acceso");

  const { estado = "todas" } = await searchParams;
  const where = {
    usuarioId: actor.id,
    ...(estado === "no-leidas" ? { leidaAt: null } : {})
  };
  const [notifications, unreadCount] = await Promise.all([
    db.notificacion.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 80
    }),
    db.notificacion.count({ where: { usuarioId: actor.id, leidaAt: null } })
  ]);

  return (
    <>
      <header className="page-header">
        <div>
          <p className="page-eyebrow">Actividad</p>
          <h1>Notificaciones</h1>
          <p>{unreadCount} sin leer.</p>
        </div>
        {unreadCount > 0 ? <NotificationReadAllButton /> : <Bell size={28} color="var(--brand)" aria-hidden="true" />}
      </header>

      <form className="filter-bar notification-filter" method="get">
        <Bell size={18} aria-hidden="true" />
        <select aria-label="Filtrar notificaciones" name="estado" defaultValue={estado}>
          <option value="todas">Todas</option>
          <option value="no-leidas">No leidas</option>
        </select>
        <button className="secondary-action" type="submit">Filtrar</button>
      </form>

      <section className="content-section">
        {notifications.length === 0 ? (
          <div className="empty-state">
            <Inbox size={24} aria-hidden="true" />
            <p>No hay notificaciones para ese filtro.</p>
          </div>
        ) : (
          <div className="notification-list">
            {notifications.map((notification) => {
              const content = (
                <>
                  <span className={`notification-dot${notification.leidaAt ? " read" : ""}`} aria-hidden="true" />
                  <span>
                    <strong>{notification.titulo}</strong>
                    {notification.cuerpo ? <small>{notification.cuerpo}</small> : null}
                    <time dateTime={notification.createdAt.toISOString()}>
                      {formatDateTime(notification.createdAt)}
                    </time>
                  </span>
                </>
              );
              return (
                <article className={`notification-item${notification.leidaAt ? "" : " unread"}`} key={notification.id}>
                  {notification.href ? (
                    <Link className="notification-copy" href={notification.href}>{content}</Link>
                  ) : (
                    <span className="notification-copy">{content}</span>
                  )}
                  {notification.leidaAt ? (
                    <span className="status status-neutral">Leida</span>
                  ) : (
                    <NotificationReadButton notificationId={notification.id} />
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
