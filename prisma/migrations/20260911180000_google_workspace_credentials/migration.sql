-- Credenciales de Google Workspace administradas desde la UI.
CREATE TYPE "TipoCredencialGoogleWorkspace" AS ENUM ('PRINCIPAL', 'LEGACY');

CREATE TABLE "CredencialGoogleWorkspace" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" "TipoCredencialGoogleWorkspace" NOT NULL,
    "serviceAccountEmail" TEXT NOT NULL,
    "privateKeyCifrada" TEXT NOT NULL,
    "projectId" TEXT,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "prioridad" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CredencialGoogleWorkspace_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CredencialGoogleWorkspace_serviceAccountEmail_key"
ON "CredencialGoogleWorkspace"("serviceAccountEmail");

CREATE UNIQUE INDEX "CredencialGoogleWorkspace_principal_key"
ON "CredencialGoogleWorkspace"("tipo")
WHERE "tipo" = 'PRINCIPAL';

CREATE INDEX "CredencialGoogleWorkspace_tipo_activa_prioridad_idx"
ON "CredencialGoogleWorkspace"("tipo", "activa", "prioridad");

-- La credencial que ya estaba en ConfiguracionGoogleWorkspace pasa a ser la Principal.
INSERT INTO "CredencialGoogleWorkspace" (
    "id", "nombre", "tipo", "serviceAccountEmail", "privateKeyCifrada", "projectId", "activa", "prioridad"
)
SELECT
    'principal-migrada',
    'Sala Virtual',
    'PRINCIPAL',
    "serviceAccountEmail",
    "privateKeyCifrada",
    regexp_replace(split_part("serviceAccountEmail", '@', 2), '\.iam\.gserviceaccount\.com$', ''),
    "activa",
    0
FROM "ConfiguracionGoogleWorkspace"
WHERE "id" = 'principal'
  AND "serviceAccountEmail" IS NOT NULL
  AND "privateKeyCifrada" IS NOT NULL
ON CONFLICT ("serviceAccountEmail") DO NOTHING;
