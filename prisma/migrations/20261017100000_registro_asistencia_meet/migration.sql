-- CreateTable
CREATE TABLE IF NOT EXISTS "RegistroAsistenciaMeet" (
    "id" TEXT NOT NULL,
    "instanciaSalaId" TEXT NOT NULL,
    "claveParticipante" TEXT NOT NULL,
    "participanteMeetId" TEXT,
    "nombre" TEXT NOT NULL,
    "email" TEXT,
    "tipoAcceso" TEXT NOT NULL DEFAULT 'CUENTA_GOOGLE',
    "rolEnReunion" TEXT NOT NULL DEFAULT 'PARTICIPANTE',
    "conectado" BOOLEAN NOT NULL DEFAULT false,
    "primeraEntradaAt" TIMESTAMP(3),
    "ultimaSalidaAt" TIMESTAMP(3),
    "minutosConectado" INTEGER NOT NULL DEFAULT 0,
    "porcentajeAsistencia" DECIMAL(5,2),
    "cumpleNormativa" BOOLEAN NOT NULL DEFAULT false,
    "numeroConexiones" INTEGER NOT NULL DEFAULT 1,
    "esHostOCohost" BOOLEAN NOT NULL DEFAULT false,
    "enGrupoPequeno" BOOLEAN NOT NULL DEFAULT false,
    "salaGrupoPequeno" TEXT,
    "externo" BOOLEAN,
    "conferenciaId" TEXT,
    "origenCorreo" TEXT,
    "notasOperador" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegistroAsistenciaMeet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "RegistroAsistenciaMeet_instanciaSalaId_claveParticipante_key" ON "RegistroAsistenciaMeet"("instanciaSalaId", "claveParticipante");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RegistroAsistenciaMeet_instanciaSalaId_conectado_idx" ON "RegistroAsistenciaMeet"("instanciaSalaId", "conectado");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RegistroAsistenciaMeet_instanciaSalaId_email_idx" ON "RegistroAsistenciaMeet"("instanciaSalaId", "email");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'RegistroAsistenciaMeet_instanciaSalaId_fkey'
  ) THEN
    ALTER TABLE "RegistroAsistenciaMeet" ADD CONSTRAINT "RegistroAsistenciaMeet_instanciaSalaId_fkey" FOREIGN KEY ("instanciaSalaId") REFERENCES "InstanciaSala"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

