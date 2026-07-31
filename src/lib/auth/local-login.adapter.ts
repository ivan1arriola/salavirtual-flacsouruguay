import { compare } from "bcryptjs";
import { db } from "@/src/lib/db";
import type { DependenciasLogin } from "@/src/modules/usuarios/credentials.service";

export const dependenciasLoginLocal: DependenciasLogin = Object.freeze({
  buscarUsuario: async (usuarioId) => {
    const usuario = await db.usuario.findUnique({
      where: { id: usuarioId },
      select: {
        id: true,
        passwordHash: true,
        debeCambiarPassword: true,
        rol: true,
        activo: true,
        fusionadoEnId: true,
        emailPrincipal: true,
        nombres: true,
        apellidos: true
      }
    });
    if (!usuario) {
      return null;
    }

    const nombre = [usuario.nombres, usuario.apellidos]
      .filter(Boolean)
      .join(" ");

    return {
      id: usuario.id,
      passwordHash: usuario.passwordHash,
      debeCambiarPassword: usuario.debeCambiarPassword,
      rol: usuario.rol,
      activo: usuario.activo,
      fusionadoEnId: usuario.fusionadoEnId,
      nombre: nombre || null,
      email: usuario.emailPrincipal
    };
  },
  verificarPassword: compare,
  registrarAcceso: async (usuarioId) => {
    await db.usuario.update({
      where: { id: usuarioId },
      data: {
        ultimoAccesoAt: new Date(),
        ultimoProveedor: "credentials"
      }
    });
  }
});
