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
    icon: "workspace"
  },
  {
    id: "zoom",
    label: "Zoom",
    description: "Credenciales OAuth y configuración",
    icon: "zoom"
  },
  {
    id: "salas",
    label: "Salas",
    description: "Cuentas que alojan reuniones",
    icon: "rooms"
  },
  {
    id: "asistencia",
    label: "Monitoreo",
    description: "Reportes mensuales y destinatarios",
    icon: "assistance"
  },
  {
    id: "correo",
    label: "Correo",
    description: "Prueba de invitaciones y avisos",
    icon: "email"
  },
  {
    id: "historico",
    label: "Histórico Zoom",
    description: "Registros anteriores de consulta",
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
  availableHosts: number;
  integrationActive: boolean;
  pendingOperations: number;
  workspaceReady: boolean;
}>;

export function settingsNeedsAttention(input: SettingsAttentionInput) {
  return (
    input.pendingOperations > 0 ||
    !input.workspaceReady ||
    !input.integrationActive ||
    input.availableHosts === 0
  );
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
