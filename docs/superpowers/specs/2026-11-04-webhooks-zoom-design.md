# Webhooks de Zoom: estado real de los encuentros y cambios hechos en Zoom

Fecha: 2026-11-04
Base: `main`
Alcance de esta entrega: eventos `meeting.started`, `meeting.ended`, `meeting.updated` y `meeting.deleted`.
Fuera de alcance (entregas siguientes): `recording.completed`, eventos de participantes y eventos de usuario.

## Problema

- Los estados `EN_CURSO` y `FINALIZADA` de `InstanciaSala` existen, pero ningún código los escribe. Hoy hay 306 encuentros pasados que siguen «programados» o «en curso», y la pantalla solo calcula «en curso» comparando horas.
- Cuando alguien edita o elimina una reunión directamente en Zoom, la base no se entera. Es la causa de fondo de las reuniones huérfanas, los enlaces distintos y el «estado que no coincide» que corregimos a mano.

## Hechos del código en los que se apoya

- El identificador de Zoom de un encuentro está en `EventoProveedor.codigoReunion` y `externalEventId`; el de una serie compartida, en `ReunionProveedor.externalId`.
- En una serie compartida (reunión recurrente sin horario fijo) todos los encuentros usan el mismo ID de Zoom. El evento de Zoom trae `object.id` (ID de la reunión) y `object.uuid` (identifica **esa ocurrencia**), así que el ID solo no alcanza para saber qué encuentro es.
- Las rutas de la API autentican por sí mismas (`auth()` o `CRON_SECRET`); no hay un middleware global. El proxy de Apache ya reenvía `/` al puerto 3101, así que una ruta nueva queda expuesta sin cambios de infraestructura.
- `Auditoria` (`accion`, `entidadTipo`, `entidadId`, `valorNuevo`) y `EventoProveedor.estadoIntegracion` / `errorIntegracion` ya alimentan la pantalla de problemas de integración.
- `ZOOM_WEBHOOK_SECRET_TOKEN` figura en `.env.example`, pero ningún código lo usa todavía.

## Diseño

### 1. Endpoint

`POST /api/v1/webhooks/zoom`, runtime Node, público (sin sesión), que se protege solo por firma:

1. Lee el cuerpo **crudo** (texto) con tope de 64 KB.
2. Verifica la firma: HMAC-SHA256 del texto `v0:{x-zm-request-timestamp}:{cuerpo}` con `ZOOM_WEBHOOK_SECRET_TOKEN`, comparado en tiempo constante con `x-zm-signature` (`v0=<hex>`). Rechaza con 401 si no coincide o si el timestamp difiere más de 5 minutos.
3. Si el evento es `endpoint.url_validation`, responde 200 con `{ plainToken, encryptedToken }` (HMAC-SHA256 del `plainToken`, en hexadecimal). Zoom repite esta validación cada 72 horas: el endpoint debe contestarla siempre.
4. Para el resto: registra el evento, intenta procesarlo y responde 200 aunque el procesamiento falle (queda en estado `ERROR` para reintento). Zoom reintenta si no recibe 2xx, así que 5xx solo se devuelve ante errores no recuperables de base de datos.

### 2. Idempotencia y registro

Modelo nuevo `EventoWebhookZoom` (requiere una migración de Prisma aditiva, sin tocar tablas existentes):

| Campo | Contenido |
| --- | --- |
| `claveEvento` (único) | `{evento}:{uuid o id}:{event_ts}` |
| `evento`, `zoomMeetingId`, `zoomUuid` | identificación del evento |
| `ocurridoAt`, `recibidoAt`, `procesadoAt` | tiempos |
| `estado` | `RECIBIDO`, `PROCESADO`, `IGNORADO` o `ERROR` |
| `detalle` | motivo corto en texto |
| `cargaMinima` (JSON) | solo `id`, `uuid`, `start_time`, `end_time`, `topic` y los campos modificados; **sin** participantes, correos ni URLs de inicio |

La inserción es `ON CONFLICT DO NOTHING`: un evento repetido o desordenado no se procesa dos veces. Los registros de más de 90 días se podan junto con la limpieza periódica existente. Alternativa si se prefiere evitar la migración: usar `Auditoria` con consulta previa, aceptando una condición de carrera mínima; se desaconseja.

### 3. De qué encuentro habla el evento

