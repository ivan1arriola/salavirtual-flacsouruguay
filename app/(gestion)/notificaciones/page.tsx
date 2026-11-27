import { Bell, Inbox } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import {
  NotificationMarkReadOnOpen,
  NotificationReadButton,
  NotificationDeleteButton,
} from "@/src/components/notification-actions";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { formatDateTime } from "@/src/lib/ui/format";
import styles from "./notificaciones.module.css";

export default async function NotificacionesPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ estado?: string }> }>) {
  const session = await auth();
  if (!session?.user) {
    redirect("/acceso");
  }
  const actor = await resolveSessionActor(db, {
    id: session.user.id,
    email: session.user.email,
  });
  if (!actor?.activo) {
    redirect("/acceso");
  }

  const { estado = "todas" } = await searchParams;
  const where = {
    usuarioId: actor.id,
    ...(estado === "no-leidas" ? { leidaAt: null } : {}),
  };
  const [notifications, unreadCount] = await Promise.all([
    db.notificacion.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 80,
    }),
    db.notificacion.count({ where: { usuarioId: actor.id, leidaAt: null } }),
  ]);

  return (
    <>
      <NotificationMarkReadOnOpen unreadCount={unreadCount} />

      <div className={styles["page"]}>
        <header className="page-header">
          <div>
            <p className="page-eyebrow">Actividad</p>
            <h1>Notificaciones</h1>
            <p>{unreadCount} sin leer.</p>
          </div>
          <Bell size={28} color="var(--brand)" aria-hidden="true" />
        </header>

        <form className={`filter-bar ${styles["filter"]}`} method="get">
          <Bell size={18} aria-hidden="true" />
          <select aria-label="Filtrar notificaciones" name="estado" defaultValue={estado}>
            <option value="todas">Todas</option>
            <option value="no-leidas">No leídas</option>
          </select>
          <button className="secondary-action" type="submit">
            Filtrar
          </button>
        </form>

        <section className="content-section">
          {notifications.length === 0 ? (
            <div className="empty-state">
              <Inbox size={24} aria-hidden="true" />
              <p>No hay notificaciones para ese filtro.</p>
            </div>
          ) : (
            <div className={styles["list"]}>
              {notifications.map((notification) => {
                const content = (
                  <>
                    <span
                      className={`${styles["dot"]}${notification.leidaAt ? ` ${styles["read"]}` : ""}`}
                      aria-hidden="true"
                    />
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
                  <article
                    className={`${styles["item"]}${notification.leidaAt ? "" : ` ${styles["unread"]}`}`}
                    key={notification.id}
                  >
                    {notification.href ? (
                      <Link className={styles["copy"]} href={notification.href}>
                        {content}
                      </Link>
                    ) : (
                      <span className={styles["copy"]}>{content}</span>
                    )}
                    <span className={styles["actions"]}>
                      {notification.leidaAt ? (
                        <span className="status status-neutral">Leída</span>
                      ) : (
                        <NotificationReadButton
                          className={styles["actionWrap"]}
                          notificationId={notification.id}
                        />
                      )}
                      <NotificationDeleteButton
                        className={styles["actionWrap"]}
                        notificationId={notification.id}
                      />
                    </span>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
