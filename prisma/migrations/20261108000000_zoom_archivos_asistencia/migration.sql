-- Inventario persistente de archivos Zoom, barridos históricos reanudables y cupo de
-- transferencia (entrega A). Migración solo aditiva: crea tipos, tablas, índices y FK
-- nuevas; no modifica columnas, restricciones ni datos de tablas existentes (Meet intacto).
-- Las FK hacia tablas existentes salen de tablas nuevas y vacías: la validación es inmediata.
-- Borrar un encuentro, un ArchivoReunion o un usuario deja NULL en las referencias opcionales
-- y nunca borra ocurrencias ni archivos de origen (RESTRICT en las FK obligatorias).

-- CreateEnum
CREATE TYPE "EstadoArchivoZoom" AS ENUM ('DESCUBIERTO', 'PROCESANDO_ORIGEN', 'PENDIENTE', 'COPIANDO', 'CONSERVADO', 'ERROR_REINTENTABLE', 'REQUIERE_REVISION');

-- CreateEnum
CREATE TYPE "EstadoBarridoArchivoZoom" AS ENUM ('PENDIENTE', 'EN_CURSO', 'COMPLETADO', 'ERROR_REINTENTABLE', 'REQUIERE_REVISION', 'CANCELADO');

-- CreateEnum
CREATE TYPE "PrioridadTransferenciaZoom" AS ENUM ('RECIENTE', 'HISTORICO');

