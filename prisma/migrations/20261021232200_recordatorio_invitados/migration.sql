CREATE TABLE "RecordatorioInvitadoReunion" (
  "id" TEXT NOT NULL,
  "instanciaSalaId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "inicioProgramadoAt" TIMESTAMP(3) NOT NULL,
  "estado" TEXT NOT NULL DEFAULT 'RESERVADO',
  "enviadoAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RecordatorioInvitadoReunion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RecordatorioInvitadoUnico" ON "RecordatorioInvitadoReunion"("instanciaSalaId", "email", "inicioProgramadoAt");
CREATE INDEX "RecordatorioInvitadoReunion_estado_createdAt_idx" ON "RecordatorioInvitadoReunion"("estado", "createdAt");
ALTER TABLE "RecordatorioInvitadoReunion" ADD CONSTRAINT "RecordatorioInvitadoReunion_instanciaSalaId_fkey"
 FOREIGN KEY ("instanciaSalaId") REFERENCES "InstanciaSala"("id") ON DELETE CASCADE ON UPDATE CASCADE;
