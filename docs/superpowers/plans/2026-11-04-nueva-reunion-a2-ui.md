# Nueva reunión A2 — Plan de implementación

> **Para agentes:** usar superpowers:executing-plans, tarea por tarea, con TDD. La ejecución ya fue solicitada junto con el spec y plan; no se requiere otra aprobación. No cambiar de rama ni hacer commits.

**Objetivo:** entregar el selector única/serie, editor de fechas seguro, resumen derivado y diseño responsive de A2.

**Arquitectura:** conservar estado y envío en `meeting-form-zoom.tsx`; helpers puros para fechas y transiciones, componentes presentacionales y CSS Module local. Sin nuevo estado de resumen.

**Tecnología:** Next.js 16, React 19, TypeScript, Vitest y `renderToStaticMarkup`.

**Spec:** `docs/superpowers/specs/2026-11-04-nueva-reunion-a2-ui-design.md`.

## Restricciones globales

POST único a `/api/v1/reuniones`, plataforma ZOOM, sin participantes añadidos; idempotencia con `||=`, bloqueo con `submittingRef`, foco de error y botón de envío conservados. Zona America/Montevideo; modalidad virtual sin monitoreo; cobertura virtual fija y margen híbrido mínimo de 30 minutos. Hasta 100 encuentros; título de al menos 3 caracteres, programa permitido y fin posterior al inicio. Sin URLs ni ID de Zoom. Sin backend, dependencias, app, túneles, commits ni push. Nuevos archivos con salto final y español rioplatense.

## Focos de revisión

Cancelación sin mutaciones (tarea 1/2); filas vacías y empates al ordenar (1); contigüidad y filas inválidas al detectar solapamiento (1); horario cerca de medianoche y zona del navegador distinta (1/3); edición de cada campo de recurrencia sin fechas enviables (1/2). IDs estables tras ordenar y duplicar (1/2). El resumen no anuncia contenido editable por tecla (3).

## Tarea 1 — Helpers de fechas y transiciones

**Archivos:** crear `nueva-reunion/fechas-formulario.ts` y `test/nueva-reunion-fechas.test.ts`.

**Interfaces:** `ordenarEncuentros(fechas)`, `detectarSolapamientos(fechas)` (pares de ids), `duplicarEncuentro(fecha, id)`, `resumirFechas(fechas)` (primera/última), `requiereConfirmacionCambio(actual, destino, fechas, regla)`, `fechasAlCambiarModo(destino, fechas, nuevaFecha)` e `invalidarRecurrencia()` (fechas vacías, generated false, mensaje vacío).

- [x] Escribir pruebas con valores literales de orden estable sin mutar, copia completa con id distinto, contigüidad sin solapamiento, filas inválidas ignoradas, resumen con zona Montevideo y confirmación sin tocar datos.
- [x] Ejecutar `npx vitest run test/nueva-reunion-fechas.test.ts`; comprobar rojo por funciones ausentes.
- [x] Implementar los helpers, sin dependencias, y ejecutar la misma prueba hasta verde.

## Tarea 2 — Tipo y editores seguros

**Archivos:** crear `nueva-reunion/meeting-type-selector.tsx`; modificar contenedor, `academic-details.tsx`, `form-primitives.tsx`, `meeting-schedule-editor.tsx`, `meeting-instances-editor.tsx`, `recurrence-rule-editor.tsx`, `meeting-options.tsx`; crear `test/nueva-reunion-a2-ui.test.ts`, adaptar `test/nueva-reunion-componentes.test.ts` y contrato.

- [x] Escribir pruebas de marcado del selector (dos radios, legend, selección y confirmación), única sin modos de serie, serie semanal/manual, duplicar/quitar, límite, advertencia y descripción plegada. Añadir pruebas de contrato para invalidación de todos los campos y envío ordenado.
- [x] Ejecutar las pruebas nuevas y comprobar rojo por marcado faltante.
- [x] Integrar helpers con confirmación pendiente; conservar estado al cancelar, foco accesible, invalidación semanal y guardas de envío. Quitar stepper y «Paso N», reordenar campos y opciones. Duplicar con id del contador, representar orden sin cambiar identidad ni callbacks de fila.
- [x] Ejecutar pruebas específicas y `npm run check`, resolver regresiones sin reducir contratos de backend.

