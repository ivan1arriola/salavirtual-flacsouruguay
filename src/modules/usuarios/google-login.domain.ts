import type { UsuarioAutenticado } from "./credentials.domain";

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

export function evaluarAccesoGoogle(
  perfil: PerfilGoogle,
  cuenta: CuentaGoogleVinculada | null
): UsuarioAutenticado | null {
  const email = perfil.email.trim().toLowerCase();
  if (
    !esPerfilGoogleVerificado(perfil) ||
    !cuenta ||
    (cuenta.providerAccountId !== null && cuenta.providerAccountId !== perfil.subject) ||
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
    email: cuenta.usuario.email,
    debeCambiarPassword: cuenta.usuario.debeCambiarPassword
  };
}

export function esPerfilGoogleVerificado(perfil: PerfilGoogle): boolean {
  return Boolean(perfil.subject.trim()) &&
    perfil.emailVerificado &&
    Boolean(perfil.email.trim());
}

export function esPerfilGoogleInstitucional(perfil: PerfilGoogle): boolean {
  return esPerfilGoogleVerificado(perfil) &&
    perfil.email.trim().toLowerCase().endsWith("@flacso.edu.uy");
}

export function resolverVinculacionSubjectGoogle(
  subjectActual: string | null,
  subjectEntrante: string,
  subjectPerteneceAOtraCuenta: boolean
): "MANTENER" | "REVINCULAR" | "RECHAZAR" {
  if (subjectPerteneceAOtraCuenta) return "RECHAZAR";
  return subjectActual === subjectEntrante ? "MANTENER" : "REVINCULAR";
}
