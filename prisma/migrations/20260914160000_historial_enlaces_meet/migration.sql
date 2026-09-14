-- Additive: keep existing values and evidence intact. No synthetic backfill.
-- Audit at the database boundary so updateMany, scripts and old releases are covered.
CREATE INDEX IF NOT EXISTS "Auditoria_accion_createdAt_idx" ON "Auditoria" ("accion", "createdAt");

CREATE FUNCTION registrar_historial_enlace_meet() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  anterior jsonb := NULL;
  origen text := NULLIF(current_setting('flacso.meet_change_origin', true), '');
  motivo text := NULLIF(current_setting('flacso.meet_change_reason', true), '');
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "ProveedorReunion" WHERE id = NEW."proveedorId" AND tipo = 'GOOGLE_MEET'
  ) THEN RETURN NEW; END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW."codigoReunion" IS NOT DISTINCT FROM OLD."codigoReunion"
      AND NEW."joinUrl" IS NOT DISTINCT FROM OLD."joinUrl" THEN
      RETURN NEW;
    END IF;
    IF origen IS NULL AND OLD."operacionPendiente" IS NOT NULL THEN
      origen := 'sincronizacion-calendar';
      motivo := COALESCE(motivo, 'Enlace detectado durante ' || OLD."operacionPendiente"::text);
    END IF;
    anterior := jsonb_build_object(
      'codigoReunion', OLD."codigoReunion", 'joinUrl', OLD."joinUrl",
      'instanciaSalaId', OLD."instanciaSalaId", 'calendarEventId', OLD."externalEventId"
    );
  ELSIF NEW."codigoReunion" IS NULL AND NEW."joinUrl" IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO "Auditoria" (
    id, accion, "entidadTipo", "entidadId", "valorAnterior", "valorNuevo", "createdAt"
  ) VALUES (
    'meet:' || gen_random_uuid()::text, 'ENLACE_MEET_REGISTRADO',
    'EventoProveedor', NEW.id, anterior,
    jsonb_build_object(
      'codigoReunion', NEW."codigoReunion", 'joinUrl', NEW."joinUrl",
      'instanciaSalaId', NEW."instanciaSalaId", 'calendarEventId', NEW."externalEventId",
      'origen', COALESCE(origen, 'persistencia'),
      'motivo', motivo
    ), clock_timestamp()
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER historial_enlace_meet
AFTER INSERT OR UPDATE OF "codigoReunion", "joinUrl" ON "EventoProveedor"
FOR EACH ROW EXECUTE FUNCTION registrar_historial_enlace_meet();
