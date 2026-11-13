ALTER TABLE "OcurrenciaArchivoZoom" ADD COLUMN "notificacionGrabacionPreparadaAt" TIMESTAMP(3);

CREATE TABLE "AvisoGrabacionZoom" (
    "id" TEXT NOT NULL,
    "ocurrenciaId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "enviadoAt" TIMESTAMP(3),
    "errorCodigo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AvisoGrabacionZoom_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AvisoGrabacionZoom_ocurrenciaId_email_key" ON "AvisoGrabacionZoom"("ocurrenciaId", "email");
CREATE INDEX "AvisoGrabacionZoom_estado_updatedAt_idx" ON "AvisoGrabacionZoom"("estado", "updatedAt");
ALTER TABLE "AvisoGrabacionZoom" ADD CONSTRAINT "AvisoGrabacionZoom_ocurrenciaId_fkey" FOREIGN KEY ("ocurrenciaId") REFERENCES "OcurrenciaArchivoZoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