-- CreateTable
CREATE TABLE "OcurrenciaArchivoZoom" (
    "id" TEXT NOT NULL,
    "cuentaZoomId" TEXT NOT NULL,
    "uuid" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "anfitrionZoomId" TEXT NOT NULL,
    "cuentaProveedorId" TEXT,
    "eventoProveedorId" TEXT,
    "inicioRealAt" TIMESTAMP(3) NOT NULL,
    "titulo" TEXT NOT NULL,
    "driveFolderId" TEXT,
    "inventariadoAt" TIMESTAMP(3),
    "proximoInventarioAt" TIMESTAMP(3),
    "procesamientoPendiente" BOOLEAN NOT NULL DEFAULT false,
    "observacionesInventario" JSONB,
    "vinculadaAt" TIMESTAMP(3),
    "vinculadaPorId" TEXT,
    "estadoAsistencia" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "errorAsistencia" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OcurrenciaArchivoZoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArchivoOrigenZoom" (
    "id" TEXT NOT NULL,
    "ocurrenciaId" TEXT NOT NULL,
    "claveOrigen" TEXT NOT NULL,
    "archivoZoomId" TEXT,
    "coleccion" TEXT NOT NULL,
    "tipoOriginal" TEXT NOT NULL,
    "variante" TEXT,
    "extension" TEXT,
    "inicioAt" TIMESTAMP(3),
    "finAt" TIMESTAMP(3),
    "tamanoBytes" BIGINT,
    "estadoOrigen" TEXT,
    "descargable" BOOLEAN NOT NULL DEFAULT false,
    "multiplicidadObservada" INTEGER NOT NULL DEFAULT 1,
    "estado" "EstadoArchivoZoom" NOT NULL DEFAULT 'DESCUBIERTO',
    "errorCodigo" TEXT,
    "errorDetalle" TEXT,
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "proximoIntentoAt" TIMESTAMP(3),
    "leaseVersion" INTEGER NOT NULL DEFAULT 0,
    "leaseHasta" TIMESTAMP(3),
    "nombreDestino" TEXT NOT NULL,
    "driveFileId" TEXT,
    "archivoReunionId" TEXT,
    "uploadSessionCifrada" TEXT,
    "bytesConfirmados" BIGINT NOT NULL DEFAULT 0,
    "mimeType" TEXT,
    "webViewUrl" TEXT,
    "ultimaObservacionAt" TIMESTAMP(3) NOT NULL,
    "conservadoAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArchivoOrigenZoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BarridoArchivoZoom" (
    "id" TEXT NOT NULL,
    "cuentaZoomId" TEXT NOT NULL,
    "anfitrionesSnapshot" JSONB NOT NULL,
    "desde" DATE NOT NULL,
    "hasta" DATE NOT NULL,
    "anfitrionIndice" INTEGER NOT NULL DEFAULT 0,
    "ventanaDesde" DATE,
    "ventanaHasta" DATE,
    "nextPageTokenCifrado" TEXT,
    "estado" "EstadoBarridoArchivoZoom" NOT NULL DEFAULT 'PENDIENTE',
    "paginasProcesadas" INTEGER NOT NULL DEFAULT 0,
    "ocurrenciasEncontradas" INTEGER NOT NULL DEFAULT 0,
    "archivosEncontrados" INTEGER NOT NULL DEFAULT 0,
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "proximoIntentoAt" TIMESTAMP(3),
    "errorCodigo" TEXT,
    "errorDetalle" TEXT,
    "leaseVersion" INTEGER NOT NULL DEFAULT 0,
    "leaseHasta" TIMESTAMP(3),
    "solicitanteId" TEXT,
    "completadoAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BarridoArchivoZoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReservaTransferenciaZoom" (
    "id" TEXT NOT NULL,
    "archivoOrigenId" TEXT NOT NULL,
    "leaseVersion" INTEGER NOT NULL,
    "bytesReservados" BIGINT NOT NULL,
    "bytesConfirmadosInicio" BIGINT NOT NULL DEFAULT 0,
    "prioridad" "PrioridadTransferenciaZoom" NOT NULL,
    "reservadoAt" TIMESTAMP(3) NOT NULL,
    "ajustadoBytes" BIGINT,
    "liberadoAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReservaTransferenciaZoom_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OcurrenciaArchivoZoom_eventoProveedorId_idx" ON "OcurrenciaArchivoZoom"("eventoProveedorId");

-- CreateIndex
CREATE INDEX "OcurrenciaArchivoZoom_cuentaProveedorId_idx" ON "OcurrenciaArchivoZoom"("cuentaProveedorId");

-- CreateIndex
CREATE INDEX "OcurrenciaArchivoZoom_proximoInventarioAt_idx" ON "OcurrenciaArchivoZoom"("proximoInventarioAt");

-- CreateIndex
CREATE UNIQUE INDEX "OcurrenciaArchivoZoom_cuentaZoomId_uuid_key" ON "OcurrenciaArchivoZoom"("cuentaZoomId", "uuid");

-- CreateIndex
CREATE UNIQUE INDEX "ArchivoOrigenZoom_driveFileId_key" ON "ArchivoOrigenZoom"("driveFileId");

-- CreateIndex
CREATE UNIQUE INDEX "ArchivoOrigenZoom_archivoReunionId_key" ON "ArchivoOrigenZoom"("archivoReunionId");

-- CreateIndex
CREATE INDEX "ArchivoOrigenZoom_estado_proximoIntentoAt_idx" ON "ArchivoOrigenZoom"("estado", "proximoIntentoAt");

-- CreateIndex
CREATE INDEX "ArchivoOrigenZoom_estado_leaseHasta_idx" ON "ArchivoOrigenZoom"("estado", "leaseHasta");

-- CreateIndex
CREATE UNIQUE INDEX "ArchivoOrigenZoom_ocurrenciaId_claveOrigen_key" ON "ArchivoOrigenZoom"("ocurrenciaId", "claveOrigen");

-- CreateIndex
CREATE UNIQUE INDEX "ArchivoOrigenZoom_ocurrenciaId_nombreDestino_key" ON "ArchivoOrigenZoom"("ocurrenciaId", "nombreDestino");

-- CreateIndex
CREATE INDEX "BarridoArchivoZoom_estado_proximoIntentoAt_idx" ON "BarridoArchivoZoom"("estado", "proximoIntentoAt");

-- CreateIndex
CREATE INDEX "BarridoArchivoZoom_estado_leaseHasta_idx" ON "BarridoArchivoZoom"("estado", "leaseHasta");

-- CreateIndex
CREATE INDEX "BarridoArchivoZoom_cuentaZoomId_createdAt_idx" ON "BarridoArchivoZoom"("cuentaZoomId", "createdAt");

-- CreateIndex
CREATE INDEX "ReservaTransferenciaZoom_reservadoAt_idx" ON "ReservaTransferenciaZoom"("reservadoAt");

-- CreateIndex
CREATE INDEX "ReservaTransferenciaZoom_archivoOrigenId_idx" ON "ReservaTransferenciaZoom"("archivoOrigenId");

-- AddForeignKey
ALTER TABLE "OcurrenciaArchivoZoom" ADD CONSTRAINT "OcurrenciaArchivoZoom_cuentaProveedorId_fkey" FOREIGN KEY ("cuentaProveedorId") REFERENCES "CuentaProveedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OcurrenciaArchivoZoom" ADD CONSTRAINT "OcurrenciaArchivoZoom_eventoProveedorId_fkey" FOREIGN KEY ("eventoProveedorId") REFERENCES "EventoProveedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OcurrenciaArchivoZoom" ADD CONSTRAINT "OcurrenciaArchivoZoom_vinculadaPorId_fkey" FOREIGN KEY ("vinculadaPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArchivoOrigenZoom" ADD CONSTRAINT "ArchivoOrigenZoom_ocurrenciaId_fkey" FOREIGN KEY ("ocurrenciaId") REFERENCES "OcurrenciaArchivoZoom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArchivoOrigenZoom" ADD CONSTRAINT "ArchivoOrigenZoom_archivoReunionId_fkey" FOREIGN KEY ("archivoReunionId") REFERENCES "ArchivoReunion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BarridoArchivoZoom" ADD CONSTRAINT "BarridoArchivoZoom_solicitanteId_fkey" FOREIGN KEY ("solicitanteId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservaTransferenciaZoom" ADD CONSTRAINT "ReservaTransferenciaZoom_archivoOrigenId_fkey" FOREIGN KEY ("archivoOrigenId") REFERENCES "ArchivoOrigenZoom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

