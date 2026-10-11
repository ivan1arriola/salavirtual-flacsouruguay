# Estado operativo de Sala Virtual

El endpoint protegido `GET /api/v1/operaciones/estado` sirve a administración autenticada y al servicio systemd mediante `CRON_SECRET`.

No expone claves ni nombres de usuarios. Devuelve agregados de eventos Google: cantidad pendiente, cantidad de errores, claims vencidos y antigüedad aproximada (basada en `updatedAt`).

## Interpretación

- `ok`: no se observan atrasos mayores a 30 minutos ni errores.
- `degradado`: hay errores de Google o pendientes durante 30 minutos.
- `critico`: hay claims con antigüedad superior al lease de 10 minutos o pendientes por dos horas. Devuelve HTTP 503 para que el monitor lo detecte.

La comprobación systemd se ejecuta cada 15 minutos y un resultado HTTP 503 queda registrado como servicio fallido. Para alertas externas, vincular systemd a un sistema de alertas institucional. Los contadores son indicadores; no prueban que Google esté disponible cuando no existen operaciones pendientes.

## Operación

Revisar `systemctl status salavirtual-ops-health.timer`, `journalctl -u salavirtual-ops-health.service` y las operaciones pendientes en administración. No reencolar operaciones ya confirmadas sin comprobar su estado remoto.

**Pendiente:** definir destinatarios y canal institucional para avisos automáticos, registrar tiempos de procesamiento y agregar trazabilidad de cada operación.
