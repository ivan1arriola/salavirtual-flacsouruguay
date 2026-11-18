import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { descifrarConfiguracion } from "@/src/lib/config/encryption";
import { db } from "@/src/lib/db";
import {
  mensajeErrorGoogleWorkspace,
  obtenerCredencialWorkspacePorId,
  pruebaConfiguracionGoogleWorkspaceSchema
} from "@/src/modules/configuracion/api";
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

    const { objetivo, credentialId } = pruebaConfiguracionGoogleWorkspaceSchema.parse(
      await request.json().catch(() => null)
    );
    const targetId =
      objetivo === "CREDENCIAL" && credentialId && credentialId !== "principal" ? credentialId : "principal";
    const selected = await obtenerCredencialWorkspacePorId(db, targetId, descifrarConfiguracion);
    if (!selected) {
      if (targetId === "principal") {
        throw new Error("Google Workspace no está configurado.");
      }
      throw new Error("Primero guardá la cuenta de servicio y su clave privada.");
    }

    const credential = {
      serviceAccountEmail: selected.serviceAccountEmail,
      privateKey: selected.privateKey
    };

    const principal =
      targetId === "principal"
        ? selected
        : await obtenerCredencialWorkspacePorId(db, "principal", descifrarConfiguracion);
    if (!principal) {
      throw new Error("Google Workspace no está configurado.");
    }

    if (objetivo === "SCOPES") {
      if (!principal.serviceAccountEmail || !principal.privateKeyCifrada) {
        throw new Error("Primero guardá la credencial Principal.");
      }
      const principalCredential = {
        serviceAccountEmail: principal.serviceAccountEmail,
        privateKey: descifrarConfiguracion(principal.privateKeyCifrada)
      };
      const scopeSubjects = obtenerSujetosScopes(principal.serviceAccountSubject);
      if (scopeSubjects.length === 0) {
        throw new Error("Primero guardá el usuario delegado.");
      }

      const accounts = [];
      for (const { subject, tipo, activa } of scopeSubjects) {
        const scopes = await validarScopesGoogle({ ...principalCredential, subject });
        accounts.push({
          subject,
          tipo,
          activa,
          ok: scopes.every(({ autorizado }) => autorizado),
          scopes
        });
      }
      const failedAccounts = accounts.filter(({ ok }) => !ok);
      const missingCount = accounts.reduce(
        (total, account) => total + account.scopes.filter(({ autorizado }) => !autorizado).length,
        0
      );

      return NextResponse.json({
        message:
          missingCount === 0
            ? "Todos los scopes requeridos están autorizados en la cuenta delegada."
            : `${missingCount} ${missingCount === 1 ? "autorización de scope falta" : "autorizaciones de scope faltan"} en ${failedAccounts.length} ${failedAccounts.length === 1 ? "cuenta" : "cuentas"}.`,
        accounts
      });
    }

    const message = await ejecutarPrueba(objetivo, principal, credential);
    return NextResponse.json({ message });
  } catch (error) {
    return NextResponse.json({ error: mensajeErrorGoogleWorkspace(error) }, { status: 400 });
  }
}

function obtenerSujetosScopes(serviceAccountSubject: string | null): readonly ScopeSubject[] {
  const subject = serviceAccountSubject?.trim();
  return subject ? [{ subject, tipo: "GENERAL", activa: true }] : [];
}

async function ejecutarPrueba(
  objetivo: "CREDENCIAL" | "DELEGACION" | "DRIVE",
  configuration: Readonly<{
    serviceAccountSubject: string | null;
    driveDestinationId: string | null;
  }>,
  credential: Readonly<{ serviceAccountEmail: string; privateKey: string }>
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
  return "Lectura y escritura confirmadas para el usuario delegado.";
}
