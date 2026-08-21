import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { descifrarConfiguracion } from "@/src/lib/config/encryption";
import { db } from "@/src/lib/db";
import {
  mensajeErrorGoogleWorkspace,
  pruebaConfiguracionGoogleWorkspaceSchema
} from "@/src/modules/configuracion/google-workspace.domain";
import {
  probarCredencialGoogle,
  probarDelegacionGoogle,
  probarDestinoDrive,
  validarScopesGoogle
} from "@/src/modules/configuracion/google-workspace-test.adapter";

export const runtime = "nodejs";

type ScopeSubject = Readonly<{
  subject: string;
  tipo: "GENERAL" | "SALA";
  activa: boolean;
}>;

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMINISTRACION") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const actor = await resolveSessionActor(db, {
      id: session.user.id,
      email: session.user.email
    });
    if (!actor || actor.rol !== "ADMINISTRACION" || !actor.activo) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { objetivo } = pruebaConfiguracionGoogleWorkspaceSchema.parse(
      await request.json().catch(() => null)
    );
    const configuration = await db.configuracionGoogleWorkspace.findUnique({
      where: { id: "principal" }
    });
    if (
      !configuration?.serviceAccountEmail ||
      !configuration.privateKeyCifrada
    ) {
      throw new Error("Primero guardá la cuenta de servicio y su clave privada.");
    }

    const credential = {
      serviceAccountEmail: configuration.serviceAccountEmail,
      privateKey: descifrarConfiguracion(configuration.privateKeyCifrada)
    };

    if (objetivo === "SCOPES") {
      const scopeSubjects = await obtenerSujetosScopes(configuration.serviceAccountSubject);
      if (scopeSubjects.length === 0) {
        throw new Error("Primero guardá el usuario delegado o configurá al menos una sala Meet.");
      }

      const accounts = await Promise.all(scopeSubjects.map(async ({ subject, tipo, activa }) => {
        const scopes = await validarScopesGoogle({ ...credential, subject });
        return {
          subject,
          tipo,
          activa,
          ok: scopes.every(({ autorizado }) => autorizado),
          scopes
        };
      }));
      const failedAccounts = accounts.filter(({ ok }) => !ok);
      const missingCount = accounts.reduce(
        (total, account) => total + account.scopes.filter(({ autorizado }) => !autorizado).length,
        0
      );
      const roomCount = accounts.filter(({ tipo }) => tipo === "SALA").length;

      return NextResponse.json({
        message: missingCount === 0
          ? `Todos los scopes requeridos están autorizados en ${roomCount} ${roomCount === 1 ? "cuenta sala" : "cuentas sala"}${accounts.some(({ tipo }) => tipo === "GENERAL") ? " y en la cuenta delegada general" : ""}.`
          : `${missingCount} ${missingCount === 1 ? "autorización de scope falta" : "autorizaciones de scope faltan"} en ${failedAccounts.length} ${failedAccounts.length === 1 ? "cuenta" : "cuentas"}.`,
        accounts
      });
    }

    const hostEmails = objetivo === "DRIVE"
      ? (await db.cuentaProveedor.findMany({
          where: {
            proveedor: { tipo: "GOOGLE_MEET" },
            activa: true,
            emailOrganizador: { not: null }
          },
          select: { emailOrganizador: true },
          orderBy: { prioridad: "asc" }
        })).flatMap(({ emailOrganizador }) => emailOrganizador ? [emailOrganizador] : [])
      : [];

    const message = await ejecutarPrueba(objetivo, configuration, credential, hostEmails);
    return NextResponse.json({ message });
  } catch (error) {
    return NextResponse.json(
      { error: mensajeErrorGoogleWorkspace(error) },
      { status: 400 }
    );
  }
}

async function obtenerSujetosScopes(serviceAccountSubject: string | null): Promise<readonly ScopeSubject[]> {
  const hosts = await db.cuentaProveedor.findMany({
    where: {
      proveedor: { tipo: "GOOGLE_MEET" },
      emailOrganizador: { not: null }
    },
    select: { emailOrganizador: true, activa: true },
    orderBy: { prioridad: "asc" }
  });

  const seen = new Set<string>();
  const result: ScopeSubject[] = [];
  const add = (candidate: ScopeSubject) => {
    const key = candidate.subject.trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    result.push({ ...candidate, subject: candidate.subject.trim() });
  };

  if (serviceAccountSubject?.trim()) {
    add({ subject: serviceAccountSubject, tipo: "GENERAL", activa: true });
  }
  for (const host of hosts) {
    if (!host.emailOrganizador) continue;
    add({ subject: host.emailOrganizador, tipo: "SALA", activa: host.activa });
  }
  return result;
}

async function ejecutarPrueba(
  objetivo: "CREDENCIAL" | "DELEGACION" | "DRIVE",
  configuration: Readonly<{
    serviceAccountSubject: string | null;
    driveDestinationId: string | null;
  }>,
  credential: Readonly<{ serviceAccountEmail: string; privateKey: string }>,
  hostEmails: readonly string[]
): Promise<string> {
  if (objetivo === "CREDENCIAL") {
    return probarCredencialGoogle(credential);
  }
  if (!configuration.serviceAccountSubject) {
    throw new Error("Primero guardá el usuario delegado.");
  }
  const delegated = {
    ...credential,
    subject: configuration.serviceAccountSubject
  };
  if (objetivo === "DELEGACION") {
    return probarDelegacionGoogle(delegated);
  }
  if (!configuration.driveDestinationId) {
    throw new Error("Primero guardá el destino de Drive.");
  }
  await probarDestinoDrive(delegated, configuration.driveDestinationId);
  await Promise.all(hostEmails.map((subject) => probarDestinoDrive(
    { ...credential, subject },
    configuration.driveDestinationId!
  )));
  return `Lectura y escritura confirmadas para el usuario delegado y ${hostEmails.length} salas Meet.`;
}
