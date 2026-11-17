export const SETTINGS_SECTION_IDS = [
  "resumen",
  "zoom",
  "google",
  "salas",
  "correo",
  "notificaciones",
  "historico"
] as const;

export type SettingsSection = (typeof SETTINGS_SECTION_IDS)[number];

export type SettingsSectionMetadata = Readonly<{
  id: SettingsSection;
  label: string;
  description: string;
  group?: "Integraciones" | "Operación" | "Comunicación";
  /** No aparece en el menú; se llega por un enlace. */
  hidden?: true;
  icon: "overview" | "workspace" | "zoom" | "rooms" | "programs" | "assistance" | "email" | "history";
}>;

export const SETTINGS_SECTIONS: readonly SettingsSectionMetadata[] = [
  { id: "resumen", label: "Resumen", description: "Estado general y tareas pendientes", icon: "overview" },
  {
    id: "zoom",
    label: "Zoom",
    description: "Conexión, grupo de cuentas, avisos y agenda",
    group: "Integraciones",
    icon: "zoom"
  },
  {
    id: "google",
    label: "Google",
    description: "Cuenta de servicio, delegación y Drive",
    group: "Integraciones",
    icon: "workspace"
  },
  {
    id: "salas",
    label: "Salas",
    description: "Cuentas de Zoom que alojan reuniones",
    group: "Operación",
    icon: "rooms"
  },
  {
    id: "correo",
    label: "Correo",
    description: "Envío de invitaciones y avisos",
    group: "Comunicación",
    icon: "email"
  },
  {
    id: "notificaciones",
    label: "Notificaciones",
    description: "Reportes mensuales y destinatarios",
    group: "Comunicación",
    icon: "assistance"
  },
  {
    id: "historico",
    label: "Registros Zoom importados",
    description: "Reuniones importadas disponibles para consulta",
    hidden: true,
    icon: "history"
  }
];

export function resolveSettingsSection(value?: string): SettingsSection {
  return SETTINGS_SECTION_IDS.includes(value as SettingsSection) ? (value as SettingsSection) : "resumen";
}

export function settingsHref(section: SettingsSection) {
  return section === "resumen" ? "/configuracion" : `/configuracion/${section}`;
}

const LEGACY_SECTION_ROUTES: Readonly<Record<string, string>> = {
  workspace: "/configuracion/google",
  asistencia: "/configuracion/notificaciones",
  zoom: "/configuracion/zoom",
  salas: "/configuracion/salas",
  correo: "/configuracion/correo",
  historico: "/configuracion/historico",
  programas: "/usuarios?vista=programas"
};

/** Enlaces viejos `/configuracion?seccion=…`; conservan la búsqueda del histórico. */
export function legacySettingsRedirect(
  section?: string,
  params: Readonly<{ busqueda?: string; pagina?: string }> = {}
): string | null {
  const ruta = section ? LEGACY_SECTION_ROUTES[section] : undefined;
  if (!ruta) {
    return null;
  }
  if (section !== "historico") {
    return ruta;
  }
  const query = new URLSearchParams();
  if (params.busqueda) query.set("busqueda", params.busqueda);
  if (params.pagina) query.set("pagina", params.pagina);
  return query.size ? `${ruta}?${query}` : ruta;
}

export type SettingsAttentionInput = Readonly<{
  zoomAvailableHosts: number;
  zoomCredentialsAvailable: boolean;
}>;

export function settingsNeedsAttention(input: SettingsAttentionInput) {
  return !input.zoomCredentialsAvailable || input.zoomAvailableHosts === 0;
}

export type WorkspaceReadinessInput = Readonly<{
  serviceAccountEmail: string | null;
  privateKeyConfigurada: boolean;
  serviceAccountSubject: string | null;
  driveDestinationId: string | null;
  activa: boolean;
}>;

export function workspaceReadiness(input: WorkspaceReadinessInput) {
  const checks = [
    Boolean(input.serviceAccountEmail && input.privateKeyConfigurada),
    Boolean(input.serviceAccountSubject),
    Boolean(input.driveDestinationId),
    input.activa
  ];
  const readyCount = checks.filter(Boolean).length;
  return {
    readyCount,
    totalCount: checks.length,
    ready: readyCount === checks.length
  };
}
