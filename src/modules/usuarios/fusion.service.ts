import type { PrismaClient } from "@prisma/client";
import {
  planificarFusionDocentes,
  type ErrorFusionDocentes,
  type UsuarioParaFusion
} from "./fusion.domain";

export type FusionarDocentesInput = {
  readonly usuarioOrigenId: string;
  readonly usuarioDestinoId: string;
  readonly ejecutadaPorId: string;
  readonly motivo?: string;
};

export type DependenciasFusionDocentes = Readonly<{
  db: PrismaClient;
  ahora: () => Date;
}>;

const MENSAJES_ERROR: Readonly<Record<ErrorFusionDocentes, string>> = Object.freeze({
  ACTOR_NO_AUTORIZADO: "Solo un usuario de administracion activo puede fusionar docentes.",
  MISMO_USUARIO: "Los usuarios de origen y destino deben ser distintos.",
  ORIGEN_NO_DISPONIBLE: "El usuario de origen ya esta inactivo o fue fusionado.",
  DESTINO_NO_DISPONIBLE: "El usuario de destino no esta activo.",
  ROL_NO_DOCENTE: "La fusion esta permitida solamente entre usuarios docentes.",
  PERFIL_DOCENTE_FALTANTE: "Ambos usuarios deben tener un perfil docente."
});

export async function fusionarUsuariosDocentes(
  dependencias: DependenciasFusionDocentes,
  input: FusionarDocentesInput
): Promise<Readonly<{ usuarioId: string; fusionId: string }>> {
  const { db, ahora } = dependencias;

  return db.$transaction(async (tx) => {
    const [actor, origen, destino] = await Promise.all([
      tx.usuario.findUnique({
        where: { id: input.ejecutadaPorId },
        select: { id: true, rol: true, activo: true }
      }),
      tx.usuario.findUnique({
        where: { id: input.usuarioOrigenId },
        include: {
          persona: { include: { docentes: { include: { programas: true } } } },
          emailAliases: true,
          cuentasGoogle: true
        }
      }),
      tx.usuario.findUnique({
        where: { id: input.usuarioDestinoId },
        include: {
          persona: { include: { docentes: { include: { programas: true } } } }
        }
      })
    ]);

    if (!actor || !origen || !destino) {
      throw new Error("No se encontro el actor, el usuario de origen o el usuario de destino.");
    }
    const docenteOrigen = origen.persona.docentes[0];
    const docenteDestino = destino.persona.docentes[0];
    const adaptarUsuario = (
      usuario: typeof origen | typeof destino,
      docente: typeof docenteOrigen | typeof docenteDestino
    ): UsuarioParaFusion => ({
      id: usuario.id,
      rol: usuario.rol,
      activo: usuario.activo,
      fusionadoEnId: usuario.fusionadoEnId,
      docenteId: docente?.id ?? null,
      programas: docente?.programas ?? [],
      emailPrincipal: usuario.emailPrincipal,
      aliases: "emailAliases" in usuario ? usuario.emailAliases.map((item) => item.email) : []
    });
    const plan = planificarFusionDocentes(
      { rol: actor.rol, activo: actor.activo },
      adaptarUsuario(origen, docenteOrigen),
      adaptarUsuario(destino, docenteDestino)
    );
    if (!plan.ok) {
      throw new Error(MENSAJES_ERROR[plan.error]);
    }

    for (const accion of plan.valor.accionesProgramas) {
      if (accion.tipo === "COMBINAR_ASOCIACION") {
        await tx.solicitudSala.updateMany({
          where: { docenteProgramaId: accion.asociacionOrigenId },
          data: { docenteProgramaId: accion.asociacionDestinoId }
        });
        await tx.docentePrograma.delete({ where: { id: accion.asociacionOrigenId } });
      } else {
        await tx.docentePrograma.update({
          where: { id: accion.asociacionOrigenId },
          data: { docenteId: accion.docenteDestinoId }
        });
      }
    }

    await tx.cuentaGoogleFlacso.updateMany({
      where: { userId: origen.id },
      data: { userId: destino.id }
    });
    await tx.usuarioEmailAlias.updateMany({
      where: { usuarioId: origen.id },
      data: { usuarioId: destino.id }
    });
    if (plan.valor.emailPrincipalComoAlias) {
      await tx.usuarioEmailAlias.upsert({
        where: { email: plan.valor.emailPrincipalComoAlias },
        create: {
          usuarioId: destino.id,
          email: plan.valor.emailPrincipalComoAlias
        },
        update: { usuarioId: destino.id }
      });
    }
    await tx.solicitudSala.updateMany({
      where: { creadaPorUsuarioId: origen.id },
      data: { creadaPorUsuarioId: destino.id }
    });
    await tx.sesionUsuario.deleteMany({ where: { userId: origen.id } });
    await tx.authenticator.deleteMany({ where: { userId: origen.id } });

    const fusion = await tx.usuarioFusion.create({
      data: {
        usuarioOrigenId: origen.id,
        usuarioDestinoId: destino.id,
        ejecutadaPorId: actor.id,
        motivo: input.motivo,
        snapshotOrigen: {
          id: origen.id,
          personaId: origen.personaId,
          emailPrincipal: origen.emailPrincipal,
          aliases: origen.emailAliases.map((item) => item.email),
          cuentasGoogle: origen.cuentasGoogle.map((item) => item.email)
        }
      }
    });

    await tx.usuario.update({
      where: { id: origen.id },
      data: {
        activo: false,
        fusionadoEnId: destino.id,
        fusionadoAt: ahora(),
        emailPrincipal: null
      }
    });

    await tx.auditoria.create({
      data: {
        actorUsuarioId: actor.id,
        accion: "USUARIOS_DOCENTES_FUSIONADOS",
        entidadTipo: "Usuario",
        entidadId: destino.id,
        valorAnterior: { usuarioOrigenId: origen.id },
        valorNuevo: { usuarioDestinoId: destino.id, fusionId: fusion.id }
      }
    });

    return { usuarioId: destino.id, fusionId: fusion.id };
  });
}
