import type { UsuarioAutenticado } from "./credentials.domain";

export type PerfilGoogle = Readonly<{
  subject: string;
  email: string;
  emailVerificado: boolean;
}>;

export type CuentaGoogleVinculada = Readonly<{
  providerAccountId: string;
  email: string;
  usuario: UsuarioAutenticado &
    Readonly<{
      activo: boolean;
      fusionadoEnId: string | null;
    }>;
}>;

export function evaluarAccesoGoogle(
  perfil: PerfilGoogle,
  cuenta: CuentaGoogleVinculada | null
): UsuarioAutenticado | null {
  const email = perfil.email.trim().toLowerCase();
  if (
    !perfil.emailVerificado ||
    !email.endsWith("@flacso.edu.uy") ||
    !cuenta ||
    cuenta.providerAccountId !== perfil.subject ||
    cuenta.email.trim().toLowerCase() !== email ||
    !cuenta.usuario.activo ||
    cuenta.usuario.fusionadoEnId
  ) {
    return null;
  }

  return {
    id: cuenta.usuario.id,
    rol: cuenta.usuario.rol,
    nombre: cuenta.usuario.nombre,
    email: cuenta.usuario.email
  };
}
