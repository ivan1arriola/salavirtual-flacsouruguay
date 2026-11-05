# Ejecución de los pendientes del 2026-11-05

Rama de trabajo: `codex/pendientes-2026-11-05`, desde `32fe959` de `main`. El plan aprobado está en la conversación de esta sesión; los insumos están en `docs/handoff/` y `docs/superpowers/reviews/2026-11-05-cuentas-zoom-por-grupo/`.

## Orden acordado

1. Conservar el contexto y fijar el estado de partida.
2. Endurecer la sincronización de salas Zoom.
3. Validar manualmente la primera sincronización y recién entonces activar el timer horario.
4. Diagnosticar y corregir de a uno los pendientes operativos de Meet y los históricos.
5. Incorporar webhooks, asistencia final por UUID y archivos Zoom en Drive.
6. Refactorizar Configuración, sidebar y panel de series.
7. Auditar y cerrar PR y ramas obsoletos.

## Estado

- El PR #166 y el #195 están mergeados; el #173 y los #167–#170 seguían abiertos al comenzar esta rama.
- La suite base pasó: 2876 pruebas, 14 omitidas (2026-11-05).
- Los informes de Codex y los reportes finales están copiados a `docs/superpowers/reviews/2026-11-05-cuentas-zoom-por-grupo/`. Los `.log` crudos siguen solo en `.superpowers`; no son necesarios para reconstruir las conclusiones.
- La primera sincronización real, la nueva app de Zoom y las correcciones en producción requieren datos y revisión operativa; aún no se ejecutaron.

## Avance en esta rama

- `ce9420c`: se versionaron las notas de traspaso y las revisiones de Codex; los logs crudos permanecen locales.
- `a98335f`: el cron rechaza cuentas anfitrionas nuevas hasta que un administrador las revise.
- `5cfe4b3`: la consulta de reuniones pendientes conserva las salas con encuentros `EN_CURSO`, aunque hayan superado la hora prevista.
- `d61905d`: el cron también rechaza pérdidas de licencia; se actualizó la prueba de Configuración para la consulta nueva.
- `4616d52`: una confirmación administrativa usa la huella del plan visto y rechaza cualquier diferencia al volver a calcularlo.
- `44ab9b6`: la vista previa muestra las reactivaciones y las cuenta como cambios reales.

Pendiente inmediato en la sincronización: proteger cuentas reservadas por migraciones incompletas; revisar rechazos persistidos, errores Zoom 401/403 y mensajes de rutas; añadir la prueba PostgreSQL de la consulta; instalar el temporizador solo después de la primera sincronización manual validada. Los demás bloques del plan siguen pendientes.

Verificación de esta tanda: `npm test` pasó con 2882 pruebas y 14 omitidas; `npm run check` terminó sin errores; `npm run build` terminó con código 0. La cuenta Codex llegó a 98 % de su ventana de cinco horas durante esta tanda; continuar desde este punto sin rehacer los commits anteriores.

## Decisiones de producto

- Seguridad y datos antes que cambios visuales. Entregas separadas.
- Las altas automáticas de salas Zoom quedan pendientes de revisión administrativa. Timer cada hora después de la primera sincronización manual validada.
- Administración resuelve ejecuciones Zoom ambiguas; el reporte posterior por UUID define la asistencia final.
- Grabaciones y transcripciones literales van a Drive institucional con la política vigente de Meet. No se incluyen resúmenes de AI Companion.
- Los encuentros cancelados permanecen visibles con su estado. Los 26 trabajos de Meet y los 306 encuentros históricos se diagnostican antes de cualquier corrección.
