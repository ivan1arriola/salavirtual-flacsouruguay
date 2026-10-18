CREATE TABLE "ConfiguracionCorreoSes" (
    "id" TEXT NOT NULL DEFAULT 'principal',
    "awsRegion" TEXT,
    "fromEmail" TEXT,
    "replyToEmail" TEXT,
    "activa" BOOLEAN NOT NULL DEFAULT false,
    "actualizadaPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ConfiguracionCorreoSes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ConfiguracionCorreoSes_actualizadaPorId_updatedAt_idx"
    ON "ConfiguracionCorreoSes"("actualizadaPorId", "updatedAt");

ALTER TABLE "ConfiguracionCorreoSes"
    ADD CONSTRAINT "ConfiguracionCorreoSes_actualizadaPorId_fkey"
    FOREIGN KEY ("actualizadaPorId") REFERENCES "Usuario"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
