import {
  Activity,
  Bell,
  ClipboardList,
  BookOpen,
  CalendarCheck2,
  CalendarDays,
  CalendarPlus,
  FileVideo2,
  Hand,
  History,
  LayoutDashboard,
  Settings,
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
    label: "Operaciones",
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
        label: "Series y reuniones",
        shortLabel: "Series",
        icon: CalendarCheck2,
        search: { key: "vista", value: "series", defaultActive: true }
      },
      { href: "/monitoreo", label: "Monitoreo", icon: Hand },
      { href: "/centro-operaciones", label: "Centro de operaciones", icon: Activity },
      createMeeting
    ]
  },
  {
    label: "Administración",
    items: [
      { href: "/asistentes", label: "Equipo de monitoreo", icon: UserRoundCheck },
      { href: "/usuarios", label: "Personas y programas", icon: Users },
      { href: "/grabaciones", label: "Grabaciones y archivos", icon: FileVideo2 }
    ]
  },
  {
    label: "Sistema",
    items: [
      { href: "/configuracion", label: "Configuración", icon: Settings },
      { href: "/notificaciones", label: "Notificaciones", icon: Bell }
    ]
  }
];

const teacherGroups: readonly NavigationGroup[] = [
  {
    label: "Actividad académica",
    items: [
      { href: "/", label: "Inicio", icon: LayoutDashboard },
      { href: "/mis-clases", label: "Mis clases", icon: CalendarDays },
      { href: "/mis-programas", label: "Mis programas", icon: BookOpen },
      { href: "/grabaciones", label: "Grabaciones", icon: FileVideo2 },
      createMeeting
    ]
  },
  {
    label: "Personal",
    items: [{ href: "/notificaciones", label: "Notificaciones", icon: Bell }]
  }
];

const assistantGroups: readonly NavigationGroup[] = [
  {
    label: "Trabajo diario",
    items: [
      { href: "/", label: "Inicio", icon: LayoutDashboard },
      {
        href: ASSISTANT_MONITORINGS_HREF,
        label: "Mi agenda",
        icon: CalendarDays,
        search: { key: "tab", value: "proximas", defaultActive: true }
      },
      {
        href: "/agenda-abierta",
        label: "Agenda abierta",
        shortLabel: "Abierta",
        icon: Hand,
        search: { key: "vista", value: "todas", defaultActive: true }
      },
      {
        href: "/agenda-abierta?vista=postulaciones",
        label: "Mis postulaciones",
        shortLabel: "Postulaciones",
        icon: ClipboardList,
        search: { key: "vista", value: "postulaciones" }
      }
    ]
  },
  {
    label: "Registros",
    items: [
      {
        href: "/mi-agenda?tab=historico",
        label: "Horas e historial",
        icon: History,
        search: { key: "tab", value: "historico" }
      },
      { href: "/grabaciones", label: "Grabaciones", icon: FileVideo2 }
    ]
  },
  {
    label: "Personal",
    items: [{ href: "/notificaciones", label: "Notificaciones", icon: Bell }]
  }
];

const mobilePrimary: Readonly<Record<RolUsuario, readonly NavigationItem[]>> = {
  ADMINISTRACION: [adminGroups[0].items[0], adminGroups[0].items[1], createMeeting, adminGroups[0].items[3]],
  DOCENTE: [teacherGroups[0].items[0], teacherGroups[0].items[1], createMeeting, teacherGroups[0].items[3]],
  ASISTENTE_TECNICO: assistantGroups[0].items
};

export function getNavigationForRole(role: RolUsuario): RoleNavigation {
  const groups =
    role === "ADMINISTRACION" ? adminGroups : role === "DOCENTE" ? teacherGroups : assistantGroups;

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
  if (route === "/mi-agenda" && pathname === route && searchParams.get("tab") === "mes") {
    return item.search?.value === "proximas";
  }
  if (route === "/reuniones" && pathname.startsWith("/reuniones/")) {
    return !pathname.startsWith("/reuniones/nueva") && item.search?.value === "series";
  }
  if (route === "/mi-agenda" && pathname.startsWith("/operacion/")) {
    return item.search?.value === "proximas";
  }
  if (route === "/mis-clases" && pathname.startsWith("/reuniones/")) {
    return !pathname.startsWith("/reuniones/nueva");
  }
  const routeActive = pathname === route || (!exact && route !== "/" && pathname.startsWith(`${route}/`));
  if (!routeActive || !item.search) {
    return routeActive;
  }

  const queryValue = searchParams.get(item.search.key);
  return queryValue === item.search.value || (queryValue === null && item.search.defaultActive === true);
}
