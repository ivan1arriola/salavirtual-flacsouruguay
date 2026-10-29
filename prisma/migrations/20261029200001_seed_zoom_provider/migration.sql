-- Upsert ProveedorReunion ZOOM (runs after enum ZOOM is committed)
INSERT INTO "ProveedorReunion" ("id", "tipo", "nombre", "operativo", "historico", "updatedAt")
VALUES ('prov-zoom', 'ZOOM', 'Zoom', true, false, CURRENT_TIMESTAMP)
ON CONFLICT ("tipo") DO UPDATE SET "operativo" = true, "historico" = false;
