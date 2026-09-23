import { readFile, unlink } from "node:fs/promises";
import { JWT } from "google-auth-library";
import { db } from "../src/lib/db";
import { cifrarConfiguracion, descifrarConfiguracion } from "../src/lib/config/encryption";
import {
  probarCredencialGoogle,
  probarDelegacionGoogle,
  probarDestinoDrive,
  validarScopesGoogle,
} from "../src/modules/configuracion/google-workspace-test.adapter";

type ServiceAccountJson = Readonly<{
  type?: string;
  project_id?: string;
  private_key?: string;
  client_email?: string;
  client_id?: string;
}>;

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function probarPreview(
  serviceAccountEmail: string,
  privateKey: string,
  subject: string,
  meetCode: string,
): Promise<{ spaceName: string; memberCount: number }> {
  const auth = new JWT({
    email: serviceAccountEmail,
    key: privateKey,
    scopes: [
      "https://www.googleapis.com/auth/meetings.space.settings",
      "https://www.googleapis.com/auth/meetings.space.readonly",
      "https://www.googleapis.com/auth/meetings.space.created",
    ],
    subject,
  });

  const space = await auth.request<{ name?: string }>({
    url: `https://meet.googleapis.com/v2/spaces/${encodeURIComponent(meetCode)}`,
    method: "GET",
    timeout: 30_000,
  });
  if (!space.data.name) throw new Error("Meet no devolvió el nombre interno del espacio.");

  const members = await auth.request<{ members?: readonly unknown[] }>({
    url: `https://meet.googleapis.com/v2/${space.data.name}/members?pageSize=20`,
    method: "GET",
    timeout: 30_000,
  });

  return {
    spaceName: space.data.name,
    memberCount: Array.isArray(members.data.members) ? members.data.members.length : 0,
  };
}

async function main() {
  const file = argValue("file");
  const expectedProjectId = argValue("expected-project-id");
  const previewSubject = argValue("preview-subject");
  const meetCode = argValue("meet-code");
  const apply = hasFlag("apply");
  const deleteFile = hasFlag("delete-file");

  if (!file) throw new Error("Falta --file=/ruta/credencial.json");

  const parsed = JSON.parse(await readFile(file, "utf8")) as ServiceAccountJson;
  if (parsed.type !== "service_account") throw new Error("El JSON no es una cuenta de servicio.");
  if (!parsed.project_id || !parsed.client_email || !parsed.private_key || !parsed.client_id) {
    throw new Error("El JSON no contiene todos los campos requeridos de una cuenta de servicio.");
  }
  if (expectedProjectId && parsed.project_id !== expectedProjectId) {
    throw new Error(`Proyecto inesperado: ${parsed.project_id}`);
  }

  const current = await db.configuracionGoogleWorkspace.findUnique({
    where: { id: "principal" },
    select: {
      serviceAccountEmail: true,
      privateKeyCifrada: true,
      serviceAccountSubject: true,
      driveDestinationId: true,
      activa: true,
      version: true,
    },
  });
  if (!current) throw new Error("No existe la configuración principal de Google Workspace.");
  if (!current.serviceAccountSubject) throw new Error("Falta la cuenta delegada principal.");

  const credential = {
    serviceAccountEmail: parsed.client_email,
    privateKey: parsed.private_key,
    subject: current.serviceAccountSubject,
  };

  await probarCredencialGoogle(credential);
  await probarDelegacionGoogle(credential);
  const scopes = await validarScopesGoogle(credential);
  const failedScopes = scopes.filter((scope) => !scope.autorizado);
  if (failedScopes.length) {
    throw new Error(`Scopes rechazados: ${failedScopes.map((scope) => scope.key).join(", ")}`);
  }

  let driveOk = false;
  if (current.driveDestinationId) {
    await probarDestinoDrive(credential, current.driveDestinationId);
    driveOk = true;
  }

  let preview: { spaceName: string; memberCount: number } | null = null;
  if (previewSubject && meetCode) {
    preview = await probarPreview(
      parsed.client_email,
      parsed.private_key,
      previewSubject,
      meetCode,
    );
  }

  const summary = {
    projectId: parsed.project_id,
    clientEmail: parsed.client_email,
    clientId: parsed.client_id,
    delegatedSubject: current.serviceAccountSubject,
    scopesAuthorized: scopes.length,
    driveOk,
    previewOk: Boolean(preview),
    previewSpace: preview?.spaceName ?? null,
    previewMembers: preview?.memberCount ?? null,
    currentServiceAccount: current.serviceAccountEmail,
    currentVersion: current.version,
    apply,
  };

  if (!apply) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  const previous = {
    serviceAccountEmail: current.serviceAccountEmail,
    privateKeyCifrada: current.privateKeyCifrada,
    version: current.version,
  };

  try {
    const encrypted = cifrarConfiguracion(parsed.private_key);
    await db.configuracionGoogleWorkspace.update({
      where: { id: "principal" },
      data: {
        serviceAccountEmail: parsed.client_email,
        privateKeyCifrada: encrypted,
        version: { increment: 1 },
      },
    });

    const stored = await db.configuracionGoogleWorkspace.findUnique({
      where: { id: "principal" },
      select: { serviceAccountEmail: true, privateKeyCifrada: true, version: true },
    });
    if (!stored?.privateKeyCifrada || stored.serviceAccountEmail !== parsed.client_email) {
      throw new Error("La base no confirmó la nueva cuenta de servicio.");
    }
    if (descifrarConfiguracion(stored.privateKeyCifrada) !== parsed.private_key) {
      throw new Error("La verificación del cifrado de la nueva clave falló.");
    }

    if (deleteFile) await unlink(file);

    console.log(JSON.stringify({
      ...summary,
      applied: true,
      newVersion: stored.version,
      inputFileDeleted: deleteFile,
    }, null, 2));
  } catch (error) {
    await db.configuracionGoogleWorkspace.update({
      where: { id: "principal" },
      data: {
        serviceAccountEmail: previous.serviceAccountEmail,
        privateKeyCifrada: previous.privateKeyCifrada,
        version: previous.version,
      },
    });
    throw error;
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
