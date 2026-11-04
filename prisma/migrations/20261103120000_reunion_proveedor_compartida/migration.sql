-- Reunión externa compartida por todos los encuentros de una serie.
CREATE TABLE "ReunionProveedor" (
  "id" TEXT NOT NULL,
  "proveedorId" TEXT NOT NULL,
  "cuentaProveedorId" TEXT,
  "serieClave" TEXT NOT NULL,
  "externalId" TEXT,
  "joinUrl" TEXT,
  "estadoCreacion" TEXT NOT NULL DEFAULT 'PENDIENTE',
  "reclamoToken" TEXT,
  "reclamoAt" TIMESTAMP(3),
  "estadoIntegracion" "EstadoIntegracion" NOT NULL DEFAULT 'PENDIENTE',
  "errorIntegracion" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReunionProveedor_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ReunionProveedor_proveedorId_externalId_key" ON "ReunionProveedor"("proveedorId", "externalId");
CREATE UNIQUE INDEX "ReunionProveedor_proveedorId_serieClave_key" ON "ReunionProveedor"("proveedorId", "serieClave");
ALTER TABLE "ReunionProveedor" ADD CONSTRAINT "ReunionProveedor_proveedorId_fkey"
  FOREIGN KEY ("proveedorId") REFERENCES "ProveedorReunion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReunionProveedor" ADD CONSTRAINT "ReunionProveedor_cuentaProveedorId_fkey"
  FOREIGN KEY ("cuentaProveedorId") REFERENCES "CuentaProveedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Avance por cita de Calendar.
CREATE TABLE "CambioEnlaceCita" (
  "id" TEXT NOT NULL,
  "instanciaSalaId" TEXT NOT NULL,
  "reunionProveedorId" TEXT NOT NULL,
  "enlaceNuevo" TEXT NOT NULL,
  "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
  "sinCita" BOOLEAN NOT NULL DEFAULT false,
  "reunionAnteriorExternalId" TEXT,
  "eliminarDespuesDe" TIMESTAMP(3),
  "reunionAnteriorEliminadaAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CambioEnlaceCita_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CambioEnlaceCita_instanciaSalaId_reunionProveedorId_key" ON "CambioEnlaceCita"("instanciaSalaId", "reunionProveedorId");
CREATE INDEX "CambioEnlaceCita_eliminarDespuesDe_idx" ON "CambioEnlaceCita"("eliminarDespuesDe");
ALTER TABLE "CambioEnlaceCita" ADD CONSTRAINT "CambioEnlaceCita_instanciaSalaId_fkey"
  FOREIGN KEY ("instanciaSalaId") REFERENCES "InstanciaSala"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CambioEnlaceCita" ADD CONSTRAINT "CambioEnlaceCita_reunionProveedorId_fkey"
  FOREIGN KEY ("reunionProveedorId") REFERENCES "ReunionProveedor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Avisos de cambio de enlace por serie.
CREATE TABLE "AvisoEnlaceSerie" (
  "id" TEXT NOT NULL,
  "serieClave" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "tipo" TEXT NOT NULL,
  "estado" TEXT NOT NULL DEFAULT 'RESERVADO',
  "enviadoAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AvisoEnlaceSerie_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AvisoEnlaceSerie_serieClave_email_tipo_key" ON "AvisoEnlaceSerie"("serieClave", "email", "tipo");
CREATE INDEX "AvisoEnlaceSerie_estado_updatedAt_idx" ON "AvisoEnlaceSerie"("estado", "updatedAt");

-- El ID externo deja de ser único por evento: varios encuentros de una serie comparten reunión.
-- La unicidad pasa a ReunionProveedor. Los eventos existentes quedan sin reunión compartida.
ALTER TABLE "EventoProveedor" ADD COLUMN "reunionProveedorId" TEXT;
DROP INDEX IF EXISTS "EventoProveedor_proveedorId_externalEventId_key";
CREATE INDEX "EventoProveedor_proveedorId_externalEventId_idx" ON "EventoProveedor"("proveedorId", "externalEventId");
CREATE INDEX "EventoProveedor_reunionProveedorId_idx" ON "EventoProveedor"("reunionProveedorId");
ALTER TABLE "EventoProveedor" ADD CONSTRAINT "EventoProveedor_reunionProveedorId_fkey"
  FOREIGN KEY ("reunionProveedorId") REFERENCES "ReunionProveedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
