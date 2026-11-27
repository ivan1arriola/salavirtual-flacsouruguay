import type { PrismaClient } from "@prisma/client";
import {
  cambiarRolUsuarioSchema,
  puedeGestionarRoles,
  requierePerfilAsistente,
  requierePerfilDocente,
  type ActorGestionRoles,
} from "./gestion-roles.domain";
import type { RolUsuario } from "./roles";
import { crearSlugAsistenteDisponible } from "../asistencia/asistente-slug.adapter";

export async function cambiarRolUsuario(
  db: PrismaClient,
  actor: ActorGestionRoles,
  usuarioId: string,
  input: unknown,
): Promise<RolUsuario> {
  if (!puedeGestionarRoles(actor)) {
    throw new Error("Solo Administracion puede cambiar roles.");
  }
  const { rol } = cambiarRolUsuarioSchema.parse(input);

  return db.$transaction(async (tx) => {
    const actorActual = await tx.usuario.findUnique({
      where: { id: actor.id },
      select: { id: true, rol: true, activo: true },
    });
    if (!actorActual || !puedeGestionarRoles(actorActual)) {
      throw new Error("La sesion ya no tiene permisos de administracion.");
    }

    const usuario = await tx.usuario.findUnique({
      where: { id: usuarioId },
      select: {
        id: true,
        nombres: true,
        apellidos: true,
        rol: true,
        docente: { select: { id: true } },
        asistenteTecnico: { select: { id: true } },
      },
    });
    if (!usuario) {
      throw new Error("Usuario no encontrado.");
    }
    if (usuario.id === actorActual.id && rol !== "ADMINISTRACION") {
      throw new Error("No podes quitar tu propio rol de Administracion.");
    }
    if (usuario.rol === "ADMINISTRACION" && rol !== "ADMINISTRACION") {
      const administradoresActivos = await tx.usuario.count({
        where: { rol: "ADMINISTRACION", activo: true },
      });
      if (administradoresActivos <= 1) {
        throw new Error("Debe quedar al menos un usuario de Administracion activo.");
      }
    }

    if (requierePerfilDocente(rol) && !usuario.docente) {
      await tx.docente.create({ data: { usuarioId: usuario.id } });
    }
    if (requierePerfilAsistente(rol) && !usuario.asistenteTecnico) {
      const name = [usuario.nombres, usuario.apellidos].filter(Boolean).join(" ");
      const slug = await crearSlugAsistenteDisponible(tx, name, usuario.id);
      await tx.asistenteTecnico.create({ data: { usuarioId: usuario.id, slug } });
    }
    if (rol !== "ASISTENTE_TECNICO" && usuario.asistenteTecnico) {
      await tx.asistenteTecnico.update({
        where: { id: usuario.asistenteTecnico.id },
        data: { cesadoHastaProximoInicioSesion: false },
      });
    }

    await tx.usuario.update({ where: { id: usuario.id }, data: { rol } });
    await tx.auditoria.create({
      data: {
        actorUsuarioId: actorActual.id,
        accion: "ROL_USUARIO_CAMBIADO",
        entidadTipo: "Usuario",
        entidadId: usuario.id,
        valorAnterior: { rol: usuario.rol },
        valorNuevo: { rol },
      },
    });

    return rol;
  });
}
