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

export type CredencialLegacyGoogleWorkspace = Readonly<{
  id: string;
  serviceAccountEmail: string;
  privateKey: string;
}>;

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

    const targetId = parsed.seccion === "CREDENCIAL" ? parsed.credentialId : "principal";
    const actual = await tx.configuracionGoogleWorkspace.findUnique({
      where: { id: targetId },
      select: {
        id: true,
        version: true,
        serviceAccountEmail: true,
        privateKeyCifrada: true,
        serviceAccountSubject: true,
        activa: true,
      }
    });
    if (
      parsed.seccion === "CREDENCIAL" &&
      !parsed.privateKey &&
      !actual?.privateKeyCifrada
    ) {
      throw new Error("La clave privada PEM es obligatoria en la primera configuración.");
    }

    if (
      parsed.seccion === "CREDENCIAL" &&
      targetId === "principal" &&
      actual?.serviceAccountEmail &&
      actual.privateKeyCifrada &&
      actual.serviceAccountEmail.toLowerCase() !== parsed.serviceAccountEmail.toLowerCase()
    ) {
      const legacyId = `legacy:${actual.serviceAccountEmail.toLowerCase()}`;
      await tx.configuracionGoogleWorkspace.upsert({
        where: { id: legacyId },
        create: {
          id: legacyId,
          serviceAccountEmail: actual.serviceAccountEmail,
          privateKeyCifrada: actual.privateKeyCifrada,
          serviceAccountSubject: actual.serviceAccountSubject,
          activa: true,
          actualizadaPorId: actorActual.id,
        },
        update: {
          serviceAccountEmail: actual.serviceAccountEmail,
          privateKeyCifrada: actual.privateKeyCifrada,
          serviceAccountSubject: actual.serviceAccountSubject,
          activa: true,
          actualizadaPorId: actorActual.id,
          version: { increment: 1 },
        },
      });
      await tx.auditoria.create({
        data: {
          actorUsuarioId: actorActual.id,
          accion: "CREDENCIAL_GOOGLE_WORKSPACE_ARCHIVADA_COMO_LEGACY",
          entidadTipo: "ConfiguracionGoogleWorkspace",
          entidadId: legacyId,
          valorNuevo: {
            serviceAccountEmail: actual.serviceAccountEmail,
            origen: "ROTACION_PRINCIPAL",
          },
        },
      });
    }

    const principal = targetId === "principal"
      ? actual
      : await tx.configuracionGoogleWorkspace.findUnique({
          where: { id: "principal" },
          select: { serviceAccountSubject: true },
        });
    const sectionData = datosDeSeccion(parsed, dependencias.cifrar);
    const configuracion = await tx.configuracionGoogleWorkspace.upsert({
      where: { id: targetId },
      create: {
        id: targetId,
        ...sectionData,
        ...(targetId.startsWith("legacy:") && principal?.serviceAccountSubject
          ? { serviceAccountSubject: principal.serviceAccountSubject }
          : {}),
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
        entidadId: targetId,
        valorAnterior: actual ? { version: actual.version } : undefined,
        valorNuevo: {
          version: configuracion.version,
          seccion: parsed.seccion,
          credentialId: targetId,
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

export async function cargarCredencialesLegacyGoogleWorkspace(
  db: PrismaClient,
  descifrar: (value: string) => string,
): Promise<readonly CredencialLegacyGoogleWorkspace[]> {
  const rows = await db.configuracionGoogleWorkspace.findMany({
    where: {
      id: { startsWith: "legacy:" },
      activa: true,
      serviceAccountEmail: { not: null },
      privateKeyCifrada: { not: null },
    },
    orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
    select: { id: true, serviceAccountEmail: true, privateKeyCifrada: true },
  });
  return rows.flatMap((row) => row.serviceAccountEmail && row.privateKeyCifrada ? [{
    id: row.id,
    serviceAccountEmail: row.serviceAccountEmail,
    privateKey: descifrar(row.privateKeyCifrada),
  }] : []);
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
