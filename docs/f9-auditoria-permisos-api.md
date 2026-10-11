# F9 — Auditoría de autenticación, permisos y contratos HTTP

## Alcance revisado

Rutas `app/api/v1` de reuniones, asistencia, configuración, usuarios, notificaciones y móviles; adaptadores de sesiones y tokens; casos de uso de encuentros, series, cohosts, postulaciones y cambios de rol. Revisión estática sobre el repositorio, no prueba de penetración ni ensayo E2E.

## Hallazgos confirmados y correcciones incluidas en PR #102

| Severidad | Ruta(s) | Evidencia | Corrección |
| --- | --- | --- | --- |
| Alta | GET configuración/google-workspace | Confiaba únicamente en `session.user.role` para acceder a metadatos de credenciales institucionales | Resolver rol/estado actuales desde DB y denegar si no es administración activa |
| Alta | GET usuarios/:id/cuentas-google | Lectura de emails y métodos de acceso autorizada solo por rol de sesión, aunque el usuario hubiera sido degradado | Comprobación de administración activa en DB antes de consultar al tercero |
| Alta | GET asistencia/planilla-pagos | Documento con datos de liquidaciones protegidos solo por claim de sesión | Comprobación de administración activa en DB antes de generar XLSX |
| Media | GET mobile/reuniones y GET/PUT mobile/agenda-abierta | `.catch(() => null)` convertía 403 y fallos inesperados en 401 | Preservar MobileActorError 401/403 y propagar fallos inesperados |
| Media | Endpoints POST/PUT de postulaciones, asignaciones, desvinculaciones y notificaciones de asistencia | Devolvían 400 y `error.message` incluso para fallos técnicos y accesos prohibidos | Errores de dominio tipados y `toHttpError` con cuerpo genérico ante 500 |

## Matriz comprobada

| Operación | Actor permitido | Control de recurso | Observación |
| --- | --- | --- | --- |
| Gestión de encuentros y series | Administración o docente autorizado por programa | `puedeGestionarPrograma` y consulta restringida a solicitud/instancia | Positivo, requiere E2E multirol |
| Cambio puntual de modalidad y horario híbrido | Administración | `validarGestion` y reglas de la instancia | Positivo, requiere pruebas de fechas pasadas |
| Verificación y actualización de cohosts | Administración o docente autorizado por programa | `puedeGestionarPrograma` | Positivo, Google externo requiere staging |
| Cancelación transaccional de series | Administración o docente autorizado por programa | Valida todos los agregados antes de modificar | Positivo, integración eventual pendiente |
| Asignación de asistencia | Administración activa | Servicio relee rol dentro de transacción | Positivo |
| Postulación y reporte de duración | Asistente técnico activo | Asignación del actor y estado del encuentro | Positivo |
| API administrativa Android | Administración activa y token de sesión vigente | `requireMobileActor`, getAdminMeeting, servicio de encuentros | Positivo, requiere E2E |
| Agenda personal Android | Asistente técnico con sesión vigente | Consulta por asignaciones de actor | Positivo; respuesta 403 corregida |
| Notificaciones propias | Actor autenticado y activo | `where: { usuarioId: actor.id }` | Positivo |

## Riesgos pendientes (no afirmados como explotables)

1. **Resuelto:** `resolveSessionActor` ya no vincula sesiones por email al faltar el ID. Un usuario migrado debe volver a autenticarse; las credenciales y asociaciones siguen siendo gestionadas por la capa de identidad.
2. Algunos GET de agenda móvil hacen consultas sin paginación; analizar volumen y límites antes de ampliar acceso.
3. Versionar esquemas de respuesta/error (OpenAPI o Zod compartidos) y ejecutar contract tests web + Android.
4. Evaluar protección CSRF y política de origen de mutaciones web con cookies, considerando Auth.js, configuración de host/proxy y consumo real.
5. **Cobertura parcial resuelta:** `test/f9-program-authorization-postgres.test.ts` prueba denegación cruzada real en cancelación de series, acceso al programa propio, revocación, y no mutación de recurso ajeno. Faltan E2E de otras rutas/roles e integración con clientes Android.
6. Revisar el resto de endpoints administrativos y Server Actions para detectar autorizaciones basadas solo en roles de sesión.
7. Evaluar rate limiting de login, verificación externa de cohosts y creación de eventos, además de métricas para 401/403/429.
8. Homogeneizar errores tipados restantes en configuración, rol y estado operativo de asistentes.

## Criterios de aceptación

- CI y PostgreSQL integrados pasan en el SHA final de la PR.
- Un administrador degradado o desactivado recibe 403 en las tres lecturas sensibles sin consultas de datos posteriores.
- Administración vigente mantiene acceso funcional a las mismas lecturas.
- Móvil distingue 401 (token inválido), 403 (actor no permitido) y fallos internos no enmascarados.
- API de asistencia no revela mensajes internos en HTTP 500 y usa errores 403/409/400 según la regla.
- Staging: pruebas con docentes de programas distintos, asistentes asignados/no asignados y sesiones revocadas.
- No marcar F9 completa hasta finalizar la revisión cruzada de Server Actions y los tests E2E con PostgreSQL y Android.

## Endurecimiento posterior

- `test/f9-session-id-stability.test.ts`: prueba que un identificador eliminado no puede adoptar otra cuenta aunque reutilice su correo.
- `.github/workflows/check-postgres.yml`: ejecuta el nuevo test real de separación entre programas antes de permitir deploy.
- El endpoint Android de login aún no tiene un límite distribuido de intentos registrado en la base de datos: considerarlo trabajo obligatorio antes de exponerlo ampliamente a Internet; una caché en memoria por proceso no sería control suficiente.
- CSRF: las Server Actions usan el mecanismo de Next.js; las rutas API que escriben con cookies deben validar defensivamente origen/host y política SameSite en el despliegue real. Requiere pruebas de proxy para evitar falsos rechazos.

## Comprobación adicional de la ruta efectiva de asistencia

La API de asignaciones no llama directamente a `asistencia.service.ts`: se compone mediante `src/bootstrap/asistencia.server.ts`, `src/modules/asistencia/application/` y `src/modules/asistencia/infrastructure/prisma/`.

Se corrigieron los errores de autorización, reglas de conflicto y validación **también en esa cadena efectiva**, para que `toHttpError` pueda emitir 403/409/400 sin filtrar excepciones inesperadas. `test/f9-assistance-usecase-permissions.test.ts` valida las denegaciones de los casos de uso en ejecución.
