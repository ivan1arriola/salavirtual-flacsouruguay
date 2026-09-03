import { execFileSync } from "node:child_process";

const VERIFIED_DEPLOY_MARKER = "[vercel-deploy:verified]";

function latestCommitMessage() {
  try {
    return execFileSync("git", ["log", "-1", "--pretty=%B"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }).trim();
  } catch (error) {
    console.log("No se pudo leer el commit actual; se omite el build de Vercel por seguridad.");
    if (error instanceof Error) console.log(error.message);
    return "";
  }
}

const message = latestCommitMessage();
const verified = message.includes(VERIFIED_DEPLOY_MARKER);

if (verified) {
  console.log("CI de GitHub aprobada: Vercel puede continuar con el build.");
  process.exit(1);
}

console.log("Sin marca de CI aprobada: Vercel omite este build.");
console.log(`Marca requerida: ${VERIFIED_DEPLOY_MARKER}`);
process.exit(0);