1. Se buscan los eventos `ZOOM` activos cuyo `codigoReunion` o `externalEventId` coincide con `object.id`, directamente o a través de `ReunionProveedor.externalId`.
2. Entre los encuentros candidatos se elige el que **contiene el instante del evento** en su ventana `[inicio − 30 min, fin + 2 h]`; si hay varios, el de inicio más cercano.
3. Si ninguno encaja, el evento queda `IGNORADO` con el motivo «sin encuentro». Es el caso normal de una reunión instantánea o ajena a Sala Virtual.

### 4. Transiciones

Una función pura decide qué hacer; el servicio solo aplica el resultado.

| Evento | Condición | Efecto |
| --- | --- | --- |
| `meeting.started` | encuentro `PROGRAMADA` | pasa a `EN_CURSO` |
| `meeting.ended` | encuentro `EN_CURSO` o `PROGRAMADA` | pasa a `FINALIZADA` |
| `meeting.started` / `meeting.ended` | encuentro `CANCELADA` o ya `FINALIZADA` | se ignora; nunca se «revive» un encuentro |
| `meeting.updated` | los valores nuevos (hora, duración, título) **coinciden** con la base | se ignora (es el eco de un cambio hecho por Sala Virtual) |
| `meeting.updated` | difieren de la base | `estadoIntegracion = ERROR`, `errorIntegracion` con el campo modificado y registro en `Auditoria`; **no se corrige solo** |
| `meeting.deleted` | el encuentro ya está cancelado o con cancelación pendiente | se ignora (lo eliminó Sala Virtual) |
| `meeting.deleted` | el encuentro sigue activo | `estadoIntegracion = ERROR`, «La reunión fue eliminada en Zoom», y registro en `Auditoria`; **no se recrea sola** |

La detección es **por diferencia contra la base**, no por quién hizo el cambio, para no depender de un campo de operador que Zoom puede no informar en las llamadas de una app de servidor a servidor.

### 5. Reprocesamiento

El procesador de pendientes que corre cada 5 minutos toma también los eventos en `RECIBIDO` o `ERROR` con más de 1 minuto de antigüedad, hasta 3 intentos, y los vuelve a procesar con la misma función pura.

### 6. Seguridad y privacidad

- Secreto solo en `ZOOM_WEBHOOK_SECRET_TOKEN` del entorno de producción; nunca en logs, errores ni respuestas.
- Se guarda la carga mínima descrita arriba. No se guardan datos de participantes en esta entrega.
- Sin lógica de negocio antes de verificar la firma; sin diferencias de respuesta entre «firma inválida» y «cuerpo inválido» más allá del código 401.

### 7. Configuración en Zoom y despliegue

- En la **app nueva** de servidor a servidor: Features → Event Subscriptions, URL `https://<dominio>/api/v1/webhooks/zoom`, los cuatro eventos, y copiar el «Secret Token» a `ZOOM_WEBHOOK_SECRET_TOKEN` en `.env.production`. Los permisos exactos de cada evento los muestra el Marketplace al agregarlo.
- Orden: desplegar el endpoint primero y recién después pulsar «Validate» en Zoom.
- Con el endpoint sin la variable configurada responde 503 y no procesa nada.

## Fases (un PR por fase, con pruebas primero)

1. **Dominio puro:** verificación de firma, respuesta al desafío, elección del encuentro, tabla de transiciones. Sin base de datos.
2. **Persistencia y servicio:** modelo y migración, registro idempotente, aplicación de transiciones y reprocesamiento.
3. **Ruta y despliegue:** el endpoint, la guía de configuración y la comprobación posterior.

## Pruebas

- Firma: válida, secreto incorrecto, cuerpo alterado, timestamp viejo o futuro, encabezados ausentes.
- Desafío: el `encryptedToken` coincide con el HMAC esperado.
- Elección del encuentro: serie compartida con varios encuentros, ventana de borde, ninguno que encaje, varios que encajan.
- Transiciones: cada fila de la tabla, incluidos los estados terminales.
- Idempotencia: el mismo evento dos veces, y dos eventos distintos del mismo encuentro fuera de orden.
- Reglas del repo: dominio sin `let`, sin métodos que mutan colecciones y sin efectos externos.

## Decisiones abiertas

1. **Migración de Prisma** para `EventoWebhookZoom`: aditiva, con la reversión documentada.
2. **Encuentros vencidos sin eventos:** con el webhook activo, ¿un encuentro de Zoom que nunca empezó pasa a `NO_REALIZADA` tras un plazo? Propuesta: 24 horas después de su fin. Los 306 históricos no se tocan automáticamente: se revisan en un informe aparte.
3. **Dependencia externa:** la app nueva de Zoom debe existir antes de poder suscribir eventos.
