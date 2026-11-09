-- Asistencia de Zoom persistente (entrega C): sesiones observadas por ocurrencia y resumen
-- consolidado por participante. Migración solo aditiva: crea un tipo, dos tablas, índices y FK
-- nuevas desde tablas nuevas y vacías. La asistencia de Meet y el resto de sus tablas no se tocan.

-- CreateEnum
CREATE TYPE "EstadoConciliacionAsistenciaZoom" AS ENUM ('SIN_CONCILIAR', 'SUGERIDO', 'CONCILIADO', 'EXTERNO');

-- CreateTable
CREATE TABLE "SesionAsistenciaZoom" (
    "id" TEXT NOT NULL,
    "ocurrenciaId" TEXT NOT NULL,
    "claveSesion" TEXT NOT NULL,
    "participanteId" TEXT,
    "userId" TEXT,
    "nombre" TEXT NOT NULL,
    "email" TEXT,
    "entradaAt" TIMESTAMP(3) NOT NULL,
    "salidaAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT,
    "rol" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SesionAsistenciaZoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistroAsistenciaZoom" (
    "id" TEXT NOT NULL,
    "claveAmbito" TEXT NOT NULL,
    "eventoProveedorId" TEXT,
    "ocurrenciaId" TEXT,
    "claveParticipante" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "emailObservado" TEXT,
    "minutos" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "porcentaje" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "sesiones" INTEGER NOT NULL DEFAULT 0,
    "primeraEntradaAt" TIMESTAMP(3),
    "ultimaSalidaAt" TIMESTAMP(3),
    "esHostOCohost" BOOLEAN NOT NULL DEFAULT false,
    "estadoConciliacion" "EstadoConciliacionAsistenciaZoom" NOT NULL DEFAULT 'SIN_CONCILIAR',
    "invitadoReunionId" TEXT,
    "esExterno" BOOLEAN,
    "notasOperador" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegistroAsistenciaZoom_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SesionAsistenciaZoom_ocurrenciaId_idx" ON "SesionAsistenciaZoom"("ocurrenciaId");

-- CreateIndex
CREATE UNIQUE INDEX "SesionAsistenciaZoom_ocurrenciaId_claveSesion_key" ON "SesionAsistenciaZoom"("ocurrenciaId", "claveSesion");

-- CreateIndex
CREATE INDEX "RegistroAsistenciaZoom_eventoProveedorId_idx" ON "RegistroAsistenciaZoom"("eventoProveedorId");

-- CreateIndex
CREATE INDEX "RegistroAsistenciaZoom_ocurrenciaId_idx" ON "RegistroAsistenciaZoom"("ocurrenciaId");

-- CreateIndex
CREATE INDEX "RegistroAsistenciaZoom_invitadoReunionId_idx" ON "RegistroAsistenciaZoom"("invitadoReunionId");

-- CreateIndex
CREATE UNIQUE INDEX "RegistroAsistenciaZoom_claveAmbito_claveParticipante_key" ON "RegistroAsistenciaZoom"("claveAmbito", "claveParticipante");

-- AddForeignKey
ALTER TABLE "SesionAsistenciaZoom" ADD CONSTRAINT "SesionAsistenciaZoom_ocurrenciaId_fkey" FOREIGN KEY ("ocurrenciaId") REFERENCES "OcurrenciaArchivoZoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistroAsistenciaZoom" ADD CONSTRAINT "RegistroAsistenciaZoom_eventoProveedorId_fkey" FOREIGN KEY ("eventoProveedorId") REFERENCES "EventoProveedor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistroAsistenciaZoom" ADD CONSTRAINT "RegistroAsistenciaZoom_ocurrenciaId_fkey" FOREIGN KEY ("ocurrenciaId") REFERENCES "OcurrenciaArchivoZoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistroAsistenciaZoom" ADD CONSTRAINT "RegistroAsistenciaZoom_invitadoReunionId_fkey" FOREIGN KEY ("invitadoReunionId") REFERENCES "InvitadoReunion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

