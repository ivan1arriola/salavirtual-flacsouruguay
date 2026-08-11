import { compare } from "bcryptjs";
import { db } from "@/src/lib/db";
import { esCorreoAcceso } from "@/src/modules/usuarios/credentials.domain";
import type { DependenciasLogin } from "@/src/modules/usuarios/credentials.service";
import { registrarInicioSesionUsuario } from "@/src/modules/usuarios/estado-asistente.service";

const loginSelect = {
  id: true,
  passwordHash: true,
  debeCambiarPassword: true,
  rol: true,
  activo: true,
  fusionadoEnId: true,
  emailPrincipal: true,
  nombres: true,
  apellidos: true
} as const;

export const dependenciasLoginLocal: DependenciasLogin = Object.freeze({
  buscarUsuario: async (identificador) => {
    const usuarioPorId = await db.usuario.findUnique({
      where: { id: identificador },
      select: loginSelect
    });
    const usuario = usuarioPorId ?? (esCorreoAcceso(identificador)
      ? await db.usuario.findFirst({
          where: {
            OR: [
              { emailPrincipal: { equals: identificador, mode: "insensitive" } },
              { emailAliases: { some: { email: { equals: identificador, mode: "insensitive" } } } },
              { cuentasGoogle: { some: { email: { equals: identificador, mode: "insensitive" } } } }
            ]
          },
          select: loginSelect
        })
      : null);
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
    await registrarInicioSesionUsuario(db, usuarioId, "credentials");
  }
});
