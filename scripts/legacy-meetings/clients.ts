import { createRequire } from "node:module";
import { Prisma, PrismaClient } from "@prisma/client";
import type { PrismaClient as LegacyPrismaClientType } from "../../../flacso-zoom-plataforma-web/node_modules/@prisma/client";

const legacyRequire = createRequire(
  new URL("../../../flacso-zoom-plataforma-web/package.json", import.meta.url)
);
const { PrismaClient: LegacyPrismaClient } = legacyRequire("@prisma/client") as {
  PrismaClient: new (options: { datasourceUrl: string }) => LegacyPrismaClientType;
};

if (!process.env.DATABASE_URL || !process.env.LEGACY_DATABASE_URL) {
  throw new Error("DATABASE_URL y LEGACY_DATABASE_URL son obligatorias.");
}

export const source = new LegacyPrismaClient({
  datasourceUrl: process.env.LEGACY_DATABASE_URL
});
export const target = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL
});

export const jsonValue = (value: unknown): Prisma.InputJsonValue | undefined =>
  value === null || value === undefined
    ? undefined
    : (JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue);

export async function disconnectClients(): Promise<void> {
  await Promise.all([source.$disconnect(), target.$disconnect()]);
}
