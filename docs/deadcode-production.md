# Control de código muerto en producción

## Ejecución

- `npm run deadcode`: control existente, incluye pruebas y herramientas.
- `npm run deadcode:production`: análisis de producción mediante Knip; devuelve error cuando detecta hallazgos.
- `npm run deadcode:report`: inventario JSON de producción sin bloquear por hallazgos.

El workflow Dead Code · Production guarda el informe como artefacto durante 14 días. En esta primera fase no integra el deploy gate: se necesita revisar la línea base y los falsos positivos.

## Criterios de revisión

- Revisar puntos de entrada de Next.js, workers, tareas programadas y scripts administrativos.
- Diferenciar referencias exclusivas de pruebas de referencias de ejecución.
- No eliminar rutas HTTP por ausencia de consumidores internos: pueden ser invocadas por sistemas externos.
- No eliminar automáticamente archivos, exportaciones ni dependencias.
- Registrar excepciones justificadas y activar el bloqueo de regresiones después de validar la línea base.

El análisis de CSS y recursos estáticos requiere un control separado: esta primera entrega no afirma cubrirlo.
