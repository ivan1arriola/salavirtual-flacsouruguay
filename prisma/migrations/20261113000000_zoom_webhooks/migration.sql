CREATE TABLE "EventoWebhookZoom" (
    "id" TEXT NOT NULL,
    "huella" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "cuentaZoomId" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "uuid" TEXT NOT NULL,
    "anfitrionZoomId" TEXT NOT NULL,
    "inicioRealAt" TIMESTAMP(3) NOT NULL,
    "finRealAt" TIMESTAMP(3),
    "titulo" TEXT NOT NULL,
    "ocurridoAt" TIMESTAMP(3) NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'RECIBIDO',
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "proximoIntentoAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimHasta" TIMESTAMP(3),
    "procesadoAt" TIMESTAMP(3),
    "errorCodigo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EventoWebhookZoom_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EventoWebhookZoom_huella_key" ON "EventoWebhookZoom"("huella");
CREATE INDEX "EventoWebhookZoom_estado_proximoIntentoAt_idx" ON "EventoWebhookZoom"("estado", "proximoIntentoAt");
CREATE INDEX "EventoWebhookZoom_cuentaZoomId_uuid_idx" ON "EventoWebhookZoom"("cuentaZoomId", "uuid");
