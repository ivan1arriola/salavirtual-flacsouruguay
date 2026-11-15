# Reorganización de `/configuracion` (etapa 2)

## Intención

La administración siente que las configuraciones no están bien organizadas. Causa en el código: una lista plana de siete secciones que mezcla integraciones, operación diaria, comunicación y consulta de datos, y reparte Zoom en dos lugares.

## Objetivos

- Menú agrupado por tipo de tarea.
- Todo lo que configura Zoom en una sola sección.
- Lo operativo (operaciones pendientes de Meet) visible en el Resumen, no escondido en Google Workspace.
- Ajustes de correo separados de pruebas y diagnóstico.

## No objetivos

- Cambiar ids de sección, URLs, APIs, permisos o datos. Los enlaces `?seccion=...` siguen igual.
- Rediseño visual, pestañas internas (spec de 2026-09-11) o cambios en formularios.

## Enfoque elegido (B, en dos pasos)

Alternativas descartadas: A sola (no arregla Zoom partido) y C (pestañas, demasiado para un problema de orden).

### Paso 1: menú agrupado

`SETTINGS_SECTIONS` gana un campo `group`. El shell dibuja el título de grupo en el rail y en el menú móvil.

- Integraciones: Google Workspace, Zoom
- Operación: Salas, Monitoreo
- Comunicación: Correo
- Datos: Registros Zoom importados
  El Resumen queda arriba, sin grupo.

### Paso 2: mover contenido

- `ZoomGrupoConfig` pasa de Salas a Zoom (junto a credenciales y webhook).
- Salas conserva solo `MeetHostsConfig` (cuentas de Zoom y Meet). Nueva descripción: "Cuentas de Zoom y Meet que alojan reuniones".
- `PendingMeetOperationsManager` pasa de Workspace al Resumen. El encabezado de Workspace muestra el estado de la integración con `workspaceReadiness`, en lugar del contador de pendientes.
- Correo: ajustes SES primero; debajo, subtítulo "Pruebas y diagnóstico" con `EmailTestForm` y `MailDeliveryDiagnostics`.

## Decisiones mías (a revisar)

- Correo se separa con subtítulo dentro de la misma sección, no como sección nueva.
- Los datos que carga `obtenerDatosPaginaConfiguracion` por sección deben ajustarse: `zoomGrupo` se carga para Zoom y `pendingOperationItems` para Resumen.

## Pruebas

Actualizar `settings-navigation-domain.test.ts` y `settings-center-shell.test.tsx` (grupos); agregar prueba de que cada sección sigue resolviendo.
