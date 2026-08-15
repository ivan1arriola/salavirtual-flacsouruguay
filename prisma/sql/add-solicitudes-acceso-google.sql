CREATE TYPE "EstadoSolicitudAccesoGoogle" AS ENUM ('PENDIENTE', 'APROBADA');

CREATE TABLE "SolicitudAccesoGoogle" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "providerAccountId" TEXT NOT NULL,
  "nombres" TEXT NOT NULL,
  "apellidos" TEXT,
  "imagenUrl" TEXT,
  "estado" "EstadoSolicitudAccesoGoogle" NOT NULL DEFAULT 'PENDIENTE',
  "aprobadaPorUsuarioId" TEXT,
  "aprobadaAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SolicitudAccesoGoogle_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SolicitudAccesoGoogle_email_key" ON "SolicitudAccesoGoogle"("email");
CREATE UNIQUE INDEX "SolicitudAccesoGoogle_providerAccountId_key" ON "SolicitudAccesoGoogle"("providerAccountId");
CREATE INDEX "SolicitudAccesoGoogle_estado_createdAt_idx" ON "SolicitudAccesoGoogle"("estado", "createdAt");
ALTER TABLE "SolicitudAccesoGoogle" ADD CONSTRAINT "SolicitudAccesoGoogle_aprobadaPorUsuarioId_fkey" FOREIGN KEY ("aprobadaPorUsuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
