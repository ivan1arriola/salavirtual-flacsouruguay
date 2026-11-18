-- Aditiva: columnas opcionales para eventos en vivo (ids opacos, sin datos personales).
ALTER TABLE "EventoWebhookZoomAdicional" ADD COLUMN "participanteId" TEXT, ADD COLUMN "detalle" TEXT;
