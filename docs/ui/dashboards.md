# Dashboards por rol

Las páginas iniciales ya usan componentes separados para administración, docentes y asistentes de monitoreo. Esta fase conserva esas consultas y acciones existentes y ajusta la prioridad visual de administración.

## Administración

El orden es agenda de hoy, próximos encuentros, triage de intervención y dos indicadores generales. La lista próxima muestra hasta cinco reuniones de los siguientes siete días, con horario académico, programa, docente, modalidad y estado de monitoreo. La agenda de hoy identifica el proveedor activo para nombrar el acceso y el enlace; los cohosts se presentan únicamente cuando el proveedor es Google Meet. El triage muestra incidencias abiertas primero, luego cobertura pendiente, errores de integración, grabaciones y posibles duplicados.

Los indicadores secundarios conservan solicitudes activas y actividad de siete días. Los conteos de hoy, cobertura pendiente, errores y grabaciones se mantienen disponibles para los componentes y consumidores actuales, pero no se repiten como tarjetas en el dashboard.

## Docentes

El dashboard existente conserva la clase próxima, acceso a Meet, horarios académicos y de monitoreo, agenda futura y grabaciones recientes. No se duplica su lógica en el dashboard administrativo.

## Asistentes de monitoreo

El dashboard existente conserva la próxima asignación, acceso a Meet y operación, horarios de monitoreo separados del horario de la reunión, agenda abierta y resumen de horas. Los enlaces «Mi agenda» abren la vista mensual y «Mis monitoreos» abre las coberturas próximas.

## Límite del modelo actual

La modalidad persistida actualmente admite `VIRTUAL` y `HIBRIDA`. La ubicación física no tiene un campo específico en el modelo consultado por estos dashboards. La UI presenta únicamente los datos existentes; agregar modalidad `PRESENCIAL` o ubicación requiere justificar un cambio funcional y de persistencia antes de incorporarlos.
