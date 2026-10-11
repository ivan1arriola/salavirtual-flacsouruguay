-- A post-response timeout is not proof that Google failed to apply a POST.
-- Retain uncertain operations for manual reconciliation; never auto-replay them.
CREATE TABLE "GoogleOperacionExterna" (
    "clave" TEXT NOT NULL,
    "proveedor" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "cuenta" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'RESERVADA',
    "resultado" JSONB,
    "errorCodigo" TEXT,
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "iniciadaAt" TIMESTAMP(3),
    "terminadaAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GoogleOperacionExterna_pkey" PRIMARY KEY ("clave"),
    CONSTRAINT "GoogleOperacionExterna_estado_check" CHECK ("estado" IN ('RESERVADA', 'ENVIANDO', 'CONFIRMADA', 'INCIERTA'))
);

CREATE INDEX "GoogleOperacionExterna_estado_updatedAt_idx"
  ON "GoogleOperacionExterna"("estado", "updatedAt");
CREATE INDEX "GoogleOperacionExterna_proveedor_cuenta_estado_idx"
  ON "GoogleOperacionExterna"("proveedor", "cuenta", "estado");

CREATE TABLE "GoogleCuentaLease" (
    "clave" TEXT NOT NULL,
    "token" TEXT,
    "venceAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GoogleCuentaLease_pkey" PRIMARY KEY ("clave")
);
CREATE INDEX "GoogleCuentaLease_venceAt_idx" ON "GoogleCuentaLease"("venceAt");
