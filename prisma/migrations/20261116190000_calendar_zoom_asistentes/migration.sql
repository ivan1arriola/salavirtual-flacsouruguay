CREATE TABLE "CalendarioZoomAsistente" (
    "asistenteTecnicoId" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenCifrado" TEXT NOT NULL,
    "ultimoIntentoAt" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "CalendarioZoomAsistente_pkey" PRIMARY KEY ("asistenteTecnicoId"),
    CONSTRAINT "CalendarioZoomAsistente_asistenteTecnicoId_fkey"
        FOREIGN KEY ("asistenteTecnicoId") REFERENCES "AsistenteTecnico"("id")
        ON DELETE CASCADE ON UPDATE CASCADE
);
