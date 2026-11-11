-- Aditiva: el barrido histórico también recorre la papelera de Zoom (fuente persistida por posición).
ALTER TABLE "BarridoArchivoZoom" ADD COLUMN "fuenteListado" TEXT NOT NULL DEFAULT 'ACTIVAS';
