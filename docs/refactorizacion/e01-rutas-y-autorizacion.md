# E01.2 — Inventario inicial de rutas API y mecanismos de autorización

Línea base: `bfcbfc091277086b37a7ae499bc95e54fe441272`. Alcance: 79 archivos `route.ts` bajo `app/api`. Esta es una clasificación estática de mecanismos de entrada y delegación; no equivale a una auditoría de penetración ni demuestra que cada permiso sea correcto.

## Mecanismos de entrada identificados

| Tipo | Implementación observada | Revisión requerida |
| --- | --- | --- |
| Sesión web | Auth.js mediante `auth()`; muchas rutas resuelven actor actual desde base | Sesión expirada, cuenta inactiva, cambio de rol y propiedad del recurso |
| Sesión móvil | `requireMobileActor` y token Bearer firmado | Rol actual, revocación, expiración y compatibilidad de tokens antiguos |
| Tarea programada | `Authorization: Bearer CRON_SECRET` | Secreto ausente/incorrecto, rotación, exposición y permisos mínimos |
| Webhook Zoom | Validación de firma con secreto de webhook | Firma, timestamp, replay, idempotencia y persistencia antes de responder |
| Salud pública | `/api/health` sin sesión | Respuesta mínima, sin datos operativos ni secretos |
| Auth.js | `/api/auth/[...nextauth]` delega en handlers | Flujos OAuth, cookies y callbacks |

## Rutas móviles

Las rutas móviles no usan `auth()` porque emplean tokens Bearer propios. `requireMobileActor`:

- Verifica firma HMAC y expiración del token.
- Resuelve nuevamente el usuario desde la base.
- Rechaza usuarios inactivos y tokens cuyo rol ya no coincide con el rol actual.
- Restringe el rol a una lista permitida por endpoint.
- Para tokens versión 2, busca la sesión persistida mediante hash del identificador y comprueba expiración/revocación.

El verificador mantiene compatibilidad con tokens versión 1, que no tienen identificador de sesión persistido y por tanto no pasan por la consulta de revocación de versión 2. No es prueba de una vulnerabilidad por sí sola: hay que comprobar si se siguen emitiendo, cuál es su TTL efectivo y cuándo puede retirarse esa compatibilidad.

Rutas identificadas: login, logout, identidad propia, agenda abierta, reuniones del asistente y endpoints administrativos de resumen/listado/detalle. Los endpoints administrativos llaman `requireMobileActor(request, ["ADMINISTRACION"])`; agenda abierta y reuniones restringen al rol de asistente.

## Tareas programadas y webhooks

Se verificó comprobación de `CRON_SECRET` en:

- `/api/v1/asistencia/reportes-mensuales`
- `/api/v1/asistencia/sincronizar-calendarios`
- `/api/v1/configuracion/zoom/grupo/sincronizar`
- `/api/v1/reuniones/reconciliar-pendientes`
- `/api/v1/reuniones/recordatorios-24h`
- GET `/api/v1/reuniones/sincronizar-archivos`

`/api/v1/operaciones/estado` permite cron con el secreto o sesión de administración activa. `/api/v1/webhooks/zoom` valida el Secret Token y firma de Zoom; no debe confundirse con la ruta administrativa que configura el secreto cifrado.

## Reglas de autorización de dominio confirmadas

- `puedeGestionarPrograma`: actor activo; administración puede gestionar; docente requiere asociación activa con programa activo; asistente técnico no obtiene permiso académico por esta regla.
- `puedeGestionarEncuentros`: administración o docente titular de la serie. La gestión del programa se comprueba además por separado en el servicio de encuentros.
- `gestionarCoberturaMonitoreo`: solo administración puede gestionar o aprobar coberturas.
- Operación de encuentro: GET distingue no encontrado de prohibido; PATCH/POST delegan en casos de uso y deben verificarse por asignación, rol, estado y proveedor.
- Cambiar modalidad puntual y editar/restablecer horario de monitoreo son acciones administrativas en el servicio de encuentros.
- Configuración y cambios de rol tienen verificaciones administrativas en sus rutas/actions; no confiar solo en ocultar el enlace.
- La ficha de asistencia comprueba que la instancia pertenece a la solicitud y que el actor puede gestionar el programa.

