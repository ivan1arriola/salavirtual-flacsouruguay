export const SETTINGS_SECTION_IDS = [
  "resumen",
  "workspace",
  "zoom",
  "salas",
  "programas",
  "asistencia",
  "correo",
  "historico"
] as const;

export type SettingsSection = (typeof SETTINGS_SECTION_IDS)[number];

export type SettingsSectionMetadata = Readonly<{
  id: SettingsSection;
  label: string;
  description: string;
  group?: "Integraciones" | "Operación" | "Comunicación" | "Datos";
  icon: "overview" | "workspace" | "zoom" | "rooms" | "programs" | "assistance" | "email" | "history";
}>;

export const SETTINGS_SECTIONS: readonly SettingsSectionMetadata[] = [
  {
    id: "resumen",
    label: "Resumen",
    description: "Estado general y tareas pendientes",
    icon: "overview"
  },
  {
    id: "workspace",
    label: "Google Workspace",
    description: "Integración, permisos y archivos",
    group: "Integraciones",
    icon: "workspace"
  },
  {
    id: "zoom",
    label: "Zoom",
    description: "Credenciales OAuth y configuración",
    group: "Integraciones",
    icon: "zoom"
  },
  {
    id: "salas",
    label: "Salas",
    description: "Cuentas de Zoom y Meet que alojan reuniones",
    group: "Operación",
    icon: "rooms"
  },
  {
    id: "asistencia",
    label: "Monitoreo",
    description: "Reportes mensuales y destinatarios",
    group: "Operación",
    icon: "assistance"
  },
  {
    id: "correo",
    label: "Correo",
    description: "Prueba de invitaciones y avisos",
    group: "Comunicación",
    icon: "email"
  },
  {
    id: "historico",
    label: "Registros Zoom importados",
    description: "Reuniones importadas disponibles para consulta",
    group: "Datos",
    icon: "history"
  }
];

export function resolveSettingsSection(value?: string): SettingsSection {
  return SETTINGS_SECTION_IDS.includes(value as SettingsSection) ? (value as SettingsSection) : "resumen";
}

export function settingsHref(section: SettingsSection) {
  if (section === "programas") {
    return "/usuarios?vista=programas";
  }
  return section === "resumen" ? "/configuracion" : `/configuracion?seccion=${section}`;
}

export function legacySettingsRedirect(section?: string): string | null {
  return section === "programas" ? "/usuarios?vista=programas" : null;
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
