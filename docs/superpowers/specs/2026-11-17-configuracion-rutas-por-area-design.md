# Configuración por áreas, sin Meet (etapa 3)

## Intención

La administración siente que `/configuracion` es caótica. Causa en el código: una sola página (`app/(gestion)/configuracion/page.tsx`, ~380 líneas) elige entre siete secciones con `?seccion=` y concentra consultas, mensajes y formularios de todas. Zoom apila cuatro bloques en una columna. Además, desde 2026-11-17 ya no hay licencias de Google Meet: Meet debe desaparecer de la configuración.

## Objetivos

- Un Inicio que muestre el estado de cada servicio y qué requiere atención.
- Una pantalla por área, con carga de datos propia: Zoom, Google, Salas, Correo, Notificaciones.
- Bloques de resumen con botón "Editar"; los secretos permanecen ocultos hasta editar.
- Quitar todo rastro de Meet de la configuración (ver abajo).
- Que agregar una configuración nueva tenga un lugar obvio.

## No objetivos

- No cambiar modelo de datos, endpoints `/api/v1/configuracion/*`, cifrado ni permisos (sigue siendo solo ADMINISTRACION).
- No borrar código de Meet (servicios, adaptadores, rutas API, tablas): se oculta y se limpia en un cambio aparte.
- No mover herramientas operativas (sincronización de agenda, diagnóstico de correo, histórico) a `centro-operaciones` / `historico`: es la entrega siguiente.
- No verificar la conexión real con Zoom ("Diseñar comprobaciones" de la propuesta de ChatGPT): hoy el estado dice "credenciales disponibles · conexión sin verificar" y requeriría endpoints nuevos.

## Anti-objetivo

Un rediseño que deje los mismos formularios apilados bajo otra URL.

## Contexto de negocio

- Google Meet ya no tiene licencias. Siguen en uso de Google Workspace: cuenta de servicio con delegación (`serviceAccountSubject`), Drive (`driveDestinationId`) y correo.
- Las reuniones antiguas de Meet siguen siendo consultables en el histórico (supuesto, confirmado implícitamente al no objetarse).

## Enfoques considerados

- A. Reorganizar en el lugar con `?seccion=`: barato, pero deja `page.tsx` monolítico. Descartado.
- B. Rutas por área (elegido por el usuario).
- C. B más mover herramientas operativas: demasiado junto; queda para la entrega siguiente.

## Diseño

### Rutas

- `/configuracion` Inicio: tarjetas de estado por servicio (Zoom, Google, Correo, Salas, Notificaciones) y avisos de atención.
- `/configuracion/zoom`: Conexión OAuth, Grupo de cuentas, Notificaciones de Zoom (webhook), Agenda (botón de sincronización forzada actual). Cada bloque = resumen + Editar.
- `/configuracion/google`: cuenta de servicio y delegación, Drive. Sin co-hosts, sin verificación/resincronización de co-hosts, sin operaciones pendientes de Meet.
- `/configuracion/salas`: solo cuentas Zoom (se filtra `proveedorTipo === "ZOOM"`).
- `/configuracion/correo`: ajustes SES; debajo, pruebas y diagnóstico (se mantienen aquí hasta la entrega siguiente).
- `/configuracion/notificaciones`: destinatarios de reportes mensuales (hoy sección "Monitoreo", `AssistantReportConfigForm`).
- "Registros Zoom importados" (histórico) deja de ser sección del menú pero la ruta sigue funcionando hasta la entrega siguiente; el Inicio enlaza a ella. Decisión mía: no se pierde acceso mientras no existe su lugar definitivo.

### Compatibilidad

`/configuracion?seccion=X` redirige a la ruta nueva (workspace→google, asistencia→notificaciones, historico→ruta de histórico actual, programas→`/usuarios?vista=programas` como hoy). `settingsHref` y `legacySettingsRedirect` en `settings-navigation.domain.ts` pasan a producir/mapear estas rutas.

### Estructura de código

- Layout `app/(gestion)/configuracion/layout.tsx` con el shell (menú agrupado ya existente, sin la sección Resumen duplicada) y control de rol ADMINISTRACION una sola vez.
- Una `page.tsx` por área, cada una con sus consultas (lo que hoy hace `obtenerDatosPaginaConfiguracion` por sección se reparte).
- `settings-navigation.domain.ts`: lista de secciones y grupos nueva; se eliminan `workspace`/`asistencia`/`historico` como ids de menú.
- `settings-overview.tsx`: sin referencias a Meet ("cuentas Meet y Zoom", "operaciones pendientes con Google").
- El bloque de Agenda, hoy escrito en `page.tsx`, pasa a componente propio dentro de Zoom.
- Estado de guardado: cada bloque guarda por separado y muestra su propio aviso (reemplaza los `?estado=` globales donde sea posible; se conservan donde las server actions ya los usan).

### Qué se oculta de Meet

`MeetHostsConfig` filtrado a Zoom, `PendingMeetOperationsManager`, `WorkspaceCohostResync`, `WorkspaceCohostsGlobalVerification`, textos y contadores de Meet en Inicio/Salas. Los componentes y APIs quedan en el repo sin referencias desde la configuración.

## Pruebas

- Actualizar `settings-navigation-domain.test.ts`, `settings-center-shell.test.tsx`, `configuracion-page-salas.test.ts` a las rutas nuevas.
- Prueba de que cada `?seccion=` antiguo redirige a la ruta correcta.
- Prueba de que la pantalla de Salas no lista cuentas de Meet.
- Verificación manual en navegador (móvil y escritorio) de cada pantalla; no es posible desde tests unitarios.

## Entregas

1. Rutas, layout, navegación, Inicio y redirecciones.
2. Pantallas de Zoom, Google y Correo con resumen + Editar y sin Meet.
3. (Posterior, aparte) mover herramientas operativas y limpieza de código de Meet.

## Queda a criterio de quien construye

Texto exacto de los resúmenes, iconos, qué campos muestra cada resumen, y si "Editar" despliega en el lugar o abre un panel.

## Riesgos

- Marcadores o enlaces a `?seccion=` en correos/mensajes ya enviados: cubiertos por las redirecciones.
- `?estado=`/`?error=` de las server actions (`actions.ts`) redirigen hoy a `/configuracion?seccion=...`; hay que revisarlas una por una.
- Hay datos de hosts Meet existentes: se ocultan, no se borran.
