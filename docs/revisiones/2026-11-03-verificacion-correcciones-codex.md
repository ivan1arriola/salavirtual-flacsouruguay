<!--
Verificación de las correcciones, generada por Codex (codex exec, sandbox de solo lectura).
Fecha: 2026-11-03. Documentos revisados en el commit 0692ce0 (spec y dos planes de enlace único por serie).
Texto entregado por el revisor, sin edición. No ejecutó pruebas ni leyó el código del repositorio, solo los documentos.
-->

# INFORME

## 1. Veredicto

Los documentos corregidos resuelven la mayoría de los hallazgos señalados y agregan pruebas específicas para varios de los riesgos principales. **Todavía no los considero listos para ejecutarse sin aclaraciones**: quedan decisiones pendientes sobre series mixtas, `actualizarEncuentro` y el alcance de los bloqueos de migración; además, la bandera aparece en una tarea posterior a las que deben respetarla.

## 2. Estado de cada hallazgo (1 a 8)

1. **Resuelto.** El plan define el reclamo persistido `PENDIENTE → CREANDO`, token y hora, guardado temprano del ID, búsqueda de reuniones huérfanas y recuperación de reclamos vencidos; Task 4 incluye pruebas de dos reclamos simultáneos y de reclamo vencido ([plan principal, Task 4](docs/superpowers/plans/2026-11-03-zoom-enlace-unico-por-serie.md#task-4-aprovisionamiento-de-la-reunion-compartida)). El spec recoge la misma estrategia ([spec, Comportamiento → Aprovisionamiento](docs/superpowers/specs/2026-11-03-zoom-enlace-unico-por-serie-design.md#comportamiento)).

2. **Resuelto.** El plan principal permite migrar y corregir series aunque algún encuentro no tenga cita de Calendar; el plan de corrección incluye una serie de Zoom sin citas entre sus pruebas ([plan principal, Global Constraints y Task 7](docs/superpowers/plans/2026-11-03-zoom-enlace-unico-por-serie.md#global-constraints); [plan de corrección, Tasks 2–3](docs/superpowers/plans/2026-11-03-corregir-series-con-enlaces-distintos.md#task-2-plan-de-correccion-por-serie-dominio-puro)).

3. **Resuelto.** Se especifica `AvisoEnlaceSerie`, único por serie, destinatario y tipo; ambos planes dicen que no se reutiliza `AvisoMigracionZoom` y proponen pruebas de no colisión ([spec, Comportamiento → Modelo y Migración por serie](docs/superpowers/specs/2026-11-03-zoom-enlace-unico-por-serie-design.md#comportamiento); [plan de corrección, Global Constraints y Task 3](docs/superpowers/plans/2026-11-03-corregir-series-con-enlaces-distintos.md#global-constraints)).

4. **Resuelto.** “Encuentro activo” requiere estado `PROGRAMADA` o `EN_CURSO` y fin posterior a ahora; los encuentros pasados no cuentan. Task 3 incluye esa condición en `usosActivos` y el plan prueba cancelar el resto de la serie cuando quedan encuentros pasados ([spec, Comportamiento → Aprovisionamiento](docs/superpowers/specs/2026-11-03-zoom-enlace-unico-por-serie-design.md#comportamiento); [plan principal, Task 3 y Review Focus](docs/superpowers/plans/2026-11-03-zoom-enlace-unico-por-serie.md#task-3-dominio-de-uso-de-la-reunion-compartida)).

5. **Parcial.** La bandera apagada por defecto y la instrucción de esperar a que no haya workers viejos están en el spec y Task 9, que además fija el orden de despliegue. Pero Task 9 está después de Tasks 4–7, que ya deben respetar la bandera, y no se precisa cuándo se habilita la migración por serie respecto de la creación compartida ([plan principal, Tasks 4, 7 y 9](docs/superpowers/plans/2026-11-03-zoom-enlace-unico-por-serie.md)).

6. **Resuelto.** `CambioEnlaceCita` registra el progreso por cita y Task 7 exige reanudar solo las pendientes; incluye fallos en la primera, segunda y tercera cita y pruebas de reintento ([spec, Comportamiento → Migración por serie](docs/superpowers/specs/2026-11-03-zoom-enlace-unico-por-serie-design.md#comportamiento); [plan principal, Task 7](docs/superpowers/plans/2026-11-03-zoom-enlace-unico-por-serie.md#task-7-migracion-meetzoom-por-serie); [plan de corrección, Task 3](docs/superpowers/plans/2026-11-03-corregir-series-con-enlaces-distintos.md#task-3-aplicar-la-correccion-por-serie)).

7. **Resuelto en los puntos enumerados.** La corrección especifica actualizar `EventoProveedor.cuentaProveedorId`, eliminar enlaces Zoom anteriores de descripción y ubicación, conservar reuniones viejas siete días y proveer ruta, botón y acción de limpieza ([plan de corrección, Task 3–4](docs/superpowers/plans/2026-11-03-corregir-series-con-enlaces-distintos.md#task-3-aplicar-la-correccion-por-serie)).

8. **Parcial.** Se incorporaron la regla `CERCANO` por serie, pruebas para ella, la definición de activo y la ausencia de `recurrence` en reuniones `type: 3`. Sin embargo, sigue pendiente decidir qué hacer con `agregarEncuentro` en series Meet y el tratamiento de series mixtas no está especificado completamente ([spec, Comportamiento y Supuestos por verificar](docs/superpowers/specs/2026-11-03-zoom-enlace-unico-por-serie-design.md); [plan principal, Tasks 2, 6 y 7](docs/superpowers/plans/2026-11-03-zoom-enlace-unico-por-serie.md)).

## 3. Problemas nuevos o pendientes

- **Importante — Series mixtas no tienen un flujo definido.** El plan de corrección las excluye y las remite a la migración por serie; Task 7 describe una serie compuesta por encuentros en Meet, pero no indica si también unifica los encuentros que ya están en Zoom, ni cómo cuentan sus reservas al elegir anfitrión. **Arreglo sugerido:** especificar si Task 7 acepta series mixtas y vincula todos sus encuentros a una `ReunionProveedor`, o si las deriva explícitamente a otro flujo de corrección. ([plan principal, Task 7](docs/superpowers/plans/2026-11-03-zoom-enlace-unico-por-serie.md#task-7-migracion-meetzoom-por-serie); [plan de corrección, Review Focus](docs/superpowers/plans/2026-11-03-corregir-series-con-enlaces-distintos.md#review-focus))

- **Importante — `actualizarEncuentro` y la cita histórica de Calendar.** Task 6 indica que, si existe reunión compartida, no se deja operación pendiente de Zoom, pero no expresa la condición exacta en términos de `reunionProveedorId`. Tampoco define cómo se actualiza o cancela la cita de Google Calendar que pueda quedar de una migración anterior de Meet. **Arreglo sugerido:** condicionar el comportamiento especial a evento Zoom con `reunionProveedorId` y `externalEventId`, conservar el comportamiento previo para los demás y definir el manejo de la cita histórica. ([plan principal, Task 6](docs/superpowers/plans/2026-11-03-zoom-enlace-unico-por-serie.md#task-6-agregar-reprogramar-y-cancelar-encuentros-y-series))

- **Importante — Orden de tareas y activación de la bandera.** Tasks 4–7 deben respetar `ZOOM_REUNION_COMPARTIDA`, pero la función y documentación del despliegue se implementan en Task 9. Además, el orden de despliegue no dice claramente cuándo habilitar la migración por serie ni si esta requiere la bandera encendida. **Arreglo sugerido:** definir e implementar la bandera antes de las tareas que la consumen, o establecer dependencias explícitas; aclarar la secuencia de activación de creación, migración y corrección. ([plan principal, Tasks 4, 7 y 9](docs/superpowers/plans/2026-11-03-zoom-enlace-unico-por-serie.md))

- **Menor — Bloqueos frente a cambios de excepciones Meet.** Task 7 propone un único bloqueo por serie y dice que no toma bloqueos por encuentro. No especifica cómo se coordina con operaciones existentes que toman bloqueos por instancia, como la edición de excepciones Meet. **Arreglo sugerido:** definir un orden de bloqueos compatible o documentar cómo se evita que la excepción cambie mientras se aplica la migración. ([plan principal, Task 7](docs/superpowers/plans/2026-11-03-zoom-enlace-unico-por-serie.md#task-7-migracion-meetzoom-por-serie))

- **Menor — Prueba de la regla de `CERCANO` en el plan de corrección.** El plan de corrección difiere series con encuentros en curso o dentro de 24 horas, pero la prueba de Task 2 solo menciona encuentros que comienzan dentro del margen; no menciona uno ya en curso. **Arreglo sugerido:** añadir ese caso a la prueba. ([plan de corrección, Global Constraints y Task 2](docs/superpowers/plans/2026-11-03-corregir-series-con-enlaces-distintos.md#task-2-plan-de-correccion-por-serie-dominio-puro))

## 4. No verificado

- No verifiqué el comportamiento real de Zoom, Calendar, la base de datos ni el código del repositorio; la revisión contrasta únicamente los documentos solicitados.
- No comprobé que las pruebas propuestas estén implementadas o ejecuten, ni que las firmas descritas coincidan con código existente.
- Los documentos mismos dejan pendiente verificar con documentación de Zoom y una prueba real el cuerpo exacto para reuniones `type: 3`, su vigencia y sus condiciones de uso.
