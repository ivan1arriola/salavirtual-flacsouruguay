ALTER TABLE "InstanciaSala"
  ADD COLUMN IF NOT EXISTS "modalidadOverride" "ModalidadReunion",
  ADD COLUMN IF NOT EXISTS "inicioAsistenciaTecnicaAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "finAsistenciaTecnicaAt" TIMESTAMP(3);

ALTER TABLE "SolicitudSala"
  ADD COLUMN IF NOT EXISTS "inicioAsistenciaTecnicaAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "finAsistenciaTecnicaAt" TIMESTAMP(3);

UPDATE "SolicitudSala" AS serie
SET
  "inicioAsistenciaTecnicaAt" = base."inicioAsistenciaTecnicaAt",
  "finAsistenciaTecnicaAt" = base."finAsistenciaTecnicaAt"
FROM (
  SELECT DISTINCT ON ("solicitudSalaId")
    "solicitudSalaId",
    "inicioAsistenciaTecnicaAt",
    "finAsistenciaTecnicaAt"
  FROM "InstanciaSala"
  WHERE "inicioAsistenciaTecnicaAt" IS NOT NULL
    AND "finAsistenciaTecnicaAt" IS NOT NULL
  ORDER BY "solicitudSalaId", "ordinal"
) AS base
WHERE serie.id = base."solicitudSalaId"
  AND serie."inicioAsistenciaTecnicaAt" IS NULL
  AND serie."finAsistenciaTecnicaAt" IS NULL;

COMMENT ON COLUMN "InstanciaSala"."modalidadOverride" IS
  'Excepción de modalidad para este encuentro; NULL hereda SolicitudSala.modalidad.';
COMMENT ON COLUMN "InstanciaSala"."inicioAsistenciaTecnicaAt" IS
  'Hora exacta de llegada del asistente técnico para este encuentro.';
COMMENT ON COLUMN "InstanciaSala"."finAsistenciaTecnicaAt" IS
  'Hora exacta de salida del asistente técnico para este encuentro.';
COMMENT ON COLUMN "SolicitudSala"."inicioAsistenciaTecnicaAt" IS
  'Hora base de llegada del asistente técnico para la serie.';
COMMENT ON COLUMN "SolicitudSala"."finAsistenciaTecnicaAt" IS
  'Hora base de salida del asistente técnico para la serie.';
