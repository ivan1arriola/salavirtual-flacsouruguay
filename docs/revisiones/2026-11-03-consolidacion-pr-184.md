# Consolidación de pull requests pendientes en #184

Fecha: 2026-11-03. Destino: `feat/reemplazo-futuro-serie-zoom-20261103`.

La integración debe hacerse en este PR y no directamente en `main`. **No cerrar un PR de origen como incorporado hasta comprobar que su contenido efectivo está en #184 y que el CI lo acepta.**

| PR | Tema | Estado en #184 | Acción |
| --- | --- | --- | --- |
| #183 | Detección de IDs/enlaces Zoom distintos | **Incorporado en código** | Se copiaron los dos archivos modificados, incluidos alerta y acceso a corrección para Administración. Validar CI. |
| #179 | ID de Zoom en detalle | **Ya presente en el código de partida** | Comprobar la regresión; no sobreescribir rediseño actual con componente anterior. |
| #173 | Proveedor operativo Zoom | **Pendiente de revisión diferencial** | Rama 75 commits detrás de #184 y 86 archivos modificados; no sustituir los módulos de producción actuales con versiones antiguas sin reconciliación. |
| #172 | Iconos y PWA | **Pendiente de integrar** | Incluye tres imágenes PNG binarias; requiere integrar blobs y comprobar contrato PWA en build y móviles. |
| #165 | Actualización actions/cache 4 a 6 | **Pendiente de integrar** | Verificar compatibilidad de action y entorno de ejecución con workflows actuales. |
| #166 | Actualización en lote de dependencias | **Pendiente de integrar** | Resolver conflictos en package.json/lock, reconstruir lock coherente y probar. |
| #167 | @prisma/client 7 | **Pendiente de integrar** | Debe coordinarse con #169 (prisma 7) y sus cambios incompatibles de configuración/generación. |
| #168 | TypeScript 7 | **Pendiente de integrar** | Revisar compatibilidad con Next.js, tipos, lint y Vitest antes de fijar versión. |
| #169 | Prisma 7 | **Pendiente de integrar** | Integrar conjuntamente con #167, validar schema, cliente y pruebas PostgreSQL. |
| #170 | Vitest 5 | **Pendiente de integrar** | Revalidar configuración, coverage y tests. |

## Advertencias importantes

- No hacer un merge ciego de los PR Dependabot: todos tocan simultáneamente `package.json` y `package-lock.json`. Cada uno fue preparado contra una línea base anterior a la actual.
- El PR #173 también está muy atrasado respecto de la rama actual; puede introducir regresiones de seguridad, provisión y persistencia.
- Un PR abierto puede tener funcionalidad ya implementada en `main`; comparar comportamiento y pruebas, no solo nombres.
- La operación de **reemplazar encuentros futuros por nueva serie Zoom y cancelar originales** todavía requiere implementar y probar orquestación duradera, Zoom/Calendar y notificaciones. No dar el PR por listo para despliegue.
- No cerrar los otros PR como resueltos hasta que estén incorporados o explícitamente descartados con evidencia y CI.

## Orden de integración propuesto

1. Comprobar los cambios del #183 y la regresión de #179 dentro de #184.
2. Auditar #173 contra el proveedor Zoom ya operativo, adoptar solo diferencias que falten.
3. Incorporar #172 y #165 con sus verificaciones.
4. Unificar y reconstruir dependencias (#166–#170), manteniendo versiones compatibles.
5. Implementar el orquestador real de reemplazo con nuevas entidades, provisionamiento Zoom compartido, validación Calendar, cancelación posterior y pruebas de recuperación.
6. Ejecutar CI completo, verificar permisos, invariantes de historial y series mixtas. Solo después considerar la fusión a main.

**Esta lista distingue explícitamente cambios integrados y cambios aún pendientes; no implica que los PR antiguos estén automáticamente fusionados.**
