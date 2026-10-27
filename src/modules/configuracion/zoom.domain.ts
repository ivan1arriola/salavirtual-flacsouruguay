import { z } from "zod";

/**
 * Credenciales de una app Server-to-Server OAuth de Zoom.
 * El secreto es opcional al actualizar: si se omite se conserva el guardado.
 */
export const configuracionZoomSchema = z.object({
  accountId: z.string().trim().min(10, "El Account ID de Zoom no es válido.").max(64),
  clientId: z.string().trim().min(10, "El Client ID de Zoom no es válido.").max(64),
  clientSecret: z.string().trim().max(128).optional().transform((value) => value || undefined),
  activa: z.boolean().default(true),
});

export type ConfiguracionZoomInput = Readonly<z.infer<typeof configuracionZoomSchema>>;

/** Scopes granulares que la app de Zoom debe tener habilitados. */
export const ZOOM_SCOPES_REQUERIDOS = [
  "meeting:write:meeting:admin",
  "meeting:read:meeting:admin",
  "meeting:update:meeting:admin",
  "meeting:delete:meeting:admin",
  "meeting:read:past_meeting:admin",
  "meeting:read:list_past_instances:admin",
  "user:read:list_users:admin",
  "user:read:user:admin",
  "report:read:list_meeting_participants:admin",
  "cloud_recording:read:list_recording_files:admin",
] as const;

/** Opcional: participantes en vivo en la consola (plan Business o superior). */
export const ZOOM_SCOPES_OPCIONALES = [
  "dashboard:read:list_meeting_participants:admin",
] as const;

export type EstadoConfiguracionZoom = Readonly<{
  accountId: string | null;
  clientId: string | null;
  secretoConfigurado: boolean;
  activa: boolean;
  version: number;
  updatedAt: Date | null;
}>;
