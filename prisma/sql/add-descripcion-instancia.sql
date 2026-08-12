ALTER TABLE "InstanciaSala"
ADD COLUMN IF NOT EXISTS "descripcion" TEXT;

UPDATE "InstanciaSala" AS instancia
SET "descripcion" = solicitud."descripcion"
FROM "SolicitudSala" AS solicitud
WHERE instancia."solicitudSalaId" = solicitud."id"
  AND instancia."descripcion" IS NULL
  AND solicitud."descripcion" IS NOT NULL;
