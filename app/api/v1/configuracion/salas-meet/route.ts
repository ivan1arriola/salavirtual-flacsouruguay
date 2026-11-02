import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { cifrarConfiguracion, descifrarConfiguracion } from "@/src/lib/config/encryption";
import { db } from "@/src/lib/db";
import { notificarUsuarios } from "@/src/modules/notificaciones/notificaciones.service";

export const runtime = "nodejs";

const hostFields = z.object({
  nombre: z.string().trim().min(1, "El nombre es obligatorio.").max(100),
  email: z.string().trim().email("El correo de la sala no es válido.").transform((value) => value.toLowerCase()),
  prioridad: z.number().int().min(1).max(1000),
  limiteConcurrente: z.number().int().min(1).max(100).nullable(),
  tieneLicencia: z.boolean(),
  activa: z.boolean(),
  proveedorTipo: z.enum(["GOOGLE_MEET", "ZOOM"]).default("GOOGLE_MEET")
});

const passwordSchema = z.string().trim().min(8, "La contraseña debe tener al menos 8 caracteres.").max(200);

const createSchema = hostFields.extend({
  password: passwordSchema.optional()
}).superRefine(({ proveedorTipo, password, limiteConcurrente }, context) => {
  if (proveedorTipo === "GOOGLE_MEET" && !password) {
    context.addIssue({ code: "custom", path: ["password"], message: "La contraseña de la sala Meet es obligatoria." });
  }
  if (proveedorTipo === "ZOOM" && password) {
    context.addIssue({ code: "custom", path: ["password"], message: "Las salas Zoom usan el OAuth institucional y no necesitan contraseña individual." });
  }
  if (proveedorTipo === "ZOOM" && limiteConcurrente !== 1) {
    context.addIssue({ code: "custom", path: ["limiteConcurrente"], message: "Cada cuenta Zoom admite una sola reunión simultánea." });
  }
});

const updateSchema = hostFields.extend({
  id: z.string().min(1),
  password: z.union([z.literal(""), passwordSchema]).optional(),
  notificarCambioPassword: z.boolean().default(true)
}).superRefine(({ proveedorTipo, limiteConcurrente }, context) => {
  if (proveedorTipo === "ZOOM" && limiteConcurrente !== 1) {
    context.addIssue({ code: "custom", path: ["limiteConcurrente"], message: "Cada cuenta Zoom admite una sola reunión simultánea." });
  }
});

const deleteSchema = z.object({
  id: z.string().min(1)
});

type SafeHost = Readonly<{
  id: string;
  nombre: string;
  emailOrganizador: string | null;
  prioridad: number;
  limiteConcurrente: number | null;
  tieneLicencia: boolean;
  activa: boolean;
  passwordConfigurada: boolean;
  enUso: boolean;
}>;

