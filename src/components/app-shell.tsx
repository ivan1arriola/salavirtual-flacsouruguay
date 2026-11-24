import { Bell, CalendarPlus, Menu } from "lucide-react";
import type { Session } from "next-auth";
import Link from "next/link";
import { AppLogoMark } from "@/src/components/app-logo";
import { AssistantOnboardingTour } from "@/src/modules/asistencia/presentation/components/assistant-onboarding-tour";
import { ProfileMenu } from "@/src/components/profile-menu";
import { DismissibleDetails } from "@/src/components/profile-menu-disclosure";
import { SidebarLink } from "@/src/components/sidebar-link";
import { TeacherOnboardingTour } from "@/src/components/teacher-onboarding-tour";
import {
  getNavigationForRole,
  getSecondaryNavigation,
  type NavigationGroup
} from "@/src/components/app-navigation";
import { db } from "@/src/lib/db";

export async function AppShell({
  user,
  children
}: Readonly<{ user: Session["user"]; children: React.ReactNode }>) {
  const navigation = getNavigationForRole(user.role);
  const canCreateMeeting = user.role !== "ASISTENTE_TECNICO";
  const secondaryNavigation = getSecondaryNavigation(navigation);
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
      <a className="skip-to-content" href="#contenido-principal">
        Saltar al contenido principal
      </a>
      {user.role === "DOCENTE" ? <TeacherOnboardingTour userId={user.id} /> : null}
      {user.role === "ASISTENTE_TECNICO" ? <AssistantOnboardingTour userId={user.id} /> : null}

      <aside className="sidebar">
        <Link className="brand" href="/" aria-label="Sala Virtual FLACSO">
          <AppLogoMark className="brand-app-logo" size={38} />
          <span>
            <strong>FLACSO Uruguay</strong>
            <small>Sala Virtual · {roleLabel(user.role)}</small>
          </span>
        </Link>

        {canCreateMeeting ? (
          <SidebarLink
            className="sidebar-create-action sidebar-primary-create"
            href="/reuniones/nueva"
            dataTour={tourForHref(user.role, "/reuniones/nueva")}
          >
            <CalendarPlus size={18} aria-hidden="true" />
            <span>Nueva reunión</span>
          </SidebarLink>
        ) : null}
        <div className="sidebar-navigation">
          {navigation.groups.map((group) => (
            <SidebarGroup
              group={group}
              role={user.role}
              unreadNotifications={unreadNotifications}
              key={group.label}
            />
          ))}
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
            <SidebarLink
              className="mobile-notification-link"
              href="/notificaciones"
              dataTour={notificationTourForRole(user.role)}
            >
              <Bell size={20} aria-hidden="true" />
              <span className="sr-only">Notificaciones: {unreadNotifications} sin leer</span>
              {unreadNotifications > 0 ? <strong>{unreadNotifications}</strong> : null}
            </SidebarLink>
            <ProfileMenu
              compact
              user={user}
              account={rememberedAccount}
              unreadNotifications={unreadNotifications}
            />
          </span>
        </header>
        <main className="workspace" id="contenido-principal" tabIndex={-1}>
          {children}
        </main>
        <nav className="mobile-nav" aria-label="Navegación móvil">
          {navigation.mobilePrimary.map(({ href, label, shortLabel, icon: Icon, search, emphasis }) => (
            <SidebarLink
              className={emphasis === "primary" ? "mobile-create-action" : undefined}
              dataTour={tourForHref(user.role, href)}
              exact={href.split("?")[0] === "/" || href.split("?")[0] === "/reuniones"}
              href={href}
              key={href}
              activeSearch={search}
            >
              <Icon size={20} aria-hidden="true" />
              <span>{shortLabel ?? label}</span>
            </SidebarLink>
          ))}
          <DismissibleDetails className="mobile-nav-more" dataTour={moreTourForRole(user.role)}>
            <summary>
              <Menu size={20} aria-hidden="true" />
              <span>Más</span>
            </summary>
            <div className="mobile-more-menu">
              <div className="mobile-more-heading">
                <span>Más opciones</span>
                <small>{roleLabel(user.role)}</small>
              </div>
              {secondaryNavigation.map((group) => (
                <section className="mobile-more-group" aria-label={group.label} key={group.label}>
                  <h3>{group.label}</h3>
                  <nav aria-label={group.label}>
                    {group.items.map(({ href, label, icon: Icon, search }) => (
                      <SidebarLink
                        dataTour={tourForHref(user.role, href)}
                        href={href}
                        key={href}
                        activeSearch={search}
                      >
                        <Icon size={18} aria-hidden="true" />
                        <span>{label}</span>
                      </SidebarLink>
                    ))}
                  </nav>
                </section>
              ))}
            </div>
          </DismissibleDetails>
        </nav>
      </div>
    </div>
  );
}

