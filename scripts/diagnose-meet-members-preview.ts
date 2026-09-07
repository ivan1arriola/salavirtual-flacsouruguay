import { JWT } from "google-auth-library";
import { db } from "../src/lib/db";
import { descifrarConfiguracion } from "../src/lib/config/encryption";

async function main() {
  const config = await db.configuracionGoogleWorkspace.findUnique({
    where: { id: "principal" },
    select: {
      serviceAccountEmail: true,
      privateKeyCifrada: true,
      serviceAccountSubject: true,
      activa: true,
    },
  });

  if (!config?.activa || !config.serviceAccountEmail || !config.privateKeyCifrada || !config.serviceAccountSubject) {
    throw new Error("Google Workspace no está configurado completamente.");
  }

  const key = descifrarConfiguracion(config.privateKeyCifrada);
  const auth = new JWT({
    email: config.serviceAccountEmail,
    key,
    scopes: [
      "https://www.googleapis.com/auth/meetings.space.created",
      "https://www.googleapis.com/auth/meetings.space.settings",
      "https://www.googleapis.com/auth/meetings.space.readonly",
    ],
    subject: config.serviceAccountSubject,
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
  if (!spaceName) throw new Error("Meet no devolvió el nombre del espacio nuevo.");

  const internalCohost = "web@flacso.edu.uy";
  const member = await auth.request<{
    name?: string;
    email?: string;
    role?: string;
  }>({
    url: `https://meet.googleapis.com/v2beta/${spaceName}/members`,
    method: "POST",
    data: { email: internalCohost, role: "COHOST" },
    timeout: 30_000,
  });

  const listed = await auth.request<{
    members?: Array<{ email?: string; role?: string }>;
  }>({
    url: `https://meet.googleapis.com/v2beta/${spaceName}/members?pageSize=20`,
    method: "GET",
    timeout: 30_000,
  });

  console.log(JSON.stringify({
    serviceAccountEmail: config.serviceAccountEmail,
    delegatedSubject: config.serviceAccountSubject,
    createdSpace: Boolean(spaceName),
    meetingCode: created.data.meetingCode ?? null,
    meetingUri: created.data.meetingUri ?? null,
    cohostCreated: member.data.email === internalCohost && member.data.role === "COHOST",
    memberEmail: member.data.email ?? null,
    memberRole: member.data.role ?? null,
    listedMembers: listed.data.members?.map(({ email, role }) => ({ email, role })) ?? [],
  }, null, 2));
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
