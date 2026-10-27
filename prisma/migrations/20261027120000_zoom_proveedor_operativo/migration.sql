-- Zoom vuelve como proveedor operativo, conviviendo con Google Meet.
ALTER TYPE "TipoProveedor" ADD VALUE IF NOT EXISTS 'ZOOM';

ALTER TABLE "SolicitudSala"
    ADD COLUMN "tipoProveedor" "TipoProveedor" NOT NULL DEFAULT 'GOOGLE_MEET';

CREATE TABLE "ConfiguracionZoom" (
    "id" TEXT NOT NULL DEFAULT 'principal',
    "accountId" TEXT,
    "clientId" TEXT,
    "clientSecretCifrado" TEXT,
    "activa" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "actualizadaPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ConfiguracionZoom_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ConfiguracionZoom_actualizadaPorId_updatedAt_idx"
    ON "ConfiguracionZoom"("actualizadaPorId", "updatedAt");

ALTER TABLE "ConfiguracionZoom"
    ADD CONSTRAINT "ConfiguracionZoom_actualizadaPorId_fkey"
    FOREIGN KEY ("actualizadaPorId") REFERENCES "Usuario"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
