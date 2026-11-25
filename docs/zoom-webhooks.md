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
5. Para enriquecer la cronología, suscribir los eventos de participantes:
   `meeting.participant_joined`, `meeting.participant_left`,
   `meeting.participant_joined_waiting_room`, `meeting.participant_left_waiting_room`,
   `meeting.participant_admitted`, `meeting.participant_put_in_waiting_room`,
   `meeting.participant_jbh_waiting`, `meeting.participant_jbh_waiting_left`,
   `meeting.participant_role_changed`, `meeting.participant_joined_breakout_room` y
   `meeting.participant_left_breakout_room`. Usan los scopes granulares
   `meeting:read:participant:admin` o `meeting:read:participant`.
6. Para compartir pantalla, suscribir `meeting.sharing_started` y `meeting.sharing_ended`.
   Sus scopes granulares son `meeting:read:participant_sharing:admin` o
   `meeting:read:participant_sharing`.
7. Para alertas de calidad, suscribir `meeting.alert`. Requiere cuenta Business o superior y habilitar
   **Meeting quality scores and network alerts on Dashboard** en Zoom. Scope granular:
   `meeting:read:alert:admin` o `meeting:read:alert`.
8. Para conocer el ciclo de grabación en vivo, suscribir `recording.started`, `recording.stopped`,
   `recording.paused` y `recording.resumed`. Scopes granulares:
   `cloud_recording:read:recording:admin` o `cloud_recording:read:recording`.
9. Confirmar en la base que los eventos pasan de `RECIBIDO` a `PROCESADO` y que la ocurrencia aparece
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

El receptor guarda metadatos de reunión, una huella del cuerpo firmado y, para los eventos de
participantes, únicamente un identificador opaco de correlación. Descarta nombres, correos, contraseñas,
URLs de descarga, tokens y datos técnicos personales. Las alertas conservan solo los códigos de problema;
los cambios de rol y pantalla compartida conservan etiquetas operativas, no la identidad de quien actuó.
Responde 503 si no hay secreto o no puede confirmar la inserción en la base, para que Zoom reintente. El worker reclama avisos de forma exclusiva, reintenta
fallos con espera creciente y conserva el código de error sin mensajes sensibles. `FALLIDO` después de
10 intentos requiere investigación; la bandeja no se elimina automáticamente.

## Datos en vivo y calidad

La lista de participantes se obtiene mediante `GET /metrics/meetings/{meetingId}/participants?type=live`.
Zoom exige cuenta Business o superior con Dashboard habilitado y scopes
`dashboard_meetings:read:admin` o `dashboard:read:admin`. Es un endpoint de uso elevado; la consola
lo consulta como máximo una vez por ciclo de actualización (30 segundos).

La respuesta puede incluir estado (`in_meeting` o `in_waiting_room`), rol, hora de entrada y salida,
motivo de salida, tipo de conexión y puntuaciones de audio, vídeo y pantalla compartida. Sala Virtual
proyecta solo esos campos operativos. No lee ni conserva direcciones IP, MAC, identificadores de disco,
nombres de equipo ni otros datos técnicos sensibles que Zoom pueda incluir. Las puntuaciones de calidad
solo aparecen si está habilitada la opción **Meeting quality scores and network alerts on Dashboard**.
Zoom puede omitir nombre y correo de participantes externos o por restricciones de cuentas HIPAA; la
interfaz debe admitir esos campos vacíos sin tratarlo como un error.

La API puede responder HTTP 400 con código Zoom 200 cuando el plan o Dashboard no cumplen los requisitos.
La consola muestra el código y el mensaje de Zoom para distinguir ese caso de scopes incorrectos, IDs
inválidos, límites de consulta y fallos de conexión. Un error de API nunca se convierte en cero asistentes.

Los eventos `meeting.alert` notifican audio/vídeo inestable, pantalla compartida deficiente, CPU elevada
o problemas de reconexión. La ausencia de alertas no demuestra que no haya problemas: depende de la
licencia, de la opción de Dashboard y de la suscripción del webhook. Las métricas avanzadas de jitter,
latencia y pérdida de paquetes mediante Quality of Service Subscription (QSS) requieren un producto
adicional de Zoom y no forman parte de esta integración base.

Los webhooks alimentan la cronología y las alertas; no se usan para calcular minutos ni para reconstruir
la lista definitiva de asistencia. La asistencia oficial se obtiene del reporte de Zoom al finalizar
la reunión.

La disponibilidad de los webhooks depende de que el worker de archivos Zoom esté ejecutándose y sano.
El Secret Token se administra en Sala Virtual y se obtiene de la misma app Zoom; el despliegue por sí
solo no activa la suscripción.
