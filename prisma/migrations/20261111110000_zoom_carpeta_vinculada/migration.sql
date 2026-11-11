-- Aditiva: marca de carpeta de Drive verificada bajo la raíz de vinculados (el worker mueve las pendientes).
ALTER TABLE "OcurrenciaArchivoZoom" ADD COLUMN "carpetaVinculadaAt" TIMESTAMP(3);
CREATE INDEX "OcurrenciaArchivoZoom_carpetaVinculadaAt_idx" ON "OcurrenciaArchivoZoom"("carpetaVinculadaAt");
