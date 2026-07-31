import { db } from "@/src/lib/db";
import {
  evaluarAccesoGoogle,
  type PerfilGoogle
} from "@/src/modules/usuarios/google-login.domain";

export async function resolverUsuarioGoogle(perfil: PerfilGoogle) {
  const cuenta = await db.cuentaGoogleFlacso.findUnique({
    where: { email: perfil.email.trim().toLowerCase() },
    select: {
      id: true,
      providerAccountId: true,
      email: true,
      user: {
        select: {
          id: true,
          rol: true,
          debeCambiarPassword: true,
          activo: true,
          fusionadoEnId: true,
          emailPrincipal: true,
          nombres: true,
          apellidos: true
        }
      }
    }
  });
  const usuario = cuenta
    ? {
        providerAccountId: cuenta.providerAccountId,
        email: cuenta.email,
        usuario: {
          id: cuenta.user.id,
          rol: cuenta.user.rol,
          debeCambiarPassword: cuenta.user.debeCambiarPassword,
          activo: cuenta.user.activo,
          fusionadoEnId: cuenta.user.fusionadoEnId,
          nombre: [cuenta.user.nombres, cuenta.user.apellidos]
            .filter(Boolean)
            .join(" "),
          email: cuenta.user.emailPrincipal
        }
      }
    : null;

  const autenticado = evaluarAccesoGoogle(perfil, usuario);
  if (autenticado && cuenta && !cuenta.providerAccountId) {
    await db.cuentaGoogleFlacso.update({
      where: { id: cuenta.id },
      data: {
        providerAccountId: perfil.subject,
        emailVerificadoAt: new Date(),
        ultimoAccesoAt: new Date()
      }
    });
  } else if (autenticado && cuenta) {
    await db.cuentaGoogleFlacso.update({
      where: { id: cuenta.id },
      data: { ultimoAccesoAt: new Date() }
    });
  }

  return autenticado;
}
