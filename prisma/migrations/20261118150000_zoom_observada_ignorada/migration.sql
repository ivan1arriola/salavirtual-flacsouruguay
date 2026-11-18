-- Aditiva y nullable: no reescribe filas ni bloquea lecturas.
ALTER TABLE "ReunionZoomObservada" ADD COLUMN "ignoradaAt" TIMESTAMP(3);
ALTER TABLE "ReunionZoomObservada" ADD COLUMN "ignoradaPorId" TEXT;
