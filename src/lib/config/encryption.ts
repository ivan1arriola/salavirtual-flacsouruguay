import { createCipheriv, randomBytes } from "node:crypto";
import { parseEncryptionKey } from "@/src/modules/configuracion/encryption-key.domain";

const encryptionKey = Buffer.from(parseEncryptionKey(process.env.CONFIG_ENCRYPTION_KEY), "hex");

export function cifrarConfiguracion(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return ["v1", iv.toString("base64"), authTag.toString("base64"), encrypted.toString("base64")].join(
    ":"
  );
}
