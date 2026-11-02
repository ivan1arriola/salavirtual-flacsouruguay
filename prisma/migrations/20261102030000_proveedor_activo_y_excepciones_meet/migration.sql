ALTER TABLE "InstanciaSala"
  ADD COLUMN "proveedorActivoTipo" "TipoProveedor",
  ADD COLUMN "conservarGoogleMeet" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "motivoConservarGoogleMeet" TEXT;

-- Meet remains active when both provider records exist and Zoom is still
-- being prepared. Historical Zoom imports alone do not become active rooms.
UPDATE "InstanciaSala" AS instancia
SET "proveedorActivoTipo" = CASE
  WHEN EXISTS (
    SELECT 1 FROM "EventoProveedor" AS evento
    JOIN "ProveedorReunion" AS proveedor ON proveedor.id = evento."proveedorId"
    WHERE evento."instanciaSalaId" = instancia.id AND proveedor.tipo = 'GOOGLE_MEET'
  ) THEN 'GOOGLE_MEET'::"TipoProveedor"
  WHEN EXISTS (
    SELECT 1 FROM "EventoProveedor" AS evento
    JOIN "ProveedorReunion" AS proveedor ON proveedor.id = evento."proveedorId"
    WHERE evento."instanciaSalaId" = instancia.id AND proveedor.tipo = 'ZOOM'
  ) THEN 'ZOOM'::"TipoProveedor"
  ELSE NULL
END;

CREATE INDEX "InstanciaSala_migracion_zoom_idx"
  ON "InstanciaSala"("proveedorActivoTipo", "conservarGoogleMeet", "estado", "inicioProgramadoAt");
