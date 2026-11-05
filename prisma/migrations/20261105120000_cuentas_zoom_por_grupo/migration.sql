-- Cuentas anfitrionas de Zoom sincronizadas desde un grupo de Zoom.
ALTER TABLE "ConfiguracionZoom"
  ADD COLUMN "grupoId" TEXT,
  ADD COLUMN "grupoNombre" TEXT,
  ADD COLUMN "ultimaSincronizacionAt" TIMESTAMP(3),
  ADD COLUMN "ultimaSincronizacionResultado" TEXT,
  ADD COLUMN "sincronizandoDesdeAt" TIMESTAMP(3);

ALTER TABLE "CuentaProveedor"
  ADD COLUMN "origenGrupoZoom" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "fueraDelGrupoAt" TIMESTAMP(3);
