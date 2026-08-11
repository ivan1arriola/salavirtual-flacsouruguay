BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_enum enum_value
    JOIN pg_type enum_type ON enum_type.oid = enum_value.enumtypid
    WHERE enum_type.typname = 'RolUsuario' AND enum_value.enumlabel = 'ASISTENTE'
  ) THEN
    ALTER TYPE "RolUsuario" RENAME VALUE 'ASISTENTE' TO 'ASISTENTE_TECNICO';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EstadoInteres') THEN
    ALTER TYPE "EstadoInteres" RENAME TO "EstadoPostulacionAsistenciaTecnica";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EstadoAsignacion') THEN
    ALTER TYPE "EstadoAsignacion" RENAME TO "EstadoAsignacionAsistenciaTecnica";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TipoDisponibilidad') THEN
    ALTER TYPE "TipoDisponibilidad" RENAME TO "TipoDisponibilidadAsistenteTecnico";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EstadoLiquidacion') THEN
    ALTER TYPE "EstadoLiquidacion" RENAME TO "EstadoLiquidacionAsistenciaTecnica";
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('"Asistente"') IS NOT NULL THEN
    ALTER TABLE "Asistente" RENAME TO "AsistenteTecnico";
  END IF;
  IF to_regclass('"InteresAsistenteEvento"') IS NOT NULL THEN
    ALTER TABLE "InteresAsistenteEvento" RENAME TO "PostulacionAsistenciaTecnica";
  END IF;
  IF to_regclass('"AsignacionAsistente"') IS NOT NULL THEN
    ALTER TABLE "AsignacionAsistente" RENAME TO "AsignacionAsistenciaTecnica";
  END IF;
  IF to_regclass('"DisponibilidadAsistente"') IS NOT NULL THEN
    ALTER TABLE "DisponibilidadAsistente" RENAME TO "DisponibilidadAsistenteTecnico";
  END IF;
  IF to_regclass('"TarifaAsistencia"') IS NOT NULL THEN
    ALTER TABLE "TarifaAsistencia" RENAME TO "TarifaAsistenciaTecnica";
  END IF;
  IF to_regclass('"Liquidacion"') IS NOT NULL THEN
    ALTER TABLE "Liquidacion" RENAME TO "LiquidacionAsistenciaTecnica";
  END IF;
  IF to_regclass('"LiquidacionDetalle"') IS NOT NULL THEN
    ALTER TABLE "LiquidacionDetalle" RENAME TO "DetalleLiquidacionAsistenciaTecnica";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'SolicitudSala' AND column_name = 'requiereAsistencia') THEN
    ALTER TABLE "SolicitudSala" RENAME COLUMN "requiereAsistencia" TO "requiereAsistenciaTecnica";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'SolicitudSala' AND column_name = 'motivoAsistencia') THEN
    ALTER TABLE "SolicitudSala" RENAME COLUMN "motivoAsistencia" TO "motivoAsistenciaTecnica";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'InstanciaSala' AND column_name = 'requiereAsistencia') THEN
    ALTER TABLE "InstanciaSala" RENAME COLUMN "requiereAsistencia" TO "requiereAsistenciaTecnica";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'PostulacionAsistenciaTecnica' AND column_name = 'asistenteId') THEN
    ALTER TABLE "PostulacionAsistenciaTecnica" RENAME COLUMN "asistenteId" TO "asistenteTecnicoId";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'AsignacionAsistenciaTecnica' AND column_name = 'asistenteId') THEN
    ALTER TABLE "AsignacionAsistenciaTecnica" RENAME COLUMN "asistenteId" TO "asistenteTecnicoId";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'AsignacionAsistenciaTecnica' AND column_name = 'tarifaAsistenciaId') THEN
    ALTER TABLE "AsignacionAsistenciaTecnica" RENAME COLUMN "tarifaAsistenciaId" TO "tarifaAsistenciaTecnicaId";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'DisponibilidadAsistenteTecnico' AND column_name = 'asistenteId') THEN
    ALTER TABLE "DisponibilidadAsistenteTecnico" RENAME COLUMN "asistenteId" TO "asistenteTecnicoId";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'LiquidacionAsistenciaTecnica' AND column_name = 'asistenteId') THEN
    ALTER TABLE "LiquidacionAsistenciaTecnica" RENAME COLUMN "asistenteId" TO "asistenteTecnicoId";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'DetalleLiquidacionAsistenciaTecnica' AND column_name = 'liquidacionId') THEN
    ALTER TABLE "DetalleLiquidacionAsistenciaTecnica" RENAME COLUMN "liquidacionId" TO "liquidacionAsistenciaTecnicaId";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'DetalleLiquidacionAsistenciaTecnica' AND column_name = 'asignacionAsistenteId') THEN
    ALTER TABLE "DetalleLiquidacionAsistenciaTecnica" RENAME COLUMN "asignacionAsistenteId" TO "asignacionAsistenciaTecnicaId";
  END IF;
