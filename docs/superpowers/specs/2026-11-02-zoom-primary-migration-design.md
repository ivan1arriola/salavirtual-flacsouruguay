# Zoom como plataforma principal

## Objetivo

Las reuniones nuevas se crean exclusivamente en Zoom. Los encuentros futuros que hoy usan Google Meet se convierten a Zoom por lotes, salvo los encuentros que administración marque expresamente como excepciones. Los encuentros ya realizados conservan sus enlaces, asistencia, grabaciones y auditoría.

## Estado actual

- La integración Server-to-Server OAuth de Zoom está activa, pero Sala Virtual aún no tiene cuentas organizadoras Zoom. En Zoom existen y tienen licencia `sala01` a `sala09@flacso.edu.uy`.
- El modelo admite un evento Meet y otro Zoom por instancia, pero no registra cuál es el proveedor activo. Diversas pantallas y avisos buscan Meet de forma explícita.
- El alta Zoom aún exige coanfitriones de Google; el formulario de cuentas organizadoras pide una contraseña incluso para Zoom. Ambos puntos deben corregirse antes de pasar nuevas reuniones a Zoom.

## Comportamiento

1. El formulario de reuniones ofrece Zoom. La API rechaza cualquier intento de crear una reunión Meet, incluso si un cliente antiguo envía `GOOGLE_MEET`.
2. Administración configura y verifica las nueve cuentas Zoom. Cada cuenta admite una sola reunión a la vez; la asignación de host considera licencias, prioridad y ocupación de los encuentros Zoom existentes y de los candidatos de la misma conversión.
3. Administración puede marcar por encuentro futuro `Conservar en Google Meet` y agregar un motivo. Esta marca no cambia por sí sola enlaces ni citas. Solo se permite mientras el encuentro no haya comenzado y el proveedor activo sea Meet.
4. La vista previa de migración es de solo lectura. Muestra por encuentro fecha, programa, enlace actual, host Zoom propuesto, destinatarios y resultado: migrable, excepción, ya Zoom, sin sala, cercano/en curso o requiere revisión. Indica el total por estado antes de ofrecer la conversión.
5. La conversión se aplica por instancia con bloqueo e idempotencia. Primero crea y verifica la reunión Zoom y guarda su ID y `join_url` real. Mientras esto falla, el enlace Meet sigue activo. Luego actualiza la cita existente de Google Calendar: quita los datos de conferencia Meet, incorpora el enlace Zoom y notifica a sus invitados. Verifica la cita y recién entonces cambia el proveedor activo en Sala Virtual. No borra el registro histórico Meet ni revoca un espacio Meet compartido con otros encuentros de la serie.
6. Los correos y recordatorios de Sala Virtual utilizan siempre el proveedor activo. Se envía un aviso de cambio una sola vez por destinatario y encuentro; los reintentos no crean un segundo Zoom ni repiten avisos.
7. El lote tiene un piloto de un encuentro, luego tandas pequeñas. Una falla deja el encuentro identificable y reintentable; no detiene los demás. La pantalla muestra resultados y errores por encuentro.

## Datos y compatibilidad

- `InstanciaSala` registra proveedor activo y la excepción Meet. El proveedor activo de datos existentes se establece a partir de su evento actual; no se deduce del primer elemento de una lista.
- Se conserva `EventoProveedor` Meet para auditoría, historial y posibles artefactos. El evento Zoom nuevo se vincula a la misma instancia.
- Las consultas de agenda, reunión, móvil, correo, recordatorio y enlaces pasan por un selector compartido de evento activo. Los informes históricos de Meet continúan leyendo su evento Meet cuando corresponda.
- Los enlaces `start_url` de Zoom se tratan como secretos de anfitrión: no se incluyen en correos ni pantallas de estudiantes.

## Límites

- Este cambio no promete controles en vivo que Zoom no expone por API.
- La migración de asistencia, grabaciones y transcripciones de encuentros Zoom requiere integraciones propias y pruebas aparte; no se atribuye a Meet.
- No se ejecuta el lote de producción hasta que las excepciones estén marcadas y la vista previa sea revisable.
