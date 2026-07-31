import { db } from "@/src/lib/db";
import {
  evaluarAccesoGoogle,
  type PerfilGoogle
} from "@/src/modules/usuarios/google-login.domain";

export async function resolverUsuarioGoogle(perfil: PerfilGoogle) {
  const cuenta = await db.cuentaGoogleFlacso.findUnique({
    where: { providerAccountId: perfil.subject },
    select: {
      providerAccountId: true,
      email: true,
      user: {
        select: {
          id: true,
          rol: true,
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
          activo: cuenta.user.activo,
          fusionadoEnId: cuenta.user.fusionadoEnId,
          nombre: [cuenta.user.nombres, cuenta.user.apellidos]
            .filter(Boolean)
            .join(" "),
          email: cuenta.user.emailPrincipal
        }
      }
    : null;

  return evaluarAccesoGoogle(perfil, usuario);
}
