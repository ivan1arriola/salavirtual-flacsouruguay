import {
  CalendarCheck2,
  CalendarDays,
  Hand,
  History,
  LayoutDashboard,
  LogOut,
  Settings,
  Users,
  Waypoints
} from "lucide-react";
import type { Session } from "next-auth";
import Link from "next/link";
import { signOut } from "@/auth";

const primaryNav = [
  { href: "/", label: "Resumen", icon: LayoutDashboard },
  { href: "/reuniones", label: "Agenda", icon: CalendarDays },
  { href: "/reuniones/nueva", label: "Nueva reunión", icon: Waypoints },
  { href: "/historico", label: "Histórico Zoom", icon: History }
] as const;

const adminNav = [
  { href: "/agenda-abierta", label: "Agenda abierta", icon: Hand },
  { href: "/usuarios", label: "Usuarios", icon: Users },
  { href: "/configuracion", label: "Configuración", icon: Settings }
] as const;

const assistantNav = [
  { href: "/mi-agenda", label: "Mi agenda", icon: CalendarCheck2 },
  { href: "/agenda-abierta", label: "Agenda abierta", icon: Hand },
  { href: "/historico", label: "Histórico Zoom", icon: History }
] as const;

export function AppShell({
  user,
  children
}: Readonly<{ user: Session["user"]; children: React.ReactNode }>) {
  const operationalNav = user.role === "ASISTENTE" ? assistantNav : primaryNav;
  const nav =
    user.role === "ADMINISTRACION"
      ? [...operationalNav, ...adminNav]
      : operationalNav;

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
        </nav>

        <div className="account-block">
          <span className="avatar" aria-hidden="true">
            {(user.name ?? user.email ?? "U").slice(0, 1).toUpperCase()}
          </span>
          <span className="account-copy">
            <strong>{user.name ?? user.id}</strong>
            <small>{user.role.toLowerCase()}</small>
          </span>
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
          <span className="avatar">{(user.name ?? "U").slice(0, 1).toUpperCase()}</span>
        </header>
        <main className="workspace">{children}</main>
        <nav className="mobile-nav" aria-label="Navegación móvil">
          {operationalNav.slice(0, 4).map(({ href, label, icon: Icon }) => (
            <Link href={href} key={href}>
              <Icon size={20} aria-hidden="true" />
              <span>{label === "Nueva reunión" ? "Nueva" : label}</span>
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
