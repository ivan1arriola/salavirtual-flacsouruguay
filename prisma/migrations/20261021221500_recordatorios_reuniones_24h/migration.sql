CREATE TABLE "RecordatorioReunion" (
    "id" TEXT NOT NULL,
    "instanciaSalaId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "inicioProgramadoAt" TIMESTAMP(3) NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'RESERVADO',
    "enviadoAt" TIMESTAMP(3),
    "errorCodigo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecordatorioReunion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RecordatorioReunion_instanciaSalaId_usuarioId_inicioProgramadoAt_key"
  ON "RecordatorioReunion"("instanciaSalaId", "usuarioId", "inicioProgramadoAt");
CREATE INDEX "RecordatorioReunion_estado_createdAt_idx"
  ON "RecordatorioReunion"("estado", "createdAt");

ALTER TABLE "RecordatorioReunion" ADD CONSTRAINT "RecordatorioReunion_instanciaSalaId_fkey"
  FOREIGN KEY ("instanciaSalaId") REFERENCES "InstanciaSala"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecordatorioReunion" ADD CONSTRAINT "RecordatorioReunion_usuarioId_fkey"
  FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