## Tarea 3 — Resumen derivado y CSS responsive

**Archivos:** modificar `meeting-summary.tsx`, contenedor, opciones (asistente controlado), encabezado de `nueva-reunion-zoom-page.server.tsx`; crear `nueva-reunion/nueva-reunion.module.css`; depurar `app/(gestion)/reuniones/nueva/nueva-reunion.module.css` solo tras búsqueda de consumidores; actualizar pruebas de marcado.

- [x] Escribir pruebas del resumen con programa/docente, fechas Montevideo, modalidades, grabación, cobertura y asignación según rol, plegado accesible y aviso de enlace único sin URL.
- [x] Ejecutar las pruebas y observar rojo.
- [x] Implementar resumen derivado; limitar live region a estado breve. Aplicar layout 2:1 desde 1100 px, resumen sticky, una columna por debajo, barra móvil sticky en flujo con safe-area, controles de 44 px y tokens de diseño existentes.
- [x] Buscar consumidores de CSS anterior antes de retirar reglas; conservar CSS legacy compartido. Ejecutar marcado y check.

## Tarea 4 — Verificación y entrega

- [x] Revisar diff completo, claves estables, contratos, permisos, límites, CSS local y salto final de archivos nuevos.
- [x] Ejecutar `npm run check` y `npx vitest run` completos; registrar conteos reales y cualquier fallo.
- [x] Actualizar esta bitácora e informar archivos por tarea, desviaciones y riesgos. Capturas y verificación interactiva pendientes por instrucción explícita.

## Bitácora

- Inicio: rama `feat/nueva-reunion-a2`, árbol limpio. AGENTS, documentos A1 y documentación local Next de CSS y `use client` leídos.
- Decisión: ejecución en la rama indicada, sin worktree/commits y sin ronda adicional de aprobación, según encargo explícito.
- Tarea 1: helpers implementados tras observar el fallo por módulo ausente; 9 pruebas aprobadas.
- Tareas 2 y 3: selector, confirmación en línea, editor cronológico con duplicación, resumen y CSS local implementados tras pruebas rojas de marcado. Las 4 suites específicas pasan con 56 pruebas. Se ejercitan los callbacks sobre el árbol React puro para comprobar que editar/duplicar/quitar luego de ordenar siguen apuntando a la fila original.
- Decisión: se conserva íntegro el CSS global y el módulo anterior de página porque la pantalla legacy continúa usándolos; la pantalla Zoom importa el módulo nuevo.
- Revisión independiente de solo lectura: detectó superposición potencial de la acción móvil con `.mobile-nav`. Se reprodujo con una prueba de contrato roja y se corrigió el offset a 74 px más safe-area, con reserva y margen de desplazamiento. Prueba posterior verde. Sin otros hallazgos importantes.
- Verificación adicional: 26 pruebas de helpers y UI aprobadas con `TZ=Pacific/Auckland`, conservando las fechas y horas esperadas de Montevideo. `npm run check` final aprobado.
- Primera suite completa: 247 archivos y 2585 pruebas aprobadas, 3 archivos y 14 pruebas omitidas. Se repite al final por las dos pruebas y el ajuste de CSS agregados durante la revisión.
- Limitación: las horas de cobertura híbrida que cruzan medianoche se conservan como en el editor actual, sin rótulo adicional de día anterior/siguiente. La conversión del payload mantiene sus pruebas de desfase.
- Tarea 4 completa: `npm run check` sin errores; `npx vitest run` final con 247 archivos aprobados y 3 omitidos (250), 2587 pruebas aprobadas y 14 omitidas (2601), código de salida 0. Duración: 114,38 segundos. `git diff --check` limpio, archivos nuevos con salto final, rama `feat/nueva-reunion-a2` conservada. Sin cambios de backend, Prisma, dependencias ni pantallas legacy; sin app, túneles, commits ni push.
