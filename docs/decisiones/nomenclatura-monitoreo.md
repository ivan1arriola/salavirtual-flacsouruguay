# Nomenclatura de monitoreo (17 de octubre de 2026)

## Términos públicos

- Área y actividad: **Monitoreo**.
- Rol de usuario: **Asistente de monitoreo**.
- Plural: **Asistentes de monitoreo**.
- Tareas: **Gestión de monitoreo**, **Horario de monitoreo**, **Monitoreo asignado**, **Monitoreo pendiente de asignación**, **Finalizar monitoreo**.
- Ruta de navegación: `/monitoreo`.

La **lista de asistencia de participantes** no cambia de nombre; es una funcionalidad distinta del monitoreo de reuniones.

## Compatibilidad

- Se conservan valores del dominio persistidos, como `ASISTENTE_TECNICO`, `requiereAsistenciaTecnica` y nombres de tablas/campos Prisma.
- Se conservan API existentes (`/api/v1/asistencia/**`) y rutas anteriores (`/asistencia-tecnica`) para enlaces compartidos e integraciones.
- `/monitoreo` publica la misma pantalla de gestión, sin duplicar la lógica.
- Este cambio es de nomenclatura y navegación, no de permisos, modelos ni reglas de asignación.

## Verificación

Revisar roles de administración, docentes y asistentes de monitoreo, escritorio y móvil, correos/notificaciones, agenda y generación de reportes. Ejecutar comprobaciones estáticas, pruebas automatizadas y compilación antes de integrar en `main`.
