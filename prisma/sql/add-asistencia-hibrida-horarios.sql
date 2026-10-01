ALTER TABLE "InstanciaSala"
  ADD COLUMN IF NOT EXISTS "modalidadOverride" "ModalidadReunion",
  ADD COLUMN IF NOT EXISTS "inicioAsistenciaTecnicaAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "finAsistenciaTecnicaAt" TIMESTAMP(3);

COMMENT ON COLUMN "InstanciaSala"."modalidadOverride" IS
  'Excepción de modalidad para este encuentro; NULL hereda SolicitudSala.modalidad.';
COMMENT ON COLUMN "InstanciaSala"."inicioAsistenciaTecnicaAt" IS
  'Hora exacta de llegada del asistente técnico para este encuentro.';
COMMENT ON COLUMN "InstanciaSala"."finAsistenciaTecnicaAt" IS
  'Hora exacta de salida del asistente técnico para este encuentro.';