END $$;

DO $$
DECLARE
  item record;
  nuevo_nombre text;
BEGIN
  FOR item IN
    SELECT constraint_table.oid AS table_oid, constraint_name.conname AS nombre
    FROM pg_constraint constraint_name
    JOIN pg_class constraint_table ON constraint_table.oid = constraint_name.conrelid
    JOIN pg_namespace table_schema ON table_schema.oid = constraint_table.relnamespace
    WHERE table_schema.nspname = current_schema()
  LOOP
    nuevo_nombre := item.nombre;
    nuevo_nombre := replace(nuevo_nombre, 'InteresAsistenteEvento', 'PostulacionAsistenciaTecnica');
    nuevo_nombre := replace(nuevo_nombre, 'AsignacionAsistente', 'AsignacionAsistenciaTecnica');
    nuevo_nombre := replace(nuevo_nombre, 'DisponibilidadAsistente_', 'DisponibilidadAsistenteTecnico_');
    nuevo_nombre := replace(nuevo_nombre, 'TarifaAsistencia_', 'TarifaAsistenciaTecnica_');
    nuevo_nombre := replace(nuevo_nombre, 'LiquidacionDetalle', 'DetalleLiquidacionAsistenciaTecnica');
    nuevo_nombre := replace(nuevo_nombre, 'Liquidacion_', 'LiquidacionAsistenciaTecnica_');
    nuevo_nombre := replace(nuevo_nombre, 'Asistente_', 'AsistenteTecnico_');
    nuevo_nombre := replace(nuevo_nombre, 'asistenteId_', 'asistenteTecnicoId_');
    nuevo_nombre := replace(nuevo_nombre, 'tarifaAsistenciaId_', 'tarifaAsistenciaTecnicaId_');
    nuevo_nombre := replace(nuevo_nombre, 'liquidacionId_', 'liquidacionAsistenciaTecnicaId_');
    nuevo_nombre := replace(nuevo_nombre, 'asignacionAsistenteId_', 'asignacionAsistenciaTecnicaId_');
    nuevo_nombre := replace(nuevo_nombre, 'requiereAsistencia_', 'requiereAsistenciaTecnica_');
    nuevo_nombre := replace(nuevo_nombre, 'motivoAsistencia_', 'motivoAsistenciaTecnica_');

    nuevo_nombre := CASE item.nombre
      WHEN 'InteresAsistenteEvento_instanciaSalaId_asistenteId_key' THEN 'PostulacionAT_instancia_asistente_key'
      WHEN 'AsignacionAsistente_instanciaSalaId_asistenteId_key' THEN 'AsignacionAT_instancia_asistente_key'
      WHEN 'LiquidacionDetalle_liquidacionId_fkey' THEN 'DetalleLiquidacionAT_liquidacion_fk'
      WHEN 'LiquidacionDetalle_asignacionAsistenteId_fkey' THEN 'DetalleLiquidacionAT_asignacion_fk'
      WHEN 'LiquidacionDetalle_liquidacionId_asignacionAsistenteId_key' THEN 'DetalleLiquidacionAT_liquidacion_asignacion_key'
      ELSE nuevo_nombre
    END;

    IF length(nuevo_nombre) > 63 THEN
      nuevo_nombre := left(nuevo_nombre, 48) || '_' || left(md5(nuevo_nombre), 14);
    END IF;

    IF nuevo_nombre <> item.nombre THEN
      EXECUTE format('ALTER TABLE %s RENAME CONSTRAINT %I TO %I', item.table_oid::regclass, item.nombre, nuevo_nombre);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE
  item record;
  nuevo_nombre text;
