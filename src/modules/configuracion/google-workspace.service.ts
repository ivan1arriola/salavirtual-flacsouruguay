import type { PrismaClient } from "@prisma/client";
import { descifrarConfiguracion } from "../../lib/config/encryption";
import {
  puedeConfigurarGoogleWorkspace,
  seccionConfiguracionGoogleWorkspaceSchema,
  type ActorConfiguracion,
  type SeccionConfiguracionGoogleWorkspaceInput
} from "./google-workspace.domain";

export type WorkspaceConfigDb = {
  configuracionGoogleWorkspace: {
    findUnique: (args: any) => Promise<any>;
    findMany?: (args: any) => Promise<any>;
  };
};

export type DependenciasConfiguracionGoogle = Readonly<{
  db: PrismaClient;
  cifrar: (value: string) => string;
}>;

export type CredencialWorkspacePrincipal = Readonly<{
  id: string;
  serviceAccountEmail: string;
  privateKey: string;
  privateKeyCifrada?: string | null;
  serviceAccountSubject: string | null;
  driveDestinationId: string | null;
  activa: boolean;
  version: number;
  updatedAt?: Date;
}>;

export type CredencialGoogleSala = Readonly<{
  serviceAccountEmail: string;
  privateKey: string;
  subject: string;
}>;

export type CredencialAdminReportsGoogle = Readonly<{
  serviceAccountEmail: string;
  privateKey: string;
  adminEmail: string;
}>;

export type CredencialLegacyGoogleWorkspace = Readonly<{
  id: string;
  serviceAccountEmail: string;
  privateKey: string;
  serviceAccountSubject: string | null;
}>;

export type CredencialesWorkspaceActivas = Readonly<{
  principal: CredencialWorkspacePrincipal | null;
  legacy: readonly CredencialLegacyGoogleWorkspace[];
}>;

