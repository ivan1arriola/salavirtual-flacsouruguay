-- AlterTable
ALTER TABLE "SolicitudSala" ADD COLUMN IF NOT EXISTS "serieReunionId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SolicitudSala_serieReunionId_idx" ON "SolicitudSala"("serieReunionId");

