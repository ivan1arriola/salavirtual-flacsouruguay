import {
  Bell,
  BookOpen,
  CalendarCheck2,
  CalendarDays,
  CalendarRange,
  GitCompareArrows,
  Hand,
  History,
  LayoutDashboard,
  LogOut,
  Settings,
  UserRound,
  UserRoundCheck,
  Users,
  Video,
  Waypoints
} from "lucide-react";
import type { Session } from "next-auth";
import Link from "next/link";
import { signOut } from "@/auth";
import { AccountSwitcher } from "@/src/components/account-switcher";
import { db } from "@/src/lib/db";

const primaryNav = [
  { href: "/", label: "Resumen", icon: LayoutDashboard },
  { href: "/reuniones", label: "Agenda", icon: CalendarDays },
  { href: "/reuniones/nueva", label: "Nueva reunión", icon: Waypoints },
  { href: "/grabaciones", label: "Grabaciones", icon: Video }
] as const;

const adminNav = [
  { href: "/cobertura-asistencias", label: "Cobertura", icon: Hand },
  { href: "/reuniones/duplicados", label: "Duplicados", icon: GitCompareArrows },
  { href: "/asistentes", label: "Asistentes técnicos", icon: UserRoundCheck },
  { href: "/usuarios", label: "Usuarios", icon: Users },
  { href: "/configuracion", label: "Configuración", icon: Settings }
] as const;

const assistantNav = [
  { href: "/mi-agenda", label: "Mi agenda", icon: CalendarCheck2 },
  { href: "/agenda-abierta", label: "Agenda abierta", icon: Hand },
  { href: "/reuniones-del-mes", label: "Reuniones del mes", icon: CalendarRange },
  { href: "/grabaciones", label: "Grabaciones", icon: Video },
  { href: "/mi-historico", label: "Mi histórico", icon: History },
  { href: "/mi-perfil", label: "Mi perfil", icon: UserRound }
] as const;

const profileNav = [{ href: "/mi-perfil", label: "Mi perfil", icon: UserRound }] as const;
const teacherNav = [{ href: "/mis-programas", label: "Mis programas", icon: BookOpen }] as const;
const archiveNav = [{ href: "/historico", label: "Histórico Zoom", icon: History }] as const;

export async function AppShell({
  user,
  children
}: Readonly<{ user: Session["user"]; children: React.ReactNode }>) {
  const operationalNav = user.role === "ASISTENTE_TECNICO"
    ? assistantNav
    : user.role === "DOCENTE"
      ? [...primaryNav.slice(0, 3), ...teacherNav, ...primaryNav.slice(3), ...profileNav]
      : [...primaryNav, ...profileNav];
  const nav =
    user.role === "ADMINISTRACION"
      ? [...operationalNav, ...adminNav]
      : operationalNav;
  const rememberedAccount = {
    id: user.id,
    nombre: user.name ?? user.email ?? user.id,
    identificador: user.email ?? user.id
  };
  const unreadNotifications = await db.notificacion.count({
    where: { usuarioId: user.id, leidaAt: null }
  });

  return (
    <div className="app-frame">
      <aside className="sidebar">
        <Link className="brand" href="/" aria-label="Gestor FLACSO Meet">
          <span className="brand-mark" aria-hidden="true">F</span>
          <span>
            <strong>FLACSO Uruguay</strong>
            <small>Gestor Meet</small>
          </span>
        </Link>

        <nav className="side-nav" aria-label="Navegación principal">
          {nav.map(({ href, label, icon: Icon }) => (
            <Link href={href} key={href}>
              <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
              <span>{label}</span>
            </Link>
          ))}
          <Link className="notification-nav-link" href="/notificaciones">
            <Bell size={18} strokeWidth={1.8} aria-hidden="true" />
            <span>Notificaciones</span>
            {unreadNotifications > 0 ? <strong>{unreadNotifications}</strong> : null}
          </Link>
        </nav>

        {user.role === "ADMINISTRACION" ? (
          <details className="archive-nav">
            <summary>Archivo</summary>
            <nav className="side-nav" aria-label="Navegación de archivo">
              {archiveNav.map(({ href, label, icon: Icon }) => (
                <Link href={href} key={href}>
                  <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
                  <span>{label}</span>
                </Link>
              ))}
            </nav>
          </details>
        ) : null}

        <div className="account-block">
          <Link className="avatar" href="/mi-perfil" aria-label="Mi perfil">
            <UserAvatarContent imageUrl={user.image} name={user.name ?? user.email ?? "U"} />
          </Link>
          <span className="account-copy">
            <strong>{user.name ?? user.id}</strong>
            <small>{user.role.toLowerCase()}</small>
          </span>
          <AccountSwitcher account={rememberedAccount} />
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/acceso" });
            }}
          >
            <button className="icon-button" type="submit" title="Cerrar sesión">
              <LogOut size={18} aria-hidden="true" />
              <span className="sr-only">Cerrar sesión</span>
            </button>
          </form>
        </div>
      </aside>

      <div className="app-content">
        <header className="mobile-header">
          <Link className="mobile-brand" href="/">
            <span className="brand-mark">F</span>
            <strong>Gestor Meet</strong>
          </Link>
          <span className="mobile-account-actions">
            <Link className="notification-mobile-link" href="/notificaciones" aria-label={`Notificaciones${unreadNotifications > 0 ? `, ${unreadNotifications} sin leer` : ""}`}>
              <Bell size={18} aria-hidden="true" />
              {unreadNotifications > 0 ? <strong>{unreadNotifications}</strong> : null}
            </Link>
            <AccountSwitcher account={rememberedAccount} />
            <Link className="avatar" href="/mi-perfil" aria-label="Mi perfil">
              <UserAvatarContent imageUrl={user.image} name={user.name ?? user.email ?? "U"} />
            </Link>
          </span>
        </header>
        {user.role === "ADMINISTRACION" ? (
          <nav className="mobile-secondary-nav" aria-label="Navegación de administración">
            {adminNav.map(({ href, label, icon: Icon }) => (
              <Link href={href} key={href}>
                <Icon size={16} aria-hidden="true" />
                <span>{label}</span>
              </Link>
            ))}
            {archiveNav.map(({ href, label, icon: Icon }) => (
              <Link href={href} key={href}>
                <Icon size={16} aria-hidden="true" />
                <span>{label}</span>
              </Link>
            ))}
          </nav>
        ) : null}
        <main className="workspace">{children}</main>
        <nav className="mobile-nav" aria-label="Navegación móvil">
          {operationalNav.slice(0, 4).map(({ href, label, icon: Icon }) => (
            <Link href={href} key={href}>
              <Icon size={20} aria-hidden="true" />
              <span>{label === "Nueva reunión" ? "Nueva" : label}</span>
            </Link>
          ))}
          <Link href="/notificaciones">
            <Bell size={20} aria-hidden="true" />
            <span>Alertas</span>
          </Link>
        </nav>
      </div>
    </div>
  );
}

function UserAvatarContent({
  imageUrl,
  name
}: Readonly<{ imageUrl?: string | null; name: string }>) {
  return (
    <>
      <span className="avatar-fallback" aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>
      {imageUrl ? (
        <span
          className="avatar-image"
          style={{ backgroundImage: `url(${JSON.stringify(imageUrl)})` }}
          aria-hidden="true"
        />
      ) : null}
    </>
  );
}