function SidebarGroup({
  group,
  role,
  unreadNotifications
}: Readonly<{
  group: NavigationGroup;
  role: Session["user"]["role"];
  unreadNotifications: number;
}>) {
  return (
    <section className="sidebar-group" aria-label={group.label}>
      <p>{group.label}</p>
      <nav className="side-nav" aria-label={group.label}>
        {group.items
          .filter(({ emphasis }) => emphasis !== "primary")
          .map(({ href, label, icon: Icon, search }) => (
            <SidebarLink
              dataTour={tourForHref(role, href)}
              exact={href.split("?")[0] === "/" || href.split("?")[0] === "/reuniones"}
              href={href}
              key={href}
              activeSearch={search}
            >
              <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
              <span>{label}</span>
              {href === "/notificaciones" && unreadNotifications > 0 ? (
                <strong className="sidebar-unread-count">{unreadNotifications}</strong>
              ) : null}
            </SidebarLink>
          ))}
      </nav>
    </section>
  );
}

function tourForHref(role: Session["user"]["role"], href: string): string | undefined {
  const route = href.split("?")[0];
  if (route === "/notificaciones") {
    return notificationTourForRole(role);
  }
  if (role === "DOCENTE") {
    return teacherTourForRoute(route);
  }
  if (role === "ASISTENTE_TECNICO") {
    return assistantTourForRoute(route, href);
  }
  return undefined;
}

function teacherTourForRoute(route: string): string | undefined {
  if (route === "/mis-clases") {
    return "teacher-agenda";
  }
  if (route === "/reuniones/nueva") {
    return "teacher-create";
  }
  if (route === "/mis-programas") {
    return "teacher-programs";
  }
  if (route === "/grabaciones") {
    return "teacher-recordings";
  }
  return undefined;
}

function assistantTourForRoute(route: string, href: string): string | undefined {
  if (route === "/") {
    return "assistant-dashboard";
  }
  if (href === "/mi-agenda?tab=proximas") {
    return "assistant-my-agenda";
  }
  if (href === "/agenda-abierta") {
    return "assistant-open-agenda";
  }
  if (route === "/grabaciones") {
    return "assistant-recordings";
  }
  if (route === "/mi-perfil") {
    return "assistant-profile";
  }
  return undefined;
}

function notificationTourForRole(role: Session["user"]["role"]): string | undefined {
  if (role === "DOCENTE") {
    return "teacher-notifications";
  }
  if (role === "ASISTENTE_TECNICO") {
    return "assistant-notifications";
  }
  return undefined;
}

function moreTourForRole(role: Session["user"]["role"]): string | undefined {
  if (role === "DOCENTE") {
    return "teacher-more";
  }
  if (role === "ASISTENTE_TECNICO") {
    return "assistant-more";
  }
  return undefined;
}

function roleLabel(role: Session["user"]["role"]): string {
  if (role === "ADMINISTRACION") {
    return "Administración";
  }
  if (role === "ASISTENTE_TECNICO") {
    return "Asistente técnico";
  }
  return "Docente";
}
