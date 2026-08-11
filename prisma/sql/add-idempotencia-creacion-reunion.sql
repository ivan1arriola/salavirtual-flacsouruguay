ALTER TABLE "SolicitudSala"
ADD COLUMN IF NOT EXISTS "claveIdempotenciaCreacion" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "SolicitudSala_claveIdempotenciaCreacion_key"
ON "SolicitudSala"("claveIdempotenciaCreacion");