export type CandidatoCredencialMeet = Readonly<{
  serviceAccountEmail: string;
  privateKey: string;
  subject: string;
  origen: "PRINCIPAL" | "LEGACY";
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
        activa: true
      }
    });

    if (
      parsed.seccion === "CREDENCIAL" &&
      targetId === "principal" &&
      actual?.serviceAccountEmail &&
      actual.privateKeyCifrada &&
      actual.serviceAccountEmail.toLowerCase() !== parsed.serviceAccountJson.client_email.toLowerCase()
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
          actualizadaPorId: actorActual.id
        },
        update: {
          serviceAccountEmail: actual.serviceAccountEmail,
          privateKeyCifrada: actual.privateKeyCifrada,
          serviceAccountSubject: actual.serviceAccountSubject,
          activa: true,
          actualizadaPorId: actorActual.id,
          version: { increment: 1 }
        }
      });
      await tx.auditoria.create({
        data: {
          actorUsuarioId: actorActual.id,
          accion: "CREDENCIAL_GOOGLE_WORKSPACE_ARCHIVADA_COMO_LEGACY",
          entidadTipo: "ConfiguracionGoogleWorkspace",
          entidadId: legacyId,
          valorNuevo: {
            serviceAccountEmail: actual.serviceAccountEmail,
            origen: "ROTACION_PRINCIPAL"
          }
        }
      });
    }

    const principal =
      targetId === "principal"
        ? actual
        : await tx.configuracionGoogleWorkspace.findUnique({
            where: { id: "principal" },
            select: { serviceAccountSubject: true }
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
        ...(parsed.seccion === "CREDENCIAL" && targetId.startsWith("legacy:") ? { activa: true } : {}),
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
          ...(parsed.seccion === "CREDENCIAL"
            ? {
                serviceAccountEmail: parsed.serviceAccountJson.client_email,
                projectId: parsed.serviceAccountJson.project_id ?? null,
                clientId: parsed.serviceAccountJson.client_id ?? null,
                privateKeyId: parsed.serviceAccountJson.private_key_id ?? null
              }
            : {})
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

export async function obtenerCredencialWorkspacePorId(
  db: WorkspaceConfigDb,
  id: string,
  descifrar: (value: string) => string = descifrarConfiguracion
): Promise<CredencialWorkspacePrincipal | null> {
  const config = await db.configuracionGoogleWorkspace.findUnique({
    where: { id },
    select: {
      id: true,
      serviceAccountEmail: true,
      privateKeyCifrada: true,
      serviceAccountSubject: true,
      driveDestinationId: true,
      activa: true,
      version: true,
      updatedAt: true
    }
  });

  if (!config) {
    return null;
  }
  if (!config.serviceAccountEmail || !config.privateKeyCifrada) {
    return null;
  }

  try {
    const privateKey = descifrar(config.privateKeyCifrada);
    const activa = config.activa ?? true;
    return {
      id: config.id,
      serviceAccountEmail: config.serviceAccountEmail,
      privateKey,
      privateKeyCifrada: config.privateKeyCifrada,
      serviceAccountSubject: config.serviceAccountSubject ?? null,
      driveDestinationId: config.driveDestinationId ?? null,
      activa,
      version: config.version,
      updatedAt: config.updatedAt
    };
  } catch (error) {
    console.error(`Error al descifrar clave de workspace para ${id}:`, error);
    return null;
  }
}

export async function obtenerCredencialPrincipalGoogleWorkspace(
  db: WorkspaceConfigDb,
  descifrar: (value: string) => string = descifrarConfiguracion,
  options?: { requireActiva?: boolean }
): Promise<CredencialWorkspacePrincipal | null> {
  const requireActiva = options?.requireActiva ?? true;
  const cred = await obtenerCredencialWorkspacePorId(db, "principal", descifrar);
  if (!cred) {
    return null;
  }
  if (requireActiva && !cred.activa) {
    return null;
  }
  return cred;
}

export async function obtenerCredencialGoogleParaSala(
  db: WorkspaceConfigDb,
  emailOrganizador: string,
  descifrar: (value: string) => string = descifrarConfiguracion
): Promise<CredencialGoogleSala | null> {
  const principal = await obtenerCredencialPrincipalGoogleWorkspace(db, descifrar, { requireActiva: true });
  if (!principal) {
    return null;
  }
  return {
    serviceAccountEmail: principal.serviceAccountEmail,
    privateKey: principal.privateKey,
    subject: emailOrganizador
  };
}

export async function obtenerCredencialAdminReportsGoogle(
  db: WorkspaceConfigDb,
  descifrar: (value: string) => string = descifrarConfiguracion,
  overrideAdminEmail?: string | null
): Promise<CredencialAdminReportsGoogle | null> {
  const adminEmail = (overrideAdminEmail ?? process.env.GOOGLE_REPORTS_ADMIN_EMAIL)?.trim();
  if (!adminEmail) {
    return null;
  }

  const principal = await obtenerCredencialPrincipalGoogleWorkspace(db, descifrar, { requireActiva: true });
  if (!principal) {
    return null;
  }

  return {
    serviceAccountEmail: principal.serviceAccountEmail,
    privateKey: principal.privateKey,
    adminEmail
  };
}

export async function cargarCredencialesLegacyGoogleWorkspace(
  db: WorkspaceConfigDb,
  descifrar: (value: string) => string = descifrarConfiguracion
): Promise<readonly CredencialLegacyGoogleWorkspace[]> {
  if (!db.configuracionGoogleWorkspace.findMany) {
    return [];
  }
  const rows = await db.configuracionGoogleWorkspace.findMany({
    where: {
      id: { startsWith: "legacy:" },
      activa: true,
      serviceAccountEmail: { not: null },
      privateKeyCifrada: { not: null }
    },
    orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      serviceAccountEmail: true,
      privateKeyCifrada: true,
      serviceAccountSubject: true
    }
  });
  return rows.flatMap((row: any) => {
    if (!row.serviceAccountEmail || !row.privateKeyCifrada) {
      return [];
    }
    try {
      return [
        {
          id: row.id,
          serviceAccountEmail: row.serviceAccountEmail,
          privateKey: descifrar(row.privateKeyCifrada),
          serviceAccountSubject: row.serviceAccountSubject ?? null
        }
      ];
    } catch {
      return [];
    }
  });
}

export async function obtenerCredencialesWorkspaceActivas(
  db: WorkspaceConfigDb,
  descifrar: (value: string) => string = descifrarConfiguracion
): Promise<CredencialesWorkspaceActivas> {
  const [principal, legacy] = await Promise.all([
    obtenerCredencialPrincipalGoogleWorkspace(db, descifrar, { requireActiva: true }),
    cargarCredencialesLegacyGoogleWorkspace(db, descifrar)
  ]);
  return { principal, legacy };
}

export async function obtenerCandidatosCredencialesParaOrganizador(
  db: WorkspaceConfigDb,
  organizador: string,
  descifrar: (value: string) => string = descifrarConfiguracion
): Promise<readonly CandidatoCredencialMeet[]> {
  const { principal, legacy } = await obtenerCredencialesWorkspaceActivas(db, descifrar);
  const candidates: CandidatoCredencialMeet[] = [];

  if (principal) {
    candidates.push({
      serviceAccountEmail: principal.serviceAccountEmail,
      privateKey: principal.privateKey,
      subject: organizador,
      origen: "PRINCIPAL"
    });
  }

  for (const leg of legacy) {
    candidates.push({
      serviceAccountEmail: leg.serviceAccountEmail,
      privateKey: leg.privateKey,
      subject: organizador,
      origen: "LEGACY"
    });
  }

  return candidates;
}

export async function desactivarCredencialLegacyWorkspace(
  db: PrismaClient,
  actor: { id: string },
  legacyId: string
) {
  if (!legacyId.startsWith("legacy:")) {
    throw new Error("Solo se pueden desactivar credenciales Legacy.");
  }
  const current = await db.configuracionGoogleWorkspace.findUnique({
    where: { id: legacyId },
    select: { id: true, serviceAccountEmail: true, activa: true }
  });
  if (!current) {
    throw new Error("La credencial no existe.");
  }

  await db.$transaction(async (tx) => {
    await tx.configuracionGoogleWorkspace.update({
      where: { id: legacyId },
      data: { activa: false, actualizadaPorId: actor.id, version: { increment: 1 } }
    });
    await tx.auditoria.create({
      data: {
        actorUsuarioId: actor.id,
        accion: "CREDENCIAL_GOOGLE_WORKSPACE_LEGACY_DESACTIVADA",
        entidadTipo: "ConfiguracionGoogleWorkspace",
        entidadId: legacyId,
        valorAnterior: { activa: current.activa },
        valorNuevo: { activa: false, serviceAccountEmail: current.serviceAccountEmail }
      }
    });
  });
}

function datosDeSeccion(input: SeccionConfiguracionGoogleWorkspaceInput, cifrar: (value: string) => string) {
  if (input.seccion === "CREDENCIAL") {
    return {
      serviceAccountEmail: input.serviceAccountJson.client_email,
      privateKeyCifrada: cifrar(input.serviceAccountJson.private_key)
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
