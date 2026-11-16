CREATE TABLE "CalendarioZoomAsistente" (
    "asistenteId" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenCifrado" TEXT NOT NULL,
    "ultimoIntentoAt" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "CalendarioZoomAsistente_pkey" PRIMARY KEY ("asistenteId"),
    CONSTRAINT "CalendarioZoomAsistente_asistenteId_fkey"
        FOREIGN KEY ("asistenteId") REFERENCES "AsistenteTecnico"("id")
        ON DELETE CASCADE ON UPDATE CASCADE
);
