import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { parseEncryptionKey } from "../../modules/configuracion/encryption-key.domain";

const encryptionKey = Buffer.from(
  parseEncryptionKey(process.env.CONFIG_ENCRYPTION_KEY),
  "hex",
);

export function cifrarConfiguracion(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    "v1",
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

export function descifrarConfiguracion(value: string): string {
  const [version, ivBase64, authTagBase64, encryptedBase64] = value.split(":");
  if (version !== "v1" || !ivBase64 || !authTagBase64 || !encryptedBase64) {
    throw new Error("La configuracion cifrada tiene un formato invalido.");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey,
    Buffer.from(ivBase64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(authTagBase64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedBase64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
