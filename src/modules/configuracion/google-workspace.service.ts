import type { PrismaClient } from "@prisma/client";
import {
  configuracionGoogleWorkspaceSchema,
  puedeConfigurarGoogleWorkspace,
  type ActorConfiguracion,
  type ConfiguracionGoogleWorkspaceInput
} from "./google-workspace.domain";

export type DependenciasConfiguracionGoogle = Readonly<{
  db: PrismaClient;
  cifrar: (value: string) => string;
}>;

export async function actualizarConfiguracionGoogleWorkspace(
  dependencias: DependenciasConfiguracionGoogle,
  actor: ActorConfiguracion,
  input: unknown
): Promise<
  Readonly<{
    serviceAccountEmail: string;
    serviceAccountSubject: string;
    driveDestinationId: string;
    activa: boolean;
    version: number;
  }>
> {
  if (!puedeConfigurarGoogleWorkspace(actor)) {
    throw new Error("Solo Administracion puede configurar Google Workspace.");
  }

  const parsed: ConfiguracionGoogleWorkspaceInput =
    configuracionGoogleWorkspaceSchema.parse(input);
  const privateKeyCifrada = dependencias.cifrar(parsed.privateKey);

  return dependencias.db.$transaction(async (tx) => {
    const actual = await tx.configuracionGoogleWorkspace.findUnique({
      where: { id: "principal" },
      select: { version: true }
    });
    const configuracion = await tx.configuracionGoogleWorkspace.upsert({
      where: { id: "principal" },
      create: {
        id: "principal",
        serviceAccountEmail: parsed.serviceAccountEmail,
        privateKeyCifrada,
        serviceAccountSubject: parsed.serviceAccountSubject,
        driveDestinationId: parsed.driveDestinationId,
        activa: parsed.activa,
        actualizadaPorId: actor.id
      },
      update: {
        serviceAccountEmail: parsed.serviceAccountEmail,
        privateKeyCifrada,
        serviceAccountSubject: parsed.serviceAccountSubject,
        driveDestinationId: parsed.driveDestinationId,
        activa: parsed.activa,
        actualizadaPorId: actor.id,
        version: { increment: 1 }
      },
      select: {
        serviceAccountEmail: true,
        serviceAccountSubject: true,
        driveDestinationId: true,
        activa: true,
        version: true
      }
    });

    await tx.auditoria.create({
      data: {
        actorUsuarioId: actor.id,
        accion: "CONFIGURACION_GOOGLE_WORKSPACE_ACTUALIZADA",
        entidadTipo: "ConfiguracionGoogleWorkspace",
        entidadId: "principal",
        valorAnterior: actual ? { version: actual.version } : undefined,
        valorNuevo: {
          version: configuracion.version,
          serviceAccountEmail: configuracion.serviceAccountEmail,
          serviceAccountSubject: configuracion.serviceAccountSubject,
          driveDestinationId: configuracion.driveDestinationId,
          activa: configuracion.activa,
          privateKeyActualizada: true
        }
      }
    });

    return configuracion;
  });
}
