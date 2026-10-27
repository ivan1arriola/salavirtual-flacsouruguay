import type { PrismaClient } from "@prisma/client";
import {
  crearZoomClient,
  listarUsuariosZoomActivos,
  type ZoomCredentials,
} from "@/src/integrations/zoom";
import { puedeConfigurarGoogleWorkspace, type ActorConfiguracion } from "./google-workspace.domain";
import {
  configuracionZoomSchema,
  type EstadoConfiguracionZoom,
} from "./zoom.domain";

type ZoomConfigDb = Pick<PrismaClient, "configuracionZoom">;

/** Credenciales descifradas de Zoom, o null si no hay una configuración activa y completa. */
export async function obtenerCredencialZoom(
  db: ZoomConfigDb,
  descifrar: (value: string) => string
): Promise<ZoomCredentials | null> {
  const config = await db.configuracionZoom.findUnique({
    where: { id: "principal" },
    select: { accountId: true, clientId: true, clientSecretCifrado: true, activa: true },
  });
  if (!config?.activa || !config.accountId || !config.clientId || !config.clientSecretCifrado) return null;
  return {
    accountId: config.accountId,
    clientId: config.clientId,
    clientSecret: descifrar(config.clientSecretCifrado),
  };
}

export async function obtenerEstadoConfiguracionZoom(db: ZoomConfigDb): Promise<EstadoConfiguracionZoom> {
  const config = await db.configuracionZoom.findUnique({
    where: { id: "principal" },
    select: { accountId: true, clientId: true, clientSecretCifrado: true, activa: true, version: true, updatedAt: true },
  });
  return {
    accountId: config?.accountId ?? null,
    clientId: config?.clientId ?? null,
    secretoConfigurado: Boolean(config?.clientSecretCifrado),
    activa: config?.activa ?? false,
    version: config?.version ?? 0,
    updatedAt: config?.updatedAt ?? null,
  };
}

/**
 * Guarda las credenciales cifradas y registra a Zoom como proveedor operativo.
 * La cuenta queda disponible para elegirse en las solicitudes recién cuando hay
 * al menos una sala (CuentaProveedor) Zoom con licencia.
 */
export async function actualizarConfiguracionZoom(
  dependencias: Readonly<{ db: PrismaClient; cifrar: (value: string) => string }>,
  actor: ActorConfiguracion,
  input: unknown
): Promise<EstadoConfiguracionZoom> {
  if (!puedeConfigurarGoogleWorkspace(actor)) {
    throw new Error("Solo Administración puede configurar Zoom.");
  }
  const parsed = configuracionZoomSchema.parse(input);

  return dependencias.db.$transaction(async (tx) => {
    const actual = await tx.configuracionZoom.findUnique({
      where: { id: "principal" },
      select: { clientSecretCifrado: true, accountId: true, clientId: true, activa: true },
    });
    if (!parsed.clientSecret && !actual?.clientSecretCifrado) {
      throw new Error("Ingresá el Client Secret de la app de Zoom.");
    }
    const clientSecretCifrado = parsed.clientSecret
      ? dependencias.cifrar(parsed.clientSecret)
      : actual!.clientSecretCifrado!;

    const guardada = await tx.configuracionZoom.upsert({
      where: { id: "principal" },
      create: {
        id: "principal",
        accountId: parsed.accountId,
        clientId: parsed.clientId,
        clientSecretCifrado,
        activa: parsed.activa,
        actualizadaPorId: actor.id,
      },
      update: {
        accountId: parsed.accountId,
        clientId: parsed.clientId,
        clientSecretCifrado,
        activa: parsed.activa,
        actualizadaPorId: actor.id,
        version: { increment: 1 },
      },
    });

    await tx.proveedorReunion.upsert({
      where: { tipo: "ZOOM" },
      create: { tipo: "ZOOM", nombre: "Zoom", operativo: parsed.activa, historico: false },
      update: { operativo: parsed.activa },
    });

    await tx.auditoria.create({
      data: {
        actorUsuarioId: actor.id,
        accion: "CONFIGURACION_ZOOM_ACTUALIZADA",
        entidadTipo: "ConfiguracionZoom",
        entidadId: "principal",
        valorAnterior: actual
          ? { accountId: actual.accountId, clientId: actual.clientId, activa: actual.activa }
          : undefined,
        valorNuevo: {
          accountId: parsed.accountId,
          clientId: parsed.clientId,
          activa: parsed.activa,
          secretoActualizado: Boolean(parsed.clientSecret),
        },
      },
    });

    return {
      accountId: guardada.accountId,
      clientId: guardada.clientId,
      secretoConfigurado: true,
      activa: guardada.activa,
      version: guardada.version,
      updatedAt: guardada.updatedAt,
    };
  });
}

export type ResultadoPruebaZoom = Readonly<{
  ok: boolean;
  usuariosConLicencia: readonly string[];
  error?: string;
}>;

/** Pide un token y lista usuarios con licencia para confirmar credenciales y scopes básicos. */
export async function probarConexionZoom(credentials: ZoomCredentials): Promise<ResultadoPruebaZoom> {
  try {
    const client = crearZoomClient(credentials);
    const usuarios = await listarUsuariosZoomActivos(client);
    return {
      ok: true,
      // type 2 = Licensed; los usuarios Basic no pueden hospedar más de 40 min.
      usuariosConLicencia: usuarios.filter((u) => u.type === 2).map((u) => u.email.toLowerCase()),
    };
  } catch (error) {
    return {
      ok: false,
      usuariosConLicencia: [],
      error: error instanceof Error ? error.message : "No se pudo conectar con Zoom.",
    };
  }
}

