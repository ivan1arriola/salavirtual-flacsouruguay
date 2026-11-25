# Diagnóstico crítico y prioridades

Evaluación de código y documentación, no de métricas de usuarios.

## P0: resolver antes de rediseñar individualmente

- D01. Fragmentación académica: agenda y series comparten ruta, pero ficha de serie, operación, asistencia y monitoreo tienen distintos puntos de entrada. Definir pertenencia y retorno a la entidad de origen.
- D02. Duplicación por proveedor: reuniones-lista-page.server.tsx y reunion-detalle-page.server.tsx seleccionan implementaciones Meet/Zoom. Compartir presentación y modelos de lectura; mantener adaptadores y capacidades específicas.
- D03. Monitoreo: las pantallas S15 y S16 ofrecen navegación y filtros de cobertura, mientras S30 enlaza a monitoreos pendientes. Establecer un lugar principal para la cobertura, sin perder accesos contextuales.
- D04. Autorización: la navegación no sustituye permisos de servidor. Antes de mover acciones, identificar políticas, alcance de objeto y pruebas de autorización.

## P1: estructura y coherencia

- D05. Personas, programas y equipo de monitoreo se distribuyen entre S21 a S24. Separar entidades y evitar repetir edición de identidad.
- D06. S38 es un registro de consulta, no configuración. Mover su entrada conceptual a Informes, preservando la ruta hasta migración.
- D07. Las funciones de diagnóstico y configuración de Zoom deben distinguir intervención técnica de edición de parámetros.
- D08. El menú por rol contiene destinos que son variantes de una misma página (agenda/series y agenda abierta/postulaciones). Definir cuándo una vista merece navegación global y cuándo interna.
- D09. Las hojas de estilos compartidas y específicas necesitan inventario de consumidores antes de retirar reglas. Reutilizar tokens de app/brand.css, no reescribir todo mediante overrides.
- D10. Desalineación documental: docs/arquitectura.md aún describe Meet operativo y Zoom histórico. El plan del 2 de noviembre y el formulario nueva-reunion-zoom-page.server.tsx indican Zoom para nuevas reuniones. La actualización de documentación técnica debe verificarse contra código y tests; no revertir la migración.

## Hipótesis por comprobar

- La agrupación por tarea reducirá la búsqueda de destinos y vueltas innecesarias.
- Un detalle de encuentro común reducirá inconsistencias sin sacrificar acciones específicas.
- Una sola fuente de navegación reducirá casos activos incorrectos.

Medir línea base y resultado mediante tareas representativas, número de pasos, destinos no encontrados, errores de operación y pruebas de regresión. No convertir apreciaciones cualitativas en puntuaciones objetivas sin estudio.
