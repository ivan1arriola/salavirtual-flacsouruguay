import {
  Activity,
  BookOpen,
  CalendarCheck2,
  CalendarDays,
  CalendarPlus,
  FileVideo2,
  Hand,
  History,
  LayoutDashboard,
  Settings,
  UserRound,
  UserRoundCheck,
  Users
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { RolUsuario } from "@/src/modules/usuarios/roles";

export type NavigationItem = Readonly<{
  href: string;
  label: string;
  icon: LucideIcon;
  shortLabel?: string;
  emphasis?: "primary";
  search?: Readonly<{ key: string; value: string; defaultActive?: boolean }>;
}>;

export type NavigationGroup = Readonly<{
  label: string;
  items: readonly NavigationItem[];
}>;

export type RoleNavigation = Readonly<{
  groups: readonly NavigationGroup[];
  mobilePrimary: readonly NavigationItem[];
}>;

export const ASSISTANT_AGENDA_HREF = "/mi-agenda?tab=mes";
export const ASSISTANT_MONITORINGS_HREF = "/mi-agenda?tab=proximas";

const createMeeting: NavigationItem = {
  href: "/reuniones/nueva",
  label: "Nueva reunión",
  shortLabel: "Nueva",
  emphasis: "primary",
  icon: CalendarPlus
};

const adminGroups: readonly NavigationGroup[] = [
  {
    label: "Trabajo diario",
    items: [
      { href: "/", label: "Inicio", icon: LayoutDashboard },
      {
        href: "/reuniones?vista=encuentros",
        label: "Agenda",
        icon: CalendarDays,
        search: { key: "vista", value: "encuentros" }
      },
      {
        href: "/reuniones?vista=series",
        label: "Reuniones",
        icon: CalendarCheck2,
        search: { key: "vista", value: "series", defaultActive: true }
      },
      { href: "/monitoreo", label: "Monitoreo", icon: Hand },
      createMeeting
    ]
  },
  {
    label: "Recursos",
    items: [
      { href: "/grabaciones", label: "Grabaciones y archivos", icon: FileVideo2 },
      { href: "/usuarios", label: "Personas y programas", icon: Users },
      { href: "/asistentes", label: "Asistentes de monitoreo", icon: UserRoundCheck }
    ]
  },
  {
    label: "Sistema",
    items: [
      { href: "/centro-operaciones", label: "Centro de operaciones", icon: Activity },
      { href: "/configuracion", label: "Configuración", icon: Settings }
    ]
  }
];

const teacherGroups: readonly NavigationGroup[] = [
  {
    label: "Trabajo diario",
    items: [
      { href: "/", label: "Inicio", icon: LayoutDashboard },
      { href: "/reuniones", label: "Mi agenda", icon: CalendarDays },
      createMeeting,
      { href: "/mis-programas", label: "Mis programas", icon: BookOpen }
    ]
  },
  {
    label: "Recursos y cuenta",
    items: [
      { href: "/grabaciones", label: "Grabaciones", icon: FileVideo2 },
      { href: "/notificaciones", label: "Notificaciones", icon: Activity },
      { href: "/mi-perfil", label: "Mi perfil", icon: UserRound }
    ]
  }
];

const assistantGroups: readonly NavigationGroup[] = [
  {
    label: "Monitoreo",
    items: [
      { href: "/", label: "Inicio", icon: LayoutDashboard },
      {
        href: ASSISTANT_AGENDA_HREF,
        label: "Mi agenda",
        icon: CalendarDays,
        search: { key: "tab", value: "mes" }
      },
      { href: "/agenda-abierta", label: "Agenda abierta", icon: Hand },
      { href: ASSISTANT_MONITORINGS_HREF, label: "Mis monitoreos", icon: CalendarCheck2, search: { key: "tab", value: "proximas", defaultActive: true } },
      {
        href: "/mi-agenda?tab=historico",
        label: "Historial",
        icon: History,
        search: { key: "tab", value: "historico" }
      }
    ]
  },
  {
    label: "Recursos y cuenta",
    items: [
      { href: "/grabaciones", label: "Grabaciones", icon: FileVideo2 },
      { href: "/notificaciones", label: "Notificaciones", icon: Activity },
      { href: "/mi-perfil", label: "Mi perfil", icon: UserRound }
    ]
  }
];

const mobilePrimary: Readonly<Record<RolUsuario, readonly NavigationItem[]>> = {
  ADMINISTRACION: adminGroups[0].items.slice(0, 4),
  DOCENTE: [teacherGroups[0].items[0], teacherGroups[0].items[1], createMeeting, teacherGroups[0].items[3]],
  ASISTENTE_TECNICO: assistantGroups[0].items.slice(0, 4)
};

export function getNavigationForRole(role: RolUsuario): RoleNavigation {
  const groups = role === "ADMINISTRACION"
    ? adminGroups
    : role === "DOCENTE"
      ? teacherGroups
      : assistantGroups;

  return { groups, mobilePrimary: mobilePrimary[role] };
}

export function getSecondaryNavigation(navigation: RoleNavigation): readonly NavigationGroup[] {
  const primaryHrefs = new Set(navigation.mobilePrimary.map(({ href }) => href));
  return navigation.groups
    .map(({ label, items }) => ({
      label,
      items: items.filter(({ href }) => !primaryHrefs.has(href))
    }))
    .filter(({ items }) => items.length > 0);
}

export function isNavigationItemActive(
  item: Pick<NavigationItem, "href" | "search">,
  pathname: string,
  searchParams: Pick<URLSearchParams, "get">,
  exact = false
): boolean {
  const route = item.href.split("?")[0];
  const routeActive = pathname === route || (!exact && route !== "/" && pathname.startsWith(`${route}/`));
  if (!routeActive || !item.search) return routeActive;

  const queryValue = searchParams.get(item.search.key);
  return queryValue === item.search.value
    || (queryValue === null && item.search.defaultActive === true);
}
