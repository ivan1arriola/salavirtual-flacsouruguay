import { JWT } from "google-auth-library";
import { db } from "../src/lib/db";
import { descifrarConfiguracion } from "../src/lib/config/encryption";
import { obtenerCredencialPrincipalGoogleWorkspace } from "../src/modules/configuracion/api";

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function normalizePrivateKey(value: string): string {
  return value.includes("\\n") ? value.replaceAll("\\n", "\n") : value;
}

async function main() {
  const config = await obtenerCredencialPrincipalGoogleWorkspace(db, descifrarConfiguracion, {
    requireActiva: false,
  });

  const temporaryEmail = process.env["GOOGLE_SERVICE_ACCOUNT_EMAIL"]?.trim();
  const temporaryKey = process.env["GOOGLE_PRIVATE_KEY"]?.trim();
  const temporarySubject = process.env["GOOGLE_SERVICE_ACCOUNT_SUBJECT"]?.trim();

  const serviceAccountEmail = temporaryEmail || config?.serviceAccountEmail;
  const privateKey = temporaryKey ? normalizePrivateKey(temporaryKey) : config?.privateKey;
  const delegatedSubject = temporarySubject || config?.serviceAccountSubject;

  if (!serviceAccountEmail || !privateKey || !delegatedSubject) {
    throw new Error(
      "Faltan credenciales. Define GOOGLE_SERVICE_ACCOUNT_EMAIL y GOOGLE_PRIVATE_KEY temporalmente o completa la configuración principal de Google Workspace.",
    );
  }

  const auth = new JWT({
    email: serviceAccountEmail,
    key: privateKey,
    scopes: [
      "https://www.googleapis.com/auth/meetings.space.created",
      "https://www.googleapis.com/auth/meetings.space.settings",
      "https://www.googleapis.com/auth/meetings.space.readonly",
    ],
    subject: delegatedSubject,
  });

  const created = await auth.request<{
    name?: string;
    meetingUri?: string;
    meetingCode?: string;
  }>({
    url: "https://meet.googleapis.com/v2/spaces",
    method: "POST",
    data: {
      config: {
        moderation: "ON",
        accessType: "TRUSTED",
      },
    },
    timeout: 30_000,
  });

  const spaceName = created.data.name;
  if (!spaceName) {
    throw new Error("Meet no devolvió el nombre del espacio nuevo.");
  }

  const internalCohost = argValue("cohost") ?? "sala01@flacso.edu.uy";
  if (internalCohost.toLowerCase() === delegatedSubject.toLowerCase()) {
    throw new Error("El cohost de prueba no puede ser la misma cuenta que crea el espacio.");
  }

  const member = await auth.request<{
    name?: string;
    email?: string;
    role?: string;
  }>({
    url: `https://meet.googleapis.com/v2/${spaceName}/members`,
    method: "POST",
    data: { email: internalCohost, role: "COHOST" },
    timeout: 30_000,
  });

  const listed = await auth.request<{
    members?: Array<{ email?: string; role?: string }>;
  }>({
    url: `https://meet.googleapis.com/v2/${spaceName}/members?pageSize=20`,
    method: "GET",
    timeout: 30_000,
  });

  console.log(
    JSON.stringify(
      {
        credentialSource: temporaryEmail || temporaryKey ? "temporary-env" : "stored-config",
        serviceAccountEmail,
        delegatedSubject,
        createdSpace: Boolean(spaceName),
        meetingCode: created.data.meetingCode ?? null,
        meetingUri: created.data.meetingUri ?? null,
        testCohost: internalCohost,
        cohostCreated:
          member.data.email?.toLowerCase() === internalCohost.toLowerCase() &&
          member.data.role === "COHOST",
        memberEmail: member.data.email ?? null,
        memberRole: member.data.role ?? null,
        listedMembers: listed.data.members?.map(({ email, role }) => ({ email, role })) ?? [],
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
