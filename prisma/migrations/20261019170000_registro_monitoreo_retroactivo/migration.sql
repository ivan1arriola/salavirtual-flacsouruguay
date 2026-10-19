CREATE TABLE "RegistroMonitoreoRetroactivo" (
  "id" TEXT NOT NULL,
  "instanciaSalaId" TEXT NOT NULL,
  "asistenteTecnicoId" TEXT NOT NULL,
  "inicioRealAt" TIMESTAMP(3) NOT NULL,
  "finRealAt" TIMESTAMP(3) NOT NULL,
  "minutos" INTEGER NOT NULL,
  "tarifaAsistenciaTecnicaId" TEXT NOT NULL,
  "tarifaHora" DECIMAL(10,2) NOT NULL,
  "moneda" TEXT NOT NULL,
  "montoEstimado" DECIMAL(12,2) NOT NULL,
  "motivo" TEXT NOT NULL,
  "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
  "creadoPorUsuarioId" TEXT NOT NULL,
  "revisadoPorUsuarioId" TEXT,
  "motivoRechazo" TEXT,
  "revisadoAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RegistroMonitoreoRetroactivo_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RegistroMonitoreoRetroactivo_minutos_check" CHECK ("minutos" > 0 AND "minutos" <= 1440),
  CONSTRAINT "RegistroMonitoreoRetroactivo_estado_check" CHECK ("estado" IN ('PENDIENTE', 'APROBADO', 'RECHAZADO')),
  CONSTRAINT "RegistroMonitoreoRetroactivo_instanciaSalaId_fkey"
    FOREIGN KEY ("instanciaSalaId") REFERENCES "InstanciaSala"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RegistroMonitoreoRetroactivo_asistenteTecnicoId_fkey"
    FOREIGN KEY ("asistenteTecnicoId") REFERENCES "AsistenteTecnico"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "RegistroMonitoreoRetroactivo_instanciaSalaId_estado_idx"
  ON "RegistroMonitoreoRetroactivo"("instanciaSalaId", "estado");
CREATE INDEX "RegistroMonitoreoRetroactivo_asistenteTecnicoId_estado_idx"
  ON "RegistroMonitoreoRetroactivo"("asistenteTecnicoId", "estado");
-- Solo puede existir un registro pendiente o aprobado por encuentro.
CREATE UNIQUE INDEX "RegistroMonitoreoRetroactivo_unico_activo_idx"
  ON "RegistroMonitoreoRetroactivo"("instanciaSalaId")
  WHERE "estado" IN ('PENDIENTE', 'APROBADO');
