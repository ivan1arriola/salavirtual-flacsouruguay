CREATE TABLE "EventoWebhookZoomAdicional" (
    "id" TEXT NOT NULL,
    "huella" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "cuentaZoomId" TEXT NOT NULL,
    "recursoId" TEXT,
    "uuid" TEXT,
    "uuids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "ocurridoAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventoWebhookZoomAdicional_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EventoWebhookZoomAdicional_huella_key" ON "EventoWebhookZoomAdicional"("huella");
CREATE INDEX "EventoWebhookZoomAdicional_cuentaZoomId_tipo_ocurridoAt_idx" ON "EventoWebhookZoomAdicional"("cuentaZoomId", "tipo", "ocurridoAt");
CREATE INDEX "EventoWebhookZoomAdicional_cuentaZoomId_uuid_idx" ON "EventoWebhookZoomAdicional"("cuentaZoomId", "uuid");
CREATE INDEX "EventoWebhookZoomAdicional_uuids_idx" ON "EventoWebhookZoomAdicional" USING GIN ("uuids");
