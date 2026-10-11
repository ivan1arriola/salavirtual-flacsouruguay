import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const apply = process.argv.includes("--apply");
const confirmed = process.argv.includes("--confirm-oauth-unused");

// The runtime uses Google service-account credentials rather than stored
// per-user OAuth grants. Keep cleanup gated on operational verification.
async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL es obligatoria.");
  const filters = [
    { refresh_token: { not: null } },
    { access_token: { not: null } },
    { id_token: { not: null } }
  ];
  const affected = await db.cuentaGoogleFlacso.count({ where: { OR: filters } });
  console.log(JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    cuentasConTokensOauth: affected
  }, null, 2));

  if (!apply || affected === 0) return;
  if (!confirmed) {
    throw new Error("Antes de eliminar tokens, verificar consumidores y usar --apply --confirm-oauth-unused.");
  }
  const updated = await db.cuentaGoogleFlacso.updateMany({
    where: { OR: filters },
    data: {
      refresh_token: null,
      access_token: null,
      id_token: null,
      expires_at: null,
      token_type: null,
      scope: null,
      session_state: null
    }
  });
  console.log(JSON.stringify({ cleaned: updated.count }));
}

void main().finally(() => db.$disconnect());
