# Arquitectura

## Principios

- La entidad academica principal es la `SolicitudSala`.
- Cada solicitud genera una o mas `InstanciaSala`.
- La integracion externa vive en `EventoProveedor`.
- Google Meet es el proveedor operativo.
- Zoom queda como proveedor historico, sin crear nuevas solicitudes operativas.
- La UI debe ser ligera: CSS propio, componentes pequeños y dependencias justificadas.

## Capas

- `app/`: rutas Next.js, server components y endpoints.
- `src/modules/solicitudes`: validacion y casos de uso de solicitudes.
- `src/modules/meet`: puerto de provisionamiento Google Meet.
- `src/modules/historico-zoom`: importacion y consulta de datos heredados.
- `src/modules/asistencias`: disponibilidad, interes, asignacion y liquidacion.
- `prisma/schema.prisma`: contrato relacional 3NF.

## Decisiones de UI

- Sin Material UI en la base.
- Sin framework CSS obligatorio.
- CSS global pequeño y componentes de servidor cuando no se necesita estado cliente.
- Tableros densos, sobrios y rapidos de escanear.
- Interacciones cliente solo donde aporten valor: formularios, filtros, asignaciones y reportes.
