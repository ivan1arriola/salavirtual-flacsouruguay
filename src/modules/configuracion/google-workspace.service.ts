import type { PrismaClient } from "@prisma/client";
import {
  puedeConfigurarGoogleWorkspace,
  seccionConfiguracionGoogleWorkspaceSchema,
  type ActorConfiguracion,
  type SeccionConfiguracionGoogleWorkspaceInput
} from "./google-workspace.domain";

export type DependenciasConfiguracionGoogle = Readonly<{
  db: PrismaClient;
  cifrar: (value: string) => string;
}>;

export async function resolverActorConfiguracion(
  db: PrismaClient,
  identity: Readonly<{ id: string; email?: string | null }>
): Promise<ActorConfiguracion | null> {
  const byId = await db.usuario.findUnique({
    where: { id: identity.id },
    select: { id: true, rol: true, activo: true }
  });
  if (byId) return byId;

  const email = identity.email?.trim();
  if (!email) return null;

  return db.usuario.findFirst({
    where: { emailPrincipal: { equals: email, mode: "insensitive" } },
    select: { id: true, rol: true, activo: true }
  });
}

export async function actualizarSeccionGoogleWorkspace(
  dependencias: DependenciasConfiguracionGoogle,
  actor: ActorConfiguracion,
  input: unknown
): Promise<
  Readonly<{
    serviceAccountEmail: string | null;
    serviceAccountSubject: string | null;
    driveDestinationId: string | null;
    privateKeyConfigurada: boolean;
    activa: boolean;
    version: number;
  }>
> {
  if (!puedeConfigurarGoogleWorkspace(actor)) {
    throw new Error("Solo Administracion puede configurar Google Workspace.");
  }

  const parsed: SeccionConfiguracionGoogleWorkspaceInput =
    seccionConfiguracionGoogleWorkspaceSchema.parse(input);

  return dependencias.db.$transaction(async (tx) => {
    const actorActual = await tx.usuario.findUnique({
      where: { id: actor.id },
      select: { id: true, rol: true, activo: true }
    });
    if (!actorActual) {
      throw new Error("La sesión no corresponde a un usuario vigente. Volvé a iniciar sesión.");
    }
    if (!puedeConfigurarGoogleWorkspace(actorActual)) {
      throw new Error("Solo Administracion puede configurar Google Workspace.");
    }

    const actual = await tx.configuracionGoogleWorkspace.findUnique({
      where: { id: "principal" },
      select: { version: true, privateKeyCifrada: true }
    });
    if (
      parsed.seccion === "CREDENCIAL" &&
      !parsed.privateKey &&
      !actual?.privateKeyCifrada
    ) {
      throw new Error("La clave privada PEM es obligatoria en la primera configuración.");
    }

    const sectionData = datosDeSeccion(parsed, dependencias.cifrar);
    const configuracion = await tx.configuracionGoogleWorkspace.upsert({
      where: { id: "principal" },
      create: {
        id: "principal",
        ...sectionData,
        actualizadaPorId: actorActual.id
      },
      update: {
        ...sectionData,
        actualizadaPorId: actorActual.id,
        version: { increment: 1 }
      },
      select: {
        serviceAccountEmail: true,
        serviceAccountSubject: true,
        driveDestinationId: true,
        privateKeyCifrada: true,
        activa: true,
        version: true
      }
    });

    await tx.auditoria.create({
      data: {
        actorUsuarioId: actorActual.id,
        accion: `CONFIGURACION_GOOGLE_WORKSPACE_${parsed.seccion}_ACTUALIZADA`,
        entidadTipo: "ConfiguracionGoogleWorkspace",
        entidadId: "principal",
        valorAnterior: actual ? { version: actual.version } : undefined,
        valorNuevo: {
          version: configuracion.version,
          seccion: parsed.seccion,
          privateKeyActualizada:
            parsed.seccion === "CREDENCIAL" && Boolean(parsed.privateKey)
        }
      }
    });

    return {
      serviceAccountEmail: configuracion.serviceAccountEmail,
      serviceAccountSubject: configuracion.serviceAccountSubject,
      driveDestinationId: configuracion.driveDestinationId,
      privateKeyConfigurada: Boolean(configuracion.privateKeyCifrada),
      activa: configuracion.activa,
      version: configuracion.version
    };
  });
}

function datosDeSeccion(
  input: SeccionConfiguracionGoogleWorkspaceInput,
  cifrar: (value: string) => string
) {
  if (input.seccion === "CREDENCIAL") {
    return {
      serviceAccountEmail: input.serviceAccountEmail,
      ...(input.privateKey ? { privateKeyCifrada: cifrar(input.privateKey) } : {})
    };
  }
  if (input.seccion === "DELEGACION") {
    return { serviceAccountSubject: input.serviceAccountSubject };
  }
  if (input.seccion === "DRIVE") {
    return { driveDestinationId: input.driveDestinationId };
  }
  return { activa: input.activa };
}
