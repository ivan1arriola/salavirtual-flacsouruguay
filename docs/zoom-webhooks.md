# Webhooks de Zoom

Sala Virtual recibe eventos en `POST /api/v1/webhooks/zoom`. El endpoint valida la firma y guarda una
notificación mínima; el worker `zoom:archivos:worker` la procesa y reutiliza el inventario de grabaciones
y la sincronización de asistencia ya existentes. La URL no requiere sesión de usuario.

## Activación

1. Aplicar la migración `20261113000000_zoom_webhooks` y desplegar la ruta y el worker.
2. Ir a **Configuración → Zoom → Notificaciones de Zoom** en Sala Virtual. Pegar el **Secret Token**
   de Event Subscriptions de la app Zoom y guardarlo. Se cifra en la base de datos; no se guarda
   en archivos `.env` ni se muestra de nuevo. El Client Secret de OAuth es diferente.
3. En la app Server-to-Server OAuth de Zoom, activar Event Subscriptions y copiar la
   **Event Notification Endpoint URL** que aparece en esa misma sección de configuración.
   Pulsar **Validate** una vez que el endpoint esté desplegado. Zoom volverá a validarlo periódicamente.
4. Suscribir `meeting.started`, `meeting.ended`, `recording.completed` y, si la licencia permite
   transcripciones de grabación, `recording.transcript_completed`. Zoom exige los scopes de lectura de
   reuniones y de cloud recording correspondientes a cada evento; agregarlos en la app antes de guardar.
5. Opcional, para la cronología del encuentro: suscribir además `meeting.participant_joined`,
   `meeting.participant_left`, `meeting.participant_joined_waiting_room`,
   `meeting.participant_left_waiting_room`, `meeting.participant_admitted`,
   `meeting.participant_put_in_waiting_room`, `recording.started`, `recording.stopped`,
   `recording.paused`, `recording.resumed`, `meeting.sharing_started`, `meeting.sharing_ended` y
   `meeting.alert`. Scopes de la app: según la referencia oficial de Meetings Webhooks, los eventos de
   participante (`meeting.participant_*`) aceptan `meeting:read:admin` o `meeting:read` y, en el modelo
   granular, `meeting:read:participant:admin` o `meeting:read:participant`. **Sin verificar contra la
   documentación oficial**: los scopes de `recording.started/stopped/paused/resumed`
   (`recording:read:admin` o `recording:read`), de `meeting.sharing_started/ended` y de `meeting.alert`.
   Antes de activarlos, abrir la página de cada evento en la consola de Zoom y confirmar el scope que
   exige. En Zoom, los eventos no se envían si la opción de la suscripción para ese evento no está
   activada; verificarlo en la consola.
6. Confirmar en la base que los eventos pasan de `RECIBIDO` a `PROCESADO` y que la ocurrencia aparece
   vinculada a la clase correcta. Si hay dos clases candidatas, la vinculación queda pendiente de revisión.

Los eventos de reunión crean una ocurrencia por UUID, incluso si no hubo grabación. `meeting.ended`
permite que el worker consulte después el reporte de participantes. Los eventos de grabación adelantan
el inventario fresco por UUID; el cuerpo del webhook **no** se usa como fuente de archivos ni para
descargar. El barrido periódico sigue cubriendo eventos que Zoom no entregue.

Los eventos en vivo del paso 5 se guardan en `EventoWebhookZoomAdicional`, asociados por cuenta Zoom +
UUID de ejecución (nunca solo por Meeting ID: una serie comparte ese número). Se persiste solo el tipo,
la hora, el Meeting ID, el UUID, un id opaco de participante (`participant_uuid`) y, en `meeting.alert`,
los códigos de problema. Nombre, correo, IP y URLs no se leen ni se guardan; no hacen falta para la
cronología. La huella única del cuerpo firmado hace idempotentes los reintentos; los eventos fuera de
orden o sin reunión conocida se guardan igual y la cronología ordena por la hora del aviso.

El receptor solo guarda metadatos de reunión y una huella del cuerpo firmado. Descarta contraseñas,
URLs de descarga, tokens y datos de participantes. Responde 503 si no hay secreto o no puede confirmar
la inserción en la base, para que Zoom reintente. El worker reclama avisos de forma exclusiva, reintenta
fallos con espera creciente y conserva el código de error sin mensajes sensibles. `FALLIDO` después de
10 intentos requiere investigación; la bandeja no se elimina automáticamente.

La disponibilidad de los webhooks depende de que el worker de archivos Zoom esté ejecutándose y sano.
El Secret Token se administra en Sala Virtual y se obtiene de la misma app Zoom; el despliegue por sí
solo no activa la suscripción.
