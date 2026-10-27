ALTER TABLE "EventoProveedor"
  ADD COLUMN "grabacionEstadoMeet" TEXT,
  ADD COLUMN "grabacionObservadaAt" TIMESTAMP(3);

CREATE INDEX "EventoProveedor_grabacionEstadoMeet_grabacionObservadaAt_idx"
  ON "EventoProveedor"("grabacionEstadoMeet", "grabacionObservadaAt");
