CREATE TYPE "EstadoEnvioReporteMensual" AS ENUM ('PENDIENTE', 'ENVIADO', 'ERROR');

CREATE TABLE "ConfiguracionAsistenciaTecnica" (
  "id" TEXT NOT NULL DEFAULT 'principal',
  "correosCopiaReporteMensual" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "actualizadaPorId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ConfiguracionAsistenciaTecnica_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EnvioReporteMensualAsistencia" (
  "id" TEXT NOT NULL,
  "asistenteTecnicoId" TEXT NOT NULL,
  "periodo" TEXT NOT NULL,
  "estado" "EstadoEnvioReporteMensual" NOT NULL DEFAULT 'PENDIENTE',
  "minutosTotal" INTEGER NOT NULL,
  "minutosVirtuales" INTEGER NOT NULL,
  "minutosHibridos" INTEGER NOT NULL,
  "reuniones" INTEGER NOT NULL,
  "destinatario" TEXT NOT NULL,
  "copias" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "intentos" INTEGER NOT NULL DEFAULT 1,
  "ultimoError" TEXT,
  "enviadoAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EnvioReporteMensualAsistencia_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ConfiguracionAsistenciaTecnica_actualizadaPorId_updatedAt_idx"
  ON "ConfiguracionAsistenciaTecnica"("actualizadaPorId", "updatedAt");

CREATE UNIQUE INDEX "EnvioReporteMensualAsistencia_asistenteTecnicoId_periodo_key"
  ON "EnvioReporteMensualAsistencia"("asistenteTecnicoId", "periodo");

CREATE INDEX "EnvioReporteMensualAsistencia_periodo_estado_idx"
  ON "EnvioReporteMensualAsistencia"("periodo", "estado");

ALTER TABLE "ConfiguracionAsistenciaTecnica"
  ADD CONSTRAINT "ConfiguracionAsistenciaTecnica_actualizadaPorId_fkey"
  FOREIGN KEY ("actualizadaPorId") REFERENCES "Usuario"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EnvioReporteMensualAsistencia"
  ADD CONSTRAINT "EnvioReporteMensualAsistencia_asistenteTecnicoId_fkey"
  FOREIGN KEY ("asistenteTecnicoId") REFERENCES "AsistenteTecnico"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