export async function POST(request: Request) {
  const actor = await requireAdmin();
  if (actor instanceof NextResponse) return actor;

  try {
    const input = createSchema.parse(await request.json());
    const host = await db.$transaction(async (tx) => {
      const provider = await tx.proveedorReunion.upsert({
        where: { tipo: input.proveedorTipo },
        create: {
          tipo: input.proveedorTipo,
          nombre: input.proveedorTipo === "ZOOM" ? "Zoom" : "Google Meet",
          operativo: true,
          historico: false
        },
        update: { operativo: true, historico: false }
      });
      const duplicate = await tx.cuentaProveedor.findFirst({
        where: {
          proveedorId: provider.id,
          externalAccountId: input.email
        },
        select: { id: true }
      });
      if (duplicate) throw new Error(`Ya existe una cuenta ${input.proveedorTipo === "ZOOM" ? "Zoom" : "Meet"} con ese correo.`);

      const created = await tx.cuentaProveedor.create({
        data: {
          proveedorId: provider.id,
          nombre: input.nombre,
          emailOrganizador: input.email,
          externalAccountId: input.email,
          secretRef: input.password ? cifrarConfiguracion(input.password) : null,
          prioridad: input.prioridad,
          limiteConcurrente: input.limiteConcurrente,
          tieneLicencia: input.tieneLicencia,
          activa: input.activa
        }
      });
      await tx.auditoria.create({
        data: {
          actorUsuarioId: actor.id,
          accion: input.proveedorTipo === "ZOOM" ? "CUENTA_ZOOM_CREADA" : "CUENTA_MEET_CREADA",
          entidadTipo: "CuentaProveedor",
          entidadId: created.id,
          valorNuevo: {
            nombre: created.nombre,
            emailOrganizador: created.emailOrganizador,
            prioridad: created.prioridad,
            limiteConcurrente: created.limiteConcurrente,
            tieneLicencia: created.tieneLicencia,
            activa: created.activa,
            passwordConfigurada: Boolean(created.secretRef)
          }
        }
      });
      return created;
    });

    return NextResponse.json({ host: toSafeHost(host, false), message: `Sala ${input.proveedorTipo === "ZOOM" ? "Zoom" : "Meet"} agregada.` }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  const actor = await requireAdmin();
  if (actor instanceof NextResponse) return actor;

  try {
    const input = updateSchema.parse(await request.json());
    const result = await db.$transaction(async (tx) => {
      const current = await tx.cuentaProveedor.findUnique({
        where: { id: input.id },
        include: {
          proveedor: { select: { tipo: true } },
          _count: { select: { eventosProveedor: true } }
        }
      });
      if (!current || (current.proveedor.tipo !== "GOOGLE_MEET" && current.proveedor.tipo !== "ZOOM")) {
        throw new Error("La cuenta organizadora no existe.");
      }

      if (current.proveedor.tipo !== input.proveedorTipo) {
        throw new Error("La plataforma de una cuenta existente no se puede cambiar.");
      }
      if (current.proveedor.tipo === "ZOOM" && input.password) {
        throw new Error("Las salas Zoom usan el OAuth institucional y no necesitan contraseña individual.");
      }

      const emailChanged = current.emailOrganizador?.toLowerCase() !== input.email;
      if (emailChanged && current._count.eventosProveedor > 0) {
        throw new Error("Esta cuenta ya tiene reuniones asociadas. Para reemplazarla, desactivala y agregá una cuenta nueva.");
      }
      if (emailChanged) {
        const duplicate = await tx.cuentaProveedor.findFirst({
          where: {
            proveedorId: current.proveedorId,
            externalAccountId: input.email,
            id: { not: current.id }
          },
          select: { id: true }
        });
        if (duplicate) throw new Error(`Ya existe una cuenta ${input.proveedorTipo === "ZOOM" ? "Zoom" : "Meet"} con ese correo.`);
      }

      const password = input.password || null;
      let passwordChanged = false;
      if (password) {
        if (!current.secretRef) {
          passwordChanged = true;
        } else {
          try {
            passwordChanged = descifrarConfiguracion(current.secretRef) !== password;
          } catch {
            passwordChanged = true;
          }
        }
      }

      const updated = await tx.cuentaProveedor.update({
        where: { id: current.id },
        data: {
          nombre: input.nombre,
          emailOrganizador: input.email,
          externalAccountId: input.email,
          prioridad: input.prioridad,
          limiteConcurrente: input.limiteConcurrente,
          tieneLicencia: input.tieneLicencia,
          activa: input.activa,
          ...(passwordChanged && password ? { secretRef: cifrarConfiguracion(password) } : {})
        }
      });

      await tx.auditoria.create({
        data: {
          actorUsuarioId: actor.id,
          accion: passwordChanged ? "CUENTA_MEET_PASSWORD_ACTUALIZADA" : current.proveedor.tipo === "ZOOM" ? "CUENTA_ZOOM_ACTUALIZADA" : "CUENTA_MEET_ACTUALIZADA",
          entidadTipo: "CuentaProveedor",
          entidadId: current.id,
          valorAnterior: {
            nombre: current.nombre,
            emailOrganizador: current.emailOrganizador,
            prioridad: current.prioridad,
            limiteConcurrente: current.limiteConcurrente,
            tieneLicencia: current.tieneLicencia,
            activa: current.activa,
            passwordConfigurada: Boolean(current.secretRef)
          },
          valorNuevo: {
            nombre: updated.nombre,
            emailOrganizador: updated.emailOrganizador,
            prioridad: updated.prioridad,
            limiteConcurrente: updated.limiteConcurrente,
            tieneLicencia: updated.tieneLicencia,
            activa: updated.activa,
            passwordConfigurada: Boolean(updated.secretRef),
            passwordActualizada: passwordChanged
          }
        }
      });

      return {
        host: updated,
        enUso: current._count.eventosProveedor > 0,
        passwordChanged,
        password,
        proveedorTipo: current.proveedor.tipo
      };
    });

    let notificados = 0;
    if (result.passwordChanged && result.password && input.notificarCambioPassword) {
      notificados = await notificarCambioPassword(result.host.id, result.host.nombre, result.host.emailOrganizador, result.password);
    }

    const passwordMessage = !result.passwordChanged
      ? `Sala ${result.proveedorTipo === "ZOOM" ? "Zoom" : "Meet"} actualizada.`
      : !input.notificarCambioPassword
        ? "Sala actualizada. El cambio de contraseña se guardó sin enviar avisos."
        : notificados > 0
          ? `Sala actualizada. Se notificó a ${notificados} persona${notificados === 1 ? "" : "s"}.`
          : "Sala actualizada. No había personas con reuniones futuras para notificar.";

    return NextResponse.json({
      host: toSafeHost(result.host, result.enUso),
      notificados,
      message: passwordMessage
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  const actor = await requireAdmin();
  if (actor instanceof NextResponse) return actor;

  try {
    const input = deleteSchema.parse(await request.json());
    const now = new Date();
    const deleted = await db.$transaction(async (tx) => {
      const current = await tx.cuentaProveedor.findUnique({
        where: { id: input.id },
        include: {
          proveedor: { select: { tipo: true } },
          _count: { select: { eventosProveedor: true } }
        }
      });
      if (!current || (current.proveedor.tipo !== "GOOGLE_MEET" && current.proveedor.tipo !== "ZOOM")) {
        throw new Error("La cuenta organizadora no existe.");
      }

      const activeMeetings = await tx.eventoProveedor.count({
        where: {
          cuentaProveedorId: current.id,
          instancia: {
            finProgramadoAt: { gte: now },
            estado: { in: ["PROGRAMADA", "EN_CURSO"] }
          }
        }
      });
      if (activeMeetings > 0) {
        throw new Error(
          `No se puede eliminar porque tiene ${activeMeetings} encuentro${activeMeetings === 1 ? "" : "s"} futuro${activeMeetings === 1 ? "" : "s"} o en curso. Desactivala primero y reasigná esos encuentros.`
        );
      }

      await tx.cuentaProveedor.delete({ where: { id: current.id } });
      await tx.auditoria.create({
        data: {
          actorUsuarioId: actor.id,
          accion: current.proveedor.tipo === "ZOOM" ? "CUENTA_ZOOM_ELIMINADA" : "CUENTA_MEET_ELIMINADA",
          entidadTipo: "CuentaProveedor",
          entidadId: current.id,
          valorAnterior: {
            nombre: current.nombre,
            emailOrganizador: current.emailOrganizador,
            prioridad: current.prioridad,
            limiteConcurrente: current.limiteConcurrente,
            tieneLicencia: current.tieneLicencia,
            activa: current.activa,
            passwordConfigurada: Boolean(current.secretRef),
            encuentrosHistoricosDesvinculados: current._count.eventosProveedor
          }
        }
      });
      return current;
    });

    return NextResponse.json({ message: `${deleted.nombre} fue eliminada.` });
  } catch (error) {
    return errorResponse(error);
  }
}

async function requireAdmin(): Promise<{ id: string } | NextResponse> {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMINISTRACION") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
  if (!actor?.activo || actor.rol !== "ADMINISTRACION") {
    return NextResponse.json({ error: "La sesión está desactualizada. Volvé a iniciar sesión." }, { status: 401 });
  }
  return { id: actor.id };
}

async function notificarCambioPassword(
  cuentaId: string,
  nombre: string,
  email: string | null,
  password: string
): Promise<number> {
  const now = new Date();
  const events = await db.eventoProveedor.findMany({
    where: {
      cuentaProveedorId: cuentaId,
      proveedor: { tipo: "GOOGLE_MEET" },
      instancia: {
        finProgramadoAt: { gte: now },
        estado: { in: ["PROGRAMADA", "EN_CURSO"] }
      }
    },
    select: {
      instancia: {
        select: {
          solicitud: {
            select: {
              id: true,
              creadaPor: { select: { id: true, emailPrincipal: true } },
              docentePrograma: {
                select: {
                  docente: {
                    select: { usuario: { select: { id: true, emailPrincipal: true } } }
                  }
                }
              }
            }
          },
          asignaciones: {
            where: { estado: { in: ["ASIGNADO", "ACEPTADO"] } },
            select: {
              asistenteTecnico: {
                select: { usuario: { select: { id: true, emailPrincipal: true } } }
              }
            }
          }
        }
      }
    }
  });

  const recipients = new Map<string, { usuarioId: string; email?: string | null }>();
  for (const event of events) {
    const solicitud = event.instancia.solicitud;
    recipients.set(solicitud.creadaPor.id, {
      usuarioId: solicitud.creadaPor.id,
      email: solicitud.creadaPor.emailPrincipal
    });
    const docente = solicitud.docentePrograma.docente.usuario;
    recipients.set(docente.id, { usuarioId: docente.id, email: docente.emailPrincipal });
    for (const assignment of event.instancia.asignaciones) {
      const assistant = assignment.asistenteTecnico.usuario;
      recipients.set(assistant.id, { usuarioId: assistant.id, email: assistant.emailPrincipal });
    }
  }

  const unique = [...recipients.values()];
  if (unique.length === 0) return 0;
  await notificarUsuarios(db, unique, {
    tipo: "CREDENCIALES_SALA_CAMBIADAS",
    titulo: `Cambió la contraseña de ${nombre}`,
    cuerpo: `Las credenciales de ${nombre} cambiaron y afectan tus próximas reuniones.`,
    href: "/reuniones",
    metadata: { cuentaProveedorId: cuentaId, encuentrosAfectados: events.length },
    emailSubject: `Nueva contraseña de ${nombre}`,
    emailText: [
      `Usuario: ${email ?? "Cuenta Meet"}`,
      `Nueva contraseña: ${password}`,
      "",
      `Este cambio afecta ${events.length} encuentro${events.length === 1 ? "" : "s"} próximo${events.length === 1 ? "" : "s"} asociado${events.length === 1 ? "" : "s"} a esta sala.`
    ].join("\n"),
    emailActionLabel: "Ver mis reuniones"
  });
  return unique.length;
}

function toSafeHost(
  host: Readonly<{
    id: string;
    nombre: string;
    emailOrganizador: string | null;
    prioridad: number;
    limiteConcurrente: number | null;
    tieneLicencia: boolean;
    activa: boolean;
    secretRef: string | null;
  }>,
  enUso: boolean
): SafeHost {
  return {
    id: host.id,
    nombre: host.nombre,
    emailOrganizador: host.emailOrganizador,
    prioridad: host.prioridad,
    limiteConcurrente: host.limiteConcurrente,
    tieneLicencia: host.tieneLicencia,
    activa: host.activa,
    passwordConfigurada: Boolean(host.secretRef),
    enUso
  };
}

function errorResponse(error: unknown) {
  if (error instanceof z.ZodError) {
    return NextResponse.json({ error: error.issues[0]?.message ?? "Datos inválidos." }, { status: 400 });
  }
  const message = error instanceof Error ? error.message : "No se pudo guardar la sala.";
  return NextResponse.json({ error: message }, { status: 400 });
}
