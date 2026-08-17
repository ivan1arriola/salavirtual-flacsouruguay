import {
  Bell,
  BookOpen,
  CalendarCheck2,
  CalendarDays,
  CalendarPlus,
  CalendarRange,
  GitCompareArrows,
  Hand,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  UserRoundCheck,
  Users,
  Video
} from "lucide-react";
import type { Session } from "next-auth";
import Link from "next/link";
import { signOut } from "@/auth";
import { AccountSwitcher } from "@/src/components/account-switcher";
import { SidebarLink } from "@/src/components/sidebar-link";
import { db } from "@/src/lib/db";

const primaryNav = [
  { href: "/", label: "Resumen", icon: LayoutDashboard },
  { href: "/reuniones", label: "Agenda", icon: CalendarDays },
  { href: "/grabaciones", label: "Grabaciones", icon: Video }
] as const;

const createMeetingNav = {
  href: "/reuniones/nueva",
  label: "Nueva reunión",
  icon: CalendarPlus
} as const;

const adminNav = [
  { href: "/asistencia-tecnica", label: "Asistencia técnica", icon: Hand },
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
  { href: "/mi-historico", label: "Mi histórico", icon: History }
] as const;

const teacherNav = [{ href: "/mis-programas", label: "Mis programas", icon: BookOpen }] as const;
const archiveNav = [{ href: "/historico", label: "Histórico Zoom", icon: History }] as const;

export async function AppShell({
  user,
  children
}: Readonly<{ user: Session["user"]; children: React.ReactNode }>) {
  const operationalNav: readonly NavigationItem[] = user.role === "ASISTENTE_TECNICO"
    ? assistantNav
    : user.role === "DOCENTE"
      ? [primaryNav[0], primaryNav[1], ...teacherNav, primaryNav[2]]
      : primaryNav;
  const canCreateMeeting = user.role !== "ASISTENTE_TECNICO";
  const rememberedAccount = {
    id: user.id,
    nombre: user.name ?? user.email ?? user.id,
    identificador: user.email ?? user.id
  };
  const unreadNotifications = await db.notificacion.count({
    where: { usuarioId: user.id, leidaAt: null }
  });
  const mobilePrimaryNav: readonly NavigationItem[] = user.role === "ASISTENTE_TECNICO"
    ? assistantNav.slice(0, 4)
    : user.role === "DOCENTE"
      ? [primaryNav[0], primaryNav[1], createMeetingNav, teacherNav[0]]
      : [primaryNav[0], primaryNav[1], createMeetingNav, primaryNav[2]];
  const mobileMoreNav: readonly NavigationItem[] = user.role === "ASISTENTE_TECNICO"
    ? [assistantNav[4], { href: "/notificaciones", label: "Notificaciones", icon: Bell }]
    : user.role === "DOCENTE"
      ? [primaryNav[2], { href: "/notificaciones", label: "Notificaciones", icon: Bell }]
      : [
          ...adminNav,
          ...archiveNav,
          { href: "/notificaciones", label: "Notificaciones", icon: Bell }
        ];

  return (
    <div className="app-frame">
      <aside className="sidebar">
        <Link className="brand" href="/" aria-label="Sala Virtual FLACSO">
          <span className="brand-mark" aria-hidden="true">F</span>
          <span>
            <strong>FLACSO Uruguay</strong>
            <small>Sala Virtual</small>
          </span>
        </Link>

        <div className="sidebar-navigation">
          <SidebarGroup label={user.role === "ASISTENTE_TECNICO" ? "Trabajo" : "Principal"} items={operationalNav} />
          {canCreateMeeting ? (
            <Link className="sidebar-create-action" href={createMeetingNav.href}>
              <CalendarPlus size={18} aria-hidden="true" />
              <span>Nueva reunión</span>
            </Link>
          ) : null}
          {user.role === "ADMINISTRACION" ? (
            <>
              <SidebarGroup label="Operación" items={adminNav.slice(0, 2)} />
              <SidebarGroup label="Administración" items={adminNav.slice(2)} />
            </>
          ) : null}
        </div>

        <nav className="side-nav sidebar-utility-nav" aria-label="Cuenta y notificaciones">
          <SidebarLink className="notification-nav-link" href="/notificaciones">
            <Bell size={18} strokeWidth={1.8} aria-hidden="true" />
            <span>Notificaciones</span>
            {unreadNotifications > 0 ? <strong>{unreadNotifications}</strong> : null}
          </SidebarLink>
        </nav>

        {user.role === "ADMINISTRACION" ? (
          <details className="archive-nav">
            <summary>Archivo</summary>
            <nav className="side-nav" aria-label="Navegación de archivo">
              {archiveNav.map(({ href, label, icon: Icon }) => (
                <SidebarLink href={href} key={href}>
                  <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
                  <span>{label}</span>
                </SidebarLink>
              ))}
            </nav>
          </details>
        ) : null}

        <div className="account-block">
          <SidebarLink className="account-profile-link" href="/mi-perfil">
            <span className="avatar" aria-hidden="true">
              <UserAvatarContent imageUrl={user.image} name={user.name ?? user.email ?? "U"} />
            </span>
            <span className="account-copy">
              <strong>{user.name ?? user.id}</strong>
              <small>{roleLabel(user.role)} · Mi perfil</small>
            </span>
          </SidebarLink>
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
            <strong>Sala Virtual</strong>
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
        <main className="workspace">{children}</main>
        <nav className="mobile-nav" aria-label="Navegación móvil">
          {mobilePrimaryNav.map(({ href, label, icon: Icon }) => (
            <Link href={href} key={href}>
              <Icon size={20} aria-hidden="true" />
              <span>{label === "Nueva reunión" ? "Nueva" : label}</span>
            </Link>
          ))}
          <details className="mobile-nav-more">
            <summary>
              <Menu size={20} aria-hidden="true" />
              <span>Más</span>
              {unreadNotifications > 0 ? <strong className="mobile-more-badge">{unreadNotifications}</strong> : null}
            </summary>
            <div className="mobile-more-menu">
              <div className="mobile-more-heading">
                <span>Más opciones</span>
                <small>{roleLabel(user.role)}</small>
              </div>
              <nav aria-label="Más opciones">
                {mobileMoreNav.map(({ href, label, icon: Icon }) => (
                  <Link href={href} key={href}>
                    <Icon size={18} aria-hidden="true" />
                    <span>{label}</span>
                    {href === "/notificaciones" && unreadNotifications > 0 ? <strong>{unreadNotifications}</strong> : null}
                  </Link>
                ))}
              </nav>
            </div>
          </details>
        </nav>
      </div>
    </div>
  );
}

type NavigationItem = Readonly<{
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
}>;

function SidebarGroup({
  label,
  items
}: Readonly<{ label: string; items: readonly NavigationItem[] }>) {
  return (
    <section className="sidebar-group" aria-label={label}>
      <p>{label}</p>
      <nav className="side-nav">
        {items.map(({ href, label: itemLabel, icon: Icon }) => (
          <SidebarLink exact={href === "/" || href === "/reuniones"} href={href} key={href}>
            <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
            <span>{itemLabel}</span>
          </SidebarLink>
        ))}
      </nav>
    </section>
  );
}

function roleLabel(role: Session["user"]["role"]): string {
  if (role === "ADMINISTRACION") return "Administración";
  if (role === "ASISTENTE_TECNICO") return "Asistencia técnica";
  return "Docente";
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