BEGIN
  FOR item IN
    SELECT index_schema.nspname AS esquema, index_relation.relname AS nombre
    FROM pg_class index_relation
    JOIN pg_namespace index_schema ON index_schema.oid = index_relation.relnamespace
    WHERE index_schema.nspname = current_schema() AND index_relation.relkind = 'i'
  LOOP
    nuevo_nombre := item.nombre;
    nuevo_nombre := replace(nuevo_nombre, 'InteresAsistenteEvento', 'PostulacionAsistenciaTecnica');
    nuevo_nombre := replace(nuevo_nombre, 'AsignacionAsistente', 'AsignacionAsistenciaTecnica');
    nuevo_nombre := replace(nuevo_nombre, 'DisponibilidadAsistente_', 'DisponibilidadAsistenteTecnico_');
    nuevo_nombre := replace(nuevo_nombre, 'TarifaAsistencia_', 'TarifaAsistenciaTecnica_');
    nuevo_nombre := replace(nuevo_nombre, 'LiquidacionDetalle', 'DetalleLiquidacionAsistenciaTecnica');
    nuevo_nombre := replace(nuevo_nombre, 'Liquidacion_', 'LiquidacionAsistenciaTecnica_');
    nuevo_nombre := replace(nuevo_nombre, 'Asistente_', 'AsistenteTecnico_');
    nuevo_nombre := replace(nuevo_nombre, 'asistenteId_', 'asistenteTecnicoId_');
    nuevo_nombre := replace(nuevo_nombre, 'tarifaAsistenciaId_', 'tarifaAsistenciaTecnicaId_');
    nuevo_nombre := replace(nuevo_nombre, 'liquidacionId_', 'liquidacionAsistenciaTecnicaId_');
    nuevo_nombre := replace(nuevo_nombre, 'asignacionAsistenteId_', 'asignacionAsistenciaTecnicaId_');
    nuevo_nombre := replace(nuevo_nombre, 'requiereAsistencia_', 'requiereAsistenciaTecnica_');
    nuevo_nombre := replace(nuevo_nombre, 'motivoAsistencia_', 'motivoAsistenciaTecnica_');

    nuevo_nombre := CASE item.nombre
      -- Las claves primarias ya fueron renombradas junto con sus constraints
      -- en el bloque anterior; no se deben transformar por segunda vez.
      WHEN 'DisponibilidadAsistenteTecnico_pkey' THEN item.nombre
      WHEN 'TarifaAsistenciaTecnica_pkey' THEN item.nombre
      WHEN 'InteresAsistenteEvento_instanciaSalaId_asistenteId_key' THEN 'PostulacionAT_instancia_asistente_key'
      WHEN 'AsignacionAsistente_instanciaSalaId_asistenteId_key' THEN 'AsignacionAT_instancia_asistente_key'
      WHEN 'LiquidacionDetalle_liquidacionId_asignacionAsistenteId_key' THEN 'DetalleLiquidacionAT_liquidacion_asignacion_key'
      WHEN 'Liquidacion_asistenteId_periodoDesde_periodoHasta_idx' THEN 'LiquidacionAsistenciaTecnica_asistenteTecnicoId_periodoDesd_idx'
      ELSE nuevo_nombre
    END;

    IF length(nuevo_nombre) > 63 THEN
      nuevo_nombre := left(nuevo_nombre, 48) || '_' || left(md5(nuevo_nombre), 14);
    END IF;

    IF nuevo_nombre <> item.nombre THEN
      EXECUTE format('ALTER INDEX %I.%I RENAME TO %I', item.esquema, item.nombre, nuevo_nombre);
    END IF;
  END LOOP;
END $$;

COMMIT;
