import { z } from "zod";

const encryptionKeySchema = z
  .string()
  .regex(/^[a-f0-9]{64}$/i, "CONFIG_ENCRYPTION_KEY debe contener 32 bytes en hexadecimal.");

export function parseEncryptionKey(value: unknown): string {
  return encryptionKeySchema.parse(value);
}
