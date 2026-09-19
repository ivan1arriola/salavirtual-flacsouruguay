export const ROLES_USUARIO = [
  "ADMINISTRACION",
  "ASISTENTE_TECNICO",
  "DOCENTE"
] as const;

export type RolUsuario = (typeof ROLES_USUARIO)[number];

export type UsuarioCredenciales = Readonly<{
  id: string;
  passwordHash: string | null;
  debeCambiarPassword: boolean;
  rol: RolUsuario;
  activo: boolean;
  fusionadoEnId: string | null;
  nombre: string | null;
  email: string | null;
}>;

export type UsuarioAutenticado = Readonly<{
  id: string;
  rol: RolUsuario;
  nombre: string | null;
  email: string | null;
  debeCambiarPassword: boolean;
}>;

export type PerfilGoogle = Readonly<{
  subject: string;
  email: string;
  emailVerificado: boolean;
  nombre?: string | null;
  nombres?: string | null;
  apellidos?: string | null;
}>;

export type CuentaGoogleVinculada = Readonly<{
  providerAccountId: string | null;
  email: string;
  usuario: UsuarioAutenticado &
    Readonly<{
      activo: boolean;
      fusionadoEnId: string | null;
    }>;
}>;

export type AuthConfig = Readonly<{
  secret: string;
  trustHost: boolean;
  baseUrl: string;
  google: Readonly<{
    clientId: string;
    clientSecret: string;
  }> | null;
}>;
