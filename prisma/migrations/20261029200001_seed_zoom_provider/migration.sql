-- Upsert ProveedorReunion ZOOM (runs after enum ZOOM is committed)
INSERT INTO "ProveedorReunion" ("id", "tipo", "nombre", "operativo", "historico")
VALUES ('prov-zoom', 'ZOOM', 'Zoom', true, false)
ON CONFLICT ("tipo") DO UPDATE SET "operativo" = true, "historico" = false;
