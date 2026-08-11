ALTER TABLE "AsistenteTecnico"
ADD COLUMN IF NOT EXISTS "cesadoHastaProximoInicioSesion" BOOLEAN NOT NULL DEFAULT false;
