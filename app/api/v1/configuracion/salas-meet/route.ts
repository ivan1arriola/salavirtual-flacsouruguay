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
  activa: z.boolean()
});

const createSchema = hostFields.extend({
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres.").max(200)
});

const updateSchema = hostFields.extend({
  id: z.string().min(1),
  password: z.string().max(200).optional(),
  notificarCambioPassword: z.boolean().default(true)
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
        where: { tipo: "GOOGLE_MEET" },
        create: {
          tipo: "GOOGLE_MEET",
          nombre: "Google Meet",
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
      if (duplicate) throw new Error("Ya existe una cuenta Meet con ese correo.");

      const created = await tx.cuentaProveedor.create({
        data: {
          proveedorId: provider.id,
          nombre: input.nombre,
          emailOrganizador: input.email,
          externalAccountId: input.email,
          secretRef: cifrarConfiguracion(input.password),
          prioridad: input.prioridad,
          limiteConcurrente: input.limiteConcurrente,
          tieneLicencia: input.tieneLicencia,
          activa: input.activa
        }
      });
      await tx.auditoria.create({
        data: {
          actorUsuarioId: actor.id,
          accion: "CUENTA_MEET_CREADA",
          entidadTipo: "CuentaProveedor",
          entidadId: created.id,
          valorNuevo: {
            nombre: created.nombre,
            emailOrganizador: created.emailOrganizador,
            prioridad: created.prioridad,
            limiteConcurrente: created.limiteConcurrente,
            tieneLicencia: created.tieneLicencia,
            activa: created.activa,
            passwordConfigurada: true
          }
        }
      });
      return created;
    });

    return NextResponse.json({ host: toSafeHost(host, false), message: "Sala Meet agregada." }, { status: 201 });
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
      if (!current || current.proveedor.tipo !== "GOOGLE_MEET") {
        throw new Error("La cuenta Meet no existe.");
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
        if (duplicate) throw new Error("Ya existe una cuenta Meet con ese correo.");
      }

      const password = input.password?.trim() || null;
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
          accion: passwordChanged ? "CUENTA_MEET_PASSWORD_ACTUALIZADA" : "CUENTA_MEET_ACTUALIZADA",
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
        password
      };
    });

    let notificados = 0;
    if (result.passwordChanged && result.password && input.notificarCambioPassword) {
      notificados = await notificarCambioPassword(result.host.id, result.host.nombre, result.host.emailOrganizador, result.password);
    }

    return NextResponse.json({
      host: toSafeHost(result.host, result.enUso),
      notificados,
      message: result.passwordChanged
        ? `Sala actualizada. ${notificados > 0 ? `Se notificó a ${notificados} persona${notificados === 1 ? "" : "s"}.` : "No había personas con reuniones futuras para notificar."}`
        : "Sala Meet actualizada."
    });
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
  const message = error instanceof Error ? error.message : "No se pudo guardar la sala Meet.";
  return NextResponse.json({ error: message }, { status: 400 });
}
