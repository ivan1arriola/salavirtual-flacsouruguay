import {
  CalendarCheck2,
  CalendarDays,
  CalendarRange,
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

const primaryNav = [
  { href: "/", label: "Resumen", icon: LayoutDashboard },
  { href: "/reuniones", label: "Agenda", icon: CalendarDays },
  { href: "/reuniones/nueva", label: "Nueva reunión", icon: Waypoints },
  { href: "/grabaciones", label: "Grabaciones", icon: Video },
  { href: "/historico", label: "Histórico Zoom", icon: History }
] as const;

const adminNav = [
  { href: "/agenda-abierta", label: "Agenda abierta", icon: Hand },
  { href: "/asistentes", label: "Asistentes", icon: UserRoundCheck },
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

export function AppShell({
  user,
  children
}: Readonly<{ user: Session["user"]; children: React.ReactNode }>) {
  const operationalNav = user.role === "ASISTENTE" ? assistantNav : [...primaryNav, ...profileNav];
  const nav =
    user.role === "ADMINISTRACION"
      ? [...operationalNav, ...adminNav]
      : operationalNav;
  const rememberedAccount = {
    id: user.id,
    nombre: user.name ?? user.email ?? user.id,
    identificador: user.email ?? user.id
  };

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
          <Link className="avatar" href="/mi-perfil" aria-label="Mi perfil">
            {(user.name ?? user.email ?? "U").slice(0, 1).toUpperCase()}
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
            <AccountSwitcher account={rememberedAccount} />
            <Link className="avatar" href="/mi-perfil" aria-label="Mi perfil">{(user.name ?? "U").slice(0, 1).toUpperCase()}</Link>
          </span>
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