## Casos especiales que no deben clasificarse como falta de autorización

- `/api/v1/reuniones/migracion-zoom/aplicar` requiere sesión, pero está retirada y siempre responde 409 indicando que la migración se realiza por serie. No ejecuta la mutación antigua.
- `/api/v1/health` es una comprobación pública; revisar que siga limitada a salud básica.
- Algunos archivos tienen varios métodos HTTP con políticas diferentes. Por ejemplo, sincronización de archivos separa POST con sesión de GET para cron; el inventario de permisos debe tener una fila por método, no una por archivo.

## Superficie API por dominio

Las 79 rutas se distribuyen entre autenticación/salud, archivos Zoom, asistencia, configuración de Google/Zoom, API móvil, notificaciones, operaciones, reuniones, usuarios y webhook. El listado exacto de rutas se obtiene del árbol de `app/api` en la línea base; la auditoría detallada debe registrar por método: autenticación, autorización, esquema de entrada, alcance de objeto, mutaciones, efectos externos, códigos HTTP y pruebas.

## Riesgos y verificaciones pendientes

1. Completar matriz ruta + método + rol + permiso + objeto + estado + proveedor; no inferir permisos desde la presencia de un `if` en el route handler.
2. Trazar cada endpoint hasta el caso de uso y confirmar que las comprobaciones de programa, titularidad y asignación ocurren dentro del servicio, no solo en la UI.
3. Auditar server actions por función. Hay 10 archivos `actions.ts`; el nivel de protección varía por operación.
4. Probar acceso directo a cada recurso con rol incorrecto, usuario inactivo, ID de otro programa y asignación retirada.
5. Comprobar CSRF/origen cuando corresponda, límites de frecuencia, validación de payloads, idempotencia, registros de auditoría y manejo de errores.
6. Revisar secretos de cron y webhooks, rotación y no exposición en logs.
7. Decidir plan de retirada de tokens móviles versión 1 tras comprobar sesiones reales y compatibilidad.
8. Distinguir un 200 de sincronización completa de un 202 con persistencia local y sincronización externa pendiente.

## Contraste con la auditoría F9 existente

`docs/f9-auditoria-permisos-api.md` registra que PR #102 corrigió tres lecturas administrativas sensibles que antes confiaban solo en el rol de sesión (Google Workspace, cuentas Google de usuarios y planilla de pagos), además de errores de estado HTTP en móvil y asistencia. No se deben reabrir esos hallazgos sin comprobar que la corrección haya regresado.

La misma auditoría deja pendientes que E01 debe revalidar:

- Protección CSRF/origen/host para mutaciones API autenticadas con cookies, teniendo en cuenta proxy y SameSite.
- Rate limiting distribuido para login móvil y límites/observabilidad de 401, 403 y 429.
- Consultas móviles sin paginación y contratos API compartidos con clientes Android.
- Revisión de los endpoints administrativos y server actions restantes para descartar confianza exclusiva en claims de sesión.
- Cobertura E2E multirol y de integración con Android, más allá de las pruebas PostgreSQL ya existentes para separación de programas.

Estos puntos se registran como riesgos pendientes en la auditoría anterior; su estado actual debe confirmarse antes de calificarlos como defectos vigentes o explotables.

## Estado

La revisión confirma mecanismos distintos y varias reglas de dominio relevantes. No se ejecutaron pruebas negativas contra una instancia desplegada, no se probaron tokens ni secretos reales y no se recorrieron los 79 endpoints con cuentas de cada rol. E01.2 permanece parcial.