export type SalaZoom = Readonly<{
  id: string;
  nombre: string;
  emailOrganizador: string | null;
  prioridad: number;
  tieneLicencia: boolean;
  activa: boolean;
  enUso: boolean;
}>;

export async function listarSalasZoom(db: PrismaClient): Promise<readonly SalaZoom[]> {
  const cuentas = await db.cuentaProveedor.findMany({
    where: { proveedor: { tipo: "ZOOM" } },
    orderBy: [{ activa: "desc" }, { prioridad: "asc" }, { nombre: "asc" }],
    include: { _count: { select: { eventosProveedor: true } } },
  });
  return cuentas.map((cuenta) => ({
    id: cuenta.id,
    nombre: cuenta.nombre,
    emailOrganizador: cuenta.emailOrganizador,
    prioridad: cuenta.prioridad,
    tieneLicencia: cuenta.tieneLicencia,
    activa: cuenta.activa,
    enUso: cuenta._count.eventosProveedor > 0,
  }));
}

/**
 * Crea una sala por cada usuario con licencia de la cuenta Zoom. Las salas
 * existentes conservan prioridad y estado; solo se actualiza la licencia.
 * Las salas nuevas quedan inactivas para que Administración elija cuáles usar.
 */
export async function importarSalasZoom(
  db: PrismaClient,
  actor: ActorConfiguracion,
  usuariosConLicencia: readonly string[]
): Promise<Readonly<{ creadas: number; actualizadas: number }>> {
  if (!puedeConfigurarGoogleWorkspace(actor)) {
    throw new Error("Solo Administración puede configurar Zoom.");
  }
  const emails = [...new Set(usuariosConLicencia.map((email) => email.trim().toLowerCase()).filter(Boolean))];
  return db.$transaction(async (tx) => {
    const proveedor = await tx.proveedorReunion.upsert({
      where: { tipo: "ZOOM" },
      create: { tipo: "ZOOM", nombre: "Zoom", operativo: true, historico: false },
      update: {},
    });
    const existentes = await tx.cuentaProveedor.findMany({
      where: { proveedorId: proveedor.id },
      select: { id: true, externalAccountId: true },
    });
    const porEmail = new Map(existentes.map((cuenta) => [cuenta.externalAccountId?.toLowerCase(), cuenta.id]));
    let creadas = 0;
    let actualizadas = 0;
    for (const email of emails) {
      const id = porEmail.get(email);
      if (id) {
        await tx.cuentaProveedor.update({ where: { id }, data: { tieneLicencia: true } });
        actualizadas += 1;
      } else {
        await tx.cuentaProveedor.create({
          data: {
            proveedorId: proveedor.id,
            nombre: `Zoom ${email}`,
            emailOrganizador: email,
            externalAccountId: email,
            tieneLicencia: true,
            activa: false,
            prioridad: 100,
          },
        });
        creadas += 1;
      }
    }
    // Las cuentas que perdieron la licencia no pueden alojar reuniones largas.
    const sinLicencia = existentes.filter((cuenta) => !emails.includes(cuenta.externalAccountId?.toLowerCase() ?? ""));
    if (sinLicencia.length > 0) {
      await tx.cuentaProveedor.updateMany({
        where: { id: { in: sinLicencia.map(({ id }) => id) } },
        data: { tieneLicencia: false },
      });
    }
    await tx.auditoria.create({
      data: {
        actorUsuarioId: actor.id,
        accion: "SALAS_ZOOM_IMPORTADAS",
        entidadTipo: "ProveedorReunion",
        entidadId: proveedor.id,
        valorNuevo: { creadas, actualizadas, sinLicencia: sinLicencia.length },
      },
    });
    return { creadas, actualizadas };
  });
}

export async function actualizarSalaZoom(
  db: PrismaClient,
  actor: ActorConfiguracion,
  input: Readonly<{ id: string; activa: boolean; prioridad?: number }>
): Promise<void> {
  if (!puedeConfigurarGoogleWorkspace(actor)) {
    throw new Error("Solo Administración puede configurar Zoom.");
  }
  const actual = await db.cuentaProveedor.findUnique({
    where: { id: input.id },
    select: { proveedor: { select: { tipo: true } }, activa: true, prioridad: true },
  });
  if (!actual || actual.proveedor.tipo !== "ZOOM") throw new Error("La sala Zoom no existe.");
  const prioridad = input.prioridad !== undefined && Number.isInteger(input.prioridad)
    ? Math.min(1000, Math.max(1, input.prioridad))
    : actual.prioridad;
  await db.$transaction([
    db.cuentaProveedor.update({ where: { id: input.id }, data: { activa: input.activa, prioridad } }),
    db.auditoria.create({
      data: {
        actorUsuarioId: actor.id,
        accion: "SALA_ZOOM_ACTUALIZADA",
        entidadTipo: "CuentaProveedor",
        entidadId: input.id,
        valorAnterior: { activa: actual.activa, prioridad: actual.prioridad },
        valorNuevo: { activa: input.activa, prioridad },
      },
    }),
  ]);
}

/** Zoom se puede ofrecer al crear reuniones si está activo y hay al menos una sala activa con licencia. */
export async function zoomDisponibleParaReuniones(db: PrismaClient): Promise<boolean> {
  const config = await db.configuracionZoom.findUnique({ where: { id: "principal" }, select: { activa: true } });
  if (!config?.activa) return false;
  const salas = await db.cuentaProveedor.count({
    where: { proveedor: { tipo: "ZOOM", operativo: true }, activa: true, tieneLicencia: true },
  });
  return salas > 0;
}
