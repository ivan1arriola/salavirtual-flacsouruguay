# Google APIs — política de resiliencia (F8+)

## Principios

No todas las llamadas a Google son equivalentes. Perder la respuesta HTTP no demuestra que el servidor no haya realizado el cambio.

| Operación                              | Reintento inmediato                                                                    | Recuperación                                                                                    |
| -------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| GET Calendar, Meet, Drive y artefactos | Sí, solo 408/429/5xx y fallos de red transitorios (403 limitado a cuotas recuperables) | Hasta 4 intentos, backoff exponencial con jitter, honor Retry-After, espera máx. 30 s           |
| PATCH/DELETE Calendar, Meet, Drive     | No automático                                                                          | Leer estado actual y reconciliar desde una operación persistida                                 |
| POST Calendar con ID determinístico    | No automático                                                                          | GET por ID, comparar y después actualizar/reconciliar                                           |
| POST Meet spaces                       | **No**                                                                                 | Requiere guardar espacio remoto antes de depender de Calendar; hoy puede dejar espacio huérfano |
| POST Drive files o carpetas            | **No**                                                                                 | Requiere índice local de objetos, exclusión mutua por clave y relectura                         |
| POST Gmail send                        | **No**                                                                                 | Debe usar outbox transaccional y reconciliación con estado desconocido para no duplicar correos |

Las lecturas emplean timeout por intento de 20 s; las escrituras conservan 60 s. Los límites de demora y número de reintentos son locales a cada llamada, no constituyen todavía un presupuesto global por transacción.

## Clasificación

- Reintentar: HTTP 408, 429, 500, 502, 503, 504; 403 exclusivamente `rateLimitExceeded`, `userRateLimitExceeded`, `quotaExceeded` o `RESOURCE_EXHAUSTED`; códigos de red conocidos.
- No reintentar: 400, 401, 404, 409, 403 por permiso, `dailyLimitExceeded` y fallos sin clasificación inequívoca.
- Los detalles de respuestas Gmail no deben reflejarse en errores visibles al usuario.
- Evitar `Promise.all` masivo con cuentas de servicio compartidas; usar límites de concurrencia y métricas.

## Seguimiento operativo necesario

1. **Saga/outbox de Meet**: `CREAR_ESPACIO` → persistir ID remoto → vincular a Calendar → configurar cohosts → completar. Identificar resultado ambiguo como `REQUIERE_REVISION`, no POST inmediato sin prueba.
2. **Drive**: exclusión mutua e índice duradero de carpetas/documentos con clave lógica estable; marcar incertidumbre en errores de POST.
3. **Gmail**: cola con `messageId` consistente, reintentos condicionados a conciliación y protección contra envíos duplicados. Un timeout de Gmail no prueba que el mensaje no haya sido enviado.
4. **Cuotas**: métricas por API, cuenta delegada, motivo 403/429, tiempo de espera y latencia p95/p99; distribuir carga en el tiempo.
5. **Circuit breaker distribuido**: bloquear temporalmente fallos de cuota persistentes sin impedir la recuperación manual.
6. **Alertas**: avisar operaciones pendientes por más de cierto umbral, errores consecutivos y falta de ejecuciones exitosas de los timers.
7. **Staging**: simular caída después del POST remoto, expiración de tokens, 429/503, Google 403, paginación repetida y reejecución de la misma operación.

## Validación

`test/google-read-resilience.test.ts`, `test/google-api-retry.test.ts`, `test/calendario-asistente-infrastructure.test.ts`, `test/integrations-google-gmail.test.ts`. Exigir CI y comprobar recuperación real en staging antes del merge.
