ALTER TABLE "EventoProveedor" ADD COLUMN "zoomMeetingUuid" TEXT,
ADD COLUMN "zoomUuidInicioAt" TIMESTAMP(3);
CREATE INDEX "EventoProveedor_zoomMeetingUuid_idx" ON "EventoProveedor"("zoomMeetingUuid");
