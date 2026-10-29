-- AlterEnum
ALTER TYPE "TipoProveedor" ADD VALUE IF NOT EXISTS 'ZOOM';
ALTER TYPE "OrigenGrabacion" ADD VALUE IF NOT EXISTS 'ZOOM';

-- CreateTable
CREATE TABLE IF NOT EXISTS "ConfiguracionZoom" (
    "id" TEXT NOT NULL DEFAULT 'principal',
    "accountId" TEXT,
    "clientId" TEXT,
    "clientSecretCifrado" TEXT,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "actualizadaPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfiguracionZoom_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ConfiguracionZoom_actualizadaPorId_updatedAt_idx" ON "ConfiguracionZoom"("actualizadaPorId", "updatedAt");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ConfiguracionZoom_actualizadaPorId_fkey'
    ) THEN
        ALTER TABLE "ConfiguracionZoom" ADD CONSTRAINT "ConfiguracionZoom_actualizadaPorId_fkey" FOREIGN KEY ("actualizadaPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
