import {
  BookOpen,
  CalendarCheck2,
  CalendarDays,
  CalendarPlus,
  GitCompareArrows,
  Hand,
  LayoutDashboard,
  Menu,
  Settings,
  Search,
  UserRoundCheck,
  Users,
  Video
} from "lucide-react";
import type { Session } from "next-auth";
import Link from "next/link";
import { AppLogoMark } from "@/src/components/app-logo";
import { AssistantOnboardingTour } from "@/src/modules/asistencia/presentation/components/assistant-onboarding-tour";
import { ProfileMenu } from "@/src/components/profile-menu";
import { DismissibleDetails } from "@/src/components/profile-menu-disclosure";
import { SidebarLink } from "@/src/components/sidebar-link";
import { TeacherOnboardingTour } from "@/src/components/teacher-onboarding-tour";
import { db } from "@/src/lib/db";

const primaryNav = [
  { href: "/", label: "Resumen", icon: LayoutDashboard },
  { href: "/reuniones", label: "Reuniones", icon: CalendarDays },
  { href: "/grabaciones", label: "Grabaciones", icon: Video }
] as const;

const createMeetingNav = {
  href: "/reuniones/nueva",
  label: "Nueva reunión",
  icon: CalendarPlus
} as const;

const adminNav = [
  { href: "/asistencia-tecnica", label: "Monitoreo", icon: Hand },
  { href: "/reuniones/duplicados", label: "Duplicados", icon: GitCompareArrows },
  { href: "/asistentes", label: "Asistentes de monitoreo", icon: UserRoundCheck },
  { href: "/usuarios", label: "Usuarios", icon: Users },
  { href: "/configuracion", label: "Configuración", icon: Settings },
  { href: "/reuniones/buscar-meet", label: "Buscar Meet", icon: Search }
] as const;

const assistantNav = [
  { href: "/", label: "Inicio", icon: LayoutDashboard },
  { href: "/mi-agenda", label: "Mi agenda", icon: CalendarCheck2 },
  { href: "/agenda-abierta", label: "Agenda abierta", icon: Hand },
  { href: "/grabaciones", label: "Grabaciones", icon: Video }
] as const;

