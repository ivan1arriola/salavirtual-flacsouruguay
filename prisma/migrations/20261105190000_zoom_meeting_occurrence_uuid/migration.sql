ALTER TABLE "EventoProveedor" ADD COLUMN "zoomMeetingUuid" TEXT;
CREATE INDEX "EventoProveedor_zoomMeetingUuid_idx" ON "EventoProveedor"("zoomMeetingUuid");
