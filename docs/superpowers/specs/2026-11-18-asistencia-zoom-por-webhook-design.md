# Asistencia de Zoom por webhook — diseño corto

Aprobado por el usuario el 2026-11-18 (propuesta + botón de reintento manual).

## Intención

La asistencia de una reunión Zoom debe aparecer sola poco después de terminar, sin que el worker consulte a Zoom
cada pocos minutos. Hoy el sondeo está roto: reintenta `NO_DISPONIBLE`/`ERROR` solo si `updatedAt` tiene 15 min de
antigüedad, pero el barrido de grabaciones reescribe todas las ocurrencias cada minuto (el upsert de
`guardarInventario` siempre escribe), así que nunca se reintenta tras el primer 404. Los logs muestran
`asistencia: revisadas 0` en cada ciclo.

## Objetivos

- `meeting.ended` dispara la sincronización de la asistencia de esa ocurrencia.
- Si Zoom responde 404 (reporte aún no listo), se reintenta con la espera creciente ya existente del webhook
  (2, 5, 15, 60 min) y luego se detiene.
- Botón "Reintentar asistencia" en la ficha (solo administración) para casos atascados o avisos perdidos.
- Se elimina el sondeo periódico y su condición sobre `updatedAt`.

## No objetivos

- No hay barrido de respaldo diario (decisión del usuario: webhook + botón manual).
- No se construye la asistencia a partir de `participant_joined/left`: la API de participantes sigue siendo la fuente.
- No se rediseña el vínculo ocurrencia↔clase, solo se verifica (ver Pendiente).

## Enfoques considerados

1. **Webhook + reintento con la cola existente + botón (elegido).** Reutiliza `EventoWebhookZoom` (reclamo atómico,
   backoff, estados). Sin escaneo.
2. Construir asistencia desde eventos de participante: mucho código, pierde exactitud; descartado.
3. Arreglar el sondeo con una columna `asistenciaIntentadaAt`: sigue siendo consulta continua; descartado.

## Diseño

- `aplicarAviso` (zoom-webhook-worker.ts): tras el upsert de la ocurrencia, si `tipo === "meeting.ended"` llama a
  `sincronizarAsistenciaZoomUseCase` para esa ocurrencia. Resultado `PENDIENTE` (404) se traduce a un error
  reintentable del aviso para que use `proximoIntento` (se ajusta la escala a 2/5/15/60 min para este caso y se
  marca `FALLIDO` al agotarse); `OK`/`VACIO` → `PROCESADO`; `CONFLICTO` → `PROCESADO` registrando el código.
- El proceso del worker necesita el proveedor de sesiones Zoom en `procesarWebhooks`
  (hoy solo lo tiene la rama de asistencia pendiente).
- Quitar `sincronizarAsistenciaPendiente`, su tarea en `scripts/zoom-archivos-worker.ts`, el adaptador
  `prisma-asistencia-pendiente.adapter.ts`, el caso de uso `sincronizar-asistencia-pendiente-zoom` y sus pruebas.
- Botón: acción de servidor / ruta `POST` bajo `/api/v1/reuniones/instancias/[id]/asistencia/…` que, validando rol
  ADMINISTRACION, ejecuta `sincronizarAsistenciaZoomUseCase` para cada ocurrencia de la instancia que no esté
  `DISPONIBLE` y devuelve el estado resultante. Se muestra en `ZoomAsistenciaOcurrencias` cuando la ejecución
  está en `NO_DISPONIBLE`/`ERROR`/`PENDIENTE`. Un 404 sigue siendo "Zoom aún no entregó el reporte", nunca "cero".
- Recuperación de lo atascado hoy: el botón (o una única corrida manual `--once`), sin barrido nuevo.

## Restricciones

- Next.js de esta versión tiene cambios incompatibles: leer `node_modules/next/dist/docs/` antes de tocar rutas.
- Despliegue por SSH con `scripts/deploy-ec2.sh`; sin migraciones previstas.
- Un error o 404 nunca borra asistencia ya guardada (comportamiento actual del caso de uso).

## Pendiente (a verificar en el plan)

- Por qué la ficha de "Formación BROU" sigue en "Realización sin verificar" pese a recibir `meeting.started/ended`
  (probable fallo de `vincularAutomaticamenteSiInequivoco`: inicio real 17:35 vs programado 18:00). Sin vínculo la
  ficha no ve la asistencia; si es un bug, se corrige aparte o dentro de este plan según su tamaño.
- Inconsistencias de la ficha histórica (horario real ignora `inicioRealAt`; botón JSON aparece sin reporte).
