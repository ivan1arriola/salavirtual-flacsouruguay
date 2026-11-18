CREATE TABLE "ReunionZoomObservada" (
    "id" TEXT NOT NULL,
    "cuentaZoomId" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "ocurrenciaZoomId" TEXT NOT NULL DEFAULT '',
    "anfitrionZoomId" TEXT NOT NULL,
    "cuentaProveedorId" TEXT,
    "tema" TEXT NOT NULL,
    "inicioAt" TIMESTAMP(3) NOT NULL,
    "finAt" TIMESTAMP(3) NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'ACTIVA',
    "origen" TEXT NOT NULL,
    "observadaAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ReunionZoomObservada_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ReunionZoomObservada_cuentaZoomId_meetingId_ocurrenciaZoomId_key" ON "ReunionZoomObservada"("cuentaZoomId", "meetingId", "ocurrenciaZoomId");
CREATE INDEX "ReunionZoomObservada_cuentaProveedorId_estado_inicioAt_idx" ON "ReunionZoomObservada"("cuentaProveedorId", "estado", "inicioAt");
CREATE INDEX "ReunionZoomObservada_anfitrionZoomId_estado_idx" ON "ReunionZoomObservada"("anfitrionZoomId", "estado");