const teacherNav = [{ href: "/mis-programas", label: "Mis programas", icon: BookOpen }] as const;

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
    ? assistantNav
    : user.role === "DOCENTE"
      ? [primaryNav[0], primaryNav[1], createMeetingNav, teacherNav[0]]
      : [primaryNav[0], primaryNav[1], createMeetingNav, primaryNav[2]];
  const mobileMoreNav: readonly NavigationItem[] = user.role === "ASISTENTE_TECNICO"
    ? [{ href: "/mi-perfil", label: "Mi perfil", icon: Settings }]
    : user.role === "DOCENTE"
      ? [primaryNav[2]]
      : adminNav;

  return (
    <div className="app-frame">
      {user.role === "DOCENTE" ? <TeacherOnboardingTour userId={user.id} /> : null}
      {user.role === "ASISTENTE_TECNICO" ? <AssistantOnboardingTour userId={user.id} /> : null}

      <aside className="sidebar">
        <Link className="brand" href="/" aria-label="Sala Virtual FLACSO">
          <AppLogoMark className="brand-app-logo" size={38} />
          <span>
            <strong>FLACSO Uruguay</strong>
            <small>Sala Virtual</small>
          </span>
        </Link>

        <div className="sidebar-navigation">
          <SidebarGroup
            label={user.role === "ASISTENTE_TECNICO" ? "Trabajo" : "Principal"}
            items={operationalNav}
            role={user.role}
          />
          {canCreateMeeting ? (
            <Link
              className="sidebar-create-action"
              data-tour={user.role === "DOCENTE" ? "teacher-create" : undefined}
              href={createMeetingNav.href}
            >
              <CalendarPlus size={18} aria-hidden="true" />
              <span>Nueva reunión</span>
            </Link>
          ) : null}
          {user.role === "ADMINISTRACION" ? (
            <>
              <SidebarGroup label="Operación" items={adminNav.slice(0, 2)} role={user.role} />
              <SidebarGroup label="Administración" items={adminNav.slice(2)} role={user.role} />
            </>
          ) : null}
        </div>

        <div className="account-block">
          <ProfileMenu user={user} account={rememberedAccount} unreadNotifications={unreadNotifications} />
        </div>
      </aside>

      <div className="app-content">
        <header className="mobile-header">
          <Link className="mobile-brand" href="/" aria-label="Sala Virtual FLACSO">
            <AppLogoMark className="mobile-app-logo" size={34} />
            <strong>Sala Virtual</strong>
          </Link>
          <span className="mobile-account-actions">
            <ProfileMenu compact user={user} account={rememberedAccount} unreadNotifications={unreadNotifications} />
          </span>
        </header>
        <main className="workspace">{children}</main>
        <nav className="mobile-nav" aria-label="Navegación móvil">
          {mobilePrimaryNav.map(({ href, label, icon: Icon }) => (
            <SidebarLink
              dataTour={tourForHref(user.role, href)}
              exact={href === "/" || href === "/reuniones"}
              href={href}
              key={href}
            >
              <Icon size={20} aria-hidden="true" />
              <span>{label === "Nueva reunión" ? "Nueva" : label}</span>
            </SidebarLink>
          ))}
          <DismissibleDetails
            className="mobile-nav-more"
            dataTour={moreTourForRole(user.role)}
          >
            <summary>
              <Menu size={20} aria-hidden="true" />
              <span>Más</span>
            </summary>
            <div className="mobile-more-menu">
              <div className="mobile-more-heading">
                <span>Más opciones</span>
                <small>{roleLabel(user.role)}</small>
              </div>
              <nav aria-label="Más opciones">
                {mobileMoreNav.map(({ href, label, icon: Icon }) => (
                  <SidebarLink
                    dataTour={tourForHref(user.role, href)}
                    href={href}
                    key={href}
                  >
                    <Icon size={18} aria-hidden="true" />
                    <span>{label}</span>
                  </SidebarLink>
                ))}
              </nav>
            </div>
          </DismissibleDetails>
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
  items,
  role
}: Readonly<{
  label: string;
  items: readonly NavigationItem[];
  role: Session["user"]["role"];
}>) {
  return (
    <section className="sidebar-group" aria-label={label}>
      <p>{label}</p>
      <nav className="side-nav">
        {items.map(({ href, label: itemLabel, icon: Icon }) => (
          <SidebarLink
            dataTour={tourForHref(role, href)}
            exact={href === "/" || href === "/reuniones"}
            href={href}
            key={href}
          >
            <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
            <span>{itemLabel}</span>
          </SidebarLink>
        ))}
      </nav>
    </section>
  );
}

function tourForHref(role: Session["user"]["role"], href: string): string | undefined {
  if (role === "DOCENTE") {
    if (href === "/reuniones") return "teacher-agenda";
    if (href === "/reuniones/nueva") return "teacher-create";
    if (href === "/mis-programas") return "teacher-programs";
    if (href === "/grabaciones") return "teacher-recordings";
  }
  if (role === "ASISTENTE_TECNICO") {
    if (href === "/") return "assistant-dashboard";
    if (href === "/mi-agenda") return "assistant-my-agenda";
    if (href === "/agenda-abierta") return "assistant-open-agenda";
    if (href === "/grabaciones") return "assistant-recordings";
    if (href === "/mi-perfil") return "assistant-profile";
  }
  return undefined;
}

function moreTourForRole(role: Session["user"]["role"]): string | undefined {
  if (role === "DOCENTE") return "teacher-more";
  if (role === "ASISTENTE_TECNICO") return "assistant-more";
  return undefined;
}

function roleLabel(role: Session["user"]["role"]): string {
  if (role === "ADMINISTRACION") return "Administración";
  if (role === "ASISTENTE_TECNICO") return "Monitoreo";
  return "Docente";
}
