-- Las filas ERROR históricas quedan sin operación pendiente porque no puede
-- inferirse de forma segura la intención original a partir del mensaje de error.

CREATE TYPE "OperacionIntegracionProveedor" AS ENUM (
  'PROVISIONAR',
  'REPROGRAMAR',
  'CONFIGURAR_MEET',
  'CANCELAR'
);

ALTER TABLE "EventoProveedor"
  ADD COLUMN "operacionPendiente" "OperacionIntegracionProveedor",
  ADD COLUMN "reclamoIntegracionAt" TIMESTAMP(3);

-- Un EventoProveedor PENDIENTE que todavía no tiene externalEventId
-- necesariamente necesita completar su provisionamiento inicial.
UPDATE "EventoProveedor"
SET "operacionPendiente" = 'PROVISIONAR'
WHERE "estadoIntegracion" = 'PENDIENTE'
  AND "externalEventId" IS NULL;

-- Los PENDIENTE que ya tienen externalEventId quedan deliberadamente sin
-- operación asignada. En versiones anteriores PENDIENTE podía representar
-- tanto provisionamiento incompleto como una reprogramación pendiente, por lo
-- que no es seguro inferir automáticamente la operación.