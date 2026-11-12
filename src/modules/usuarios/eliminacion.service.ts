import type { PrismaClient } from "@prisma/client";

type ActorAdministrativo = {
  id: string;
  rol: string;
  activo: boolean;
};

export async function eliminarUsuarioCompleto(
  db: PrismaClient,
  actor: ActorAdministrativo,
  usuarioId: string,
  confirmacion: string
): Promise<void> {
  const id = usuarioId.trim();
  if (!id) {
    throw new Error("El usuario es obligatorio.");
  }
  if (confirmacion.trim() !== "ELIMINAR") {
    throw new Error("La confirmación de eliminación no es válida.");
  }
  if (!actor.activo || actor.rol !== "ADMINISTRACION") {
    throw new Error("No tenés permisos para eliminar usuarios.");
  }
  if (actor.id === id) {
    throw new Error("No podés eliminar tu propia cuenta.");
  }

  await db.$transaction(async (tx) => {
    const [actorActual, usuario] = await Promise.all([
      tx.usuario.findUnique({
        where: { id: actor.id },
        select: { id: true, rol: true, activo: true }
      }),
      tx.usuario.findUnique({
        where: { id },
        select: {
          id: true,
          rol: true,
          emailPrincipal: true,
          docente: { select: { id: true } },
          asistenteTecnico: { select: { id: true } },
          cuentasGoogle: { select: { id: true, email: true } }
        }
      })
    ]);

    if (!actorActual?.activo || actorActual.rol !== "ADMINISTRACION") {
      throw new Error("No tenés permisos para eliminar usuarios.");
    }
    if (!usuario) {
      throw new Error("El usuario ya no existe.");
    }

    const cuentaGoogleIds = usuario.cuentasGoogle.map(({ id: cuentaId }) => cuentaId);
    const emails = Array.from(
      new Set(
        [usuario.emailPrincipal, ...usuario.cuentasGoogle.map(({ email }) => email)].filter(
          (email): email is string => Boolean(email)
        )
      )
    );

    if (cuentaGoogleIds.length) {
      await tx.cohostReunion.deleteMany({
        where: { cuentaGoogleId: { in: cuentaGoogleIds } }
      });
    }

    let docenteProgramaIds: string[] = [];
    if (usuario.docente) {
      const docenteProgramas = await tx.docentePrograma.findMany({
        where: { docenteId: usuario.docente.id },
        select: { id: true }
      });
      docenteProgramaIds = docenteProgramas.map(({ id: docenteProgramaId }) => docenteProgramaId);
    }

    const solicitudes = await tx.solicitudSala.findMany({
      where: {
        OR: [
          { creadaPorUsuarioId: id },
          ...(docenteProgramaIds.length ? [{ docenteProgramaId: { in: docenteProgramaIds } }] : [])
        ]
      },
      select: { id: true }
    });
    const solicitudIds = solicitudes.map(({ id: solicitudId }) => solicitudId);

    if (solicitudIds.length) {
      const instancias = await tx.instanciaSala.findMany({
        where: { solicitudSalaId: { in: solicitudIds } },
        select: { id: true }
      });
      const instanciaIds = instancias.map(({ id: instanciaId }) => instanciaId);

      if (instanciaIds.length) {
        await tx.detalleLiquidacionAsistenciaTecnica.deleteMany({
          where: { instanciaSalaId: { in: instanciaIds } }
        });
      }

      await tx.solicitudSala.deleteMany({
        where: { id: { in: solicitudIds } }
      });
    }

    if (usuario.asistenteTecnico) {
      const asistenteTecnicoId = usuario.asistenteTecnico.id;
      const [asignaciones, liquidaciones] = await Promise.all([
        tx.asignacionAsistenciaTecnica.findMany({
          where: { asistenteTecnicoId },
          select: { id: true }
        }),
        tx.liquidacionAsistenciaTecnica.findMany({
          where: { asistenteTecnicoId },
          select: { id: true }
        })
      ]);
      const asignacionIds = asignaciones.map(({ id: asignacionId }) => asignacionId);
      const liquidacionIds = liquidaciones.map(({ id: liquidacionId }) => liquidacionId);

      if (asignacionIds.length || liquidacionIds.length) {
        await tx.detalleLiquidacionAsistenciaTecnica.deleteMany({
          where: {
            OR: [
              ...(asignacionIds.length ? [{ asignacionAsistenciaTecnicaId: { in: asignacionIds } }] : []),
              ...(liquidacionIds.length ? [{ liquidacionAsistenciaTecnicaId: { in: liquidacionIds } }] : [])
            ]
          }
        });
      }

      if (liquidacionIds.length) {
        await tx.liquidacionAsistenciaTecnica.deleteMany({
          where: { id: { in: liquidacionIds } }
        });
      }
      if (asignacionIds.length) {
        await tx.asignacionAsistenciaTecnica.deleteMany({
          where: { id: { in: asignacionIds } }
        });
      }
      await tx.asistenteTecnico.delete({ where: { id: asistenteTecnicoId } });
    }

    if (usuario.docente) {
      if (docenteProgramaIds.length) {
        await tx.docentePrograma.deleteMany({
          where: { id: { in: docenteProgramaIds } }
        });
      }
      await tx.docente.delete({ where: { id: usuario.docente.id } });
    }

    await tx.usuarioFusion.deleteMany({
      where: {
        OR: [{ usuarioOrigenId: id }, { usuarioDestinoId: id }, { ejecutadaPorId: id }]
      }
    });
    await tx.usuario.updateMany({
      where: { fusionadoEnId: id },
      data: { fusionadoEnId: null, fusionadoAt: null }
    });

    await tx.configuracionGoogleWorkspace.updateMany({
      where: { actualizadaPorId: id },
      data: { actualizadaPorId: actorActual.id }
    });

    if (emails.length) {
      await Promise.all([
        tx.tokenVerificacion.deleteMany({ where: { identifier: { in: emails } } }),
        tx.solicitudAccesoGoogle.deleteMany({ where: { email: { in: emails } } })
      ]);
    }

    await tx.auditoria.create({
      data: {
        actorUsuarioId: actorActual.id,
        accion: "USUARIO_ELIMINADO",
        entidadTipo: "Usuario",
        entidadId: id,
        valorAnterior: { rol: usuario.rol }
      }
    });

    await tx.usuario.delete({ where: { id } });
  });
}
