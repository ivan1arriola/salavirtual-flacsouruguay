CREATE TABLE "AvisoMigracionZoom" (
  "id" TEXT NOT NULL,
  "instanciaSalaId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "inicioProgramadoAt" TIMESTAMP(3) NOT NULL,
  "joinUrl" TEXT NOT NULL,
  "estado" TEXT NOT NULL DEFAULT 'RESERVADO',
  "intentos" INTEGER NOT NULL DEFAULT 1,
  "errorCodigo" TEXT,
  "enviadoAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AvisoMigracionZoom_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AvisoMigracionZoomUnico" ON "AvisoMigracionZoom"("instanciaSalaId", "email");
CREATE INDEX "AvisoMigracionZoom_estado_updatedAt_idx" ON "AvisoMigracionZoom"("estado", "updatedAt");
ALTER TABLE "AvisoMigracionZoom" ADD CONSTRAINT "AvisoMigracionZoom_instanciaSalaId_fkey"
  FOREIGN KEY ("instanciaSalaId") REFERENCES "InstanciaSala"("id") ON DELETE CASCADE ON UPDATE CASCADE;
