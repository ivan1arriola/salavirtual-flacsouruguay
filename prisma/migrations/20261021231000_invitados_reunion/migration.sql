CREATE TABLE "InvitadoReunion" (
  "id" TEXT NOT NULL,
  "instanciaSalaId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "nombre" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InvitadoReunion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "InvitadoReunion_instanciaSalaId_email_key" ON "InvitadoReunion"("instanciaSalaId", "email");
CREATE INDEX "InvitadoReunion_email_idx" ON "InvitadoReunion"("email");
ALTER TABLE "InvitadoReunion" ADD CONSTRAINT "InvitadoReunion_instanciaSalaId_fkey"
 FOREIGN KEY ("instanciaSalaId") REFERENCES "InstanciaSala"("id") ON DELETE CASCADE ON UPDATE CASCADE;
