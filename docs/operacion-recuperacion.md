# Protocolo de despliegue y recuperación

## Invariantes

- El release queda identificado por un SHA completo de Git.
- La activación de `current` se realiza mediante un cambio atómico de enlace simbólico.
- El healthcheck debe responder HTTP correcto con JSON válido y `database: "ok"`.
- La restauración del enlace anterior **no revierte** migraciones de PostgreSQL.
- No se ejecutan migraciones destructivas en el mismo release que deja de usar sus columnas o tablas.

## Antes de fusionar una migración

1. Generar un backup verificable y comprobar que puede restaurarse en una instancia aislada. No registrar contraseñas en los logs.
2. Ejecutar migraciones sobre una copia desidentificada o aislada de los datos.
3. Confirmar que el release actual puede operar sobre el esquema después de la migración (compatibilidad N-1).
4. Para cambios incompatibles, usar Expand → Migrate → Contract en despliegues diferentes.
5. Validar la disponibilidad de disco y espacio para los backups y builds.

## Después del despliegue

1. Comprobar el status del servicio y `/api/health`.
2. Verificar un flujo de consulta y otro de modificación con cuentas de prueba.
3. Revisar eventos pendientes de Google Calendar y Meet.
4. Registrar el SHA activado y la versión de migraciones aplicada.

## Ante una falla

1. Evitar nuevos despliegues hasta diagnosticar la causa.
2. Comprobar los logs del servicio, el healthcheck y el estado de PostgreSQL.
3. Si se restauró el release previo, verificar explícitamente su compatibilidad con el esquema vigente.
4. Si el esquema es incompatible, recuperar el servicio mediante una corrección compatible o mediante restauración de backup con un procedimiento aprobado; **no** realizar rollback SQL automático.
5. Comunicar las operaciones que pudieron quedar pendientes de sincronización.

Este documento no reemplaza un ensayo de restauración real ni demuestra que exista un backup utilizable.
