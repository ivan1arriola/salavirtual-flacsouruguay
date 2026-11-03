<!--
Informe de revisión generado por Codex (codex exec, sandbox de solo lectura).
Fecha: 2026-11-03. Alcance: bloqueo de migración de series (commit 1ed8ddc) y diseño/planes de enlace único por serie (commit 5b1dc65).
Texto entregado por el revisor, sin edición. El revisor no ejecutó pruebas ni build.
-->

# Informe de revisión técnica

## 1. Veredicto

El bloqueo está bien ubicado en la vista previa y en el servicio de aplicación: el piloto y el lote pasan por la misma validación, que vuelve a contar los encuentros bajo bloqueo antes de iniciar la migración. Lo considero **correcto para el alcance actual**, con una salvedad: no evita que se agregue concurrentemente otro encuentro a la serie después del recuento.

El diseño y los planes **requieren cambios antes de ejecutarse**. En particular, hay que definir la concurrencia al crear y aprovisionar reuniones compartidas, completar el tratamiento de datos heredados y hacer explícitos los riesgos de notificaciones, grabaciones y enlaces de anfitrión.

## 2. Hallazgos

### A. Código del bloqueo

#### Importante — La clave de serie heredada depende de campos que pueden no identificar una serie de forma segura

**Referencias:** [serie-reunion.domain.ts:1](</C:/Users/Iván/repositorios/FLACSO Uruguay/salavirtual-flacsouruguay/src/modules/reuniones/serie-reunion.domain.ts:1>), [migracion-zoom.service.ts:183](</C:/Users/Iván/repositorios/FLACSO Uruguay/salavirtual-flacsouruguay/src/modules/reuniones/migracion-zoom.service.ts:183>), [migracion-zoom-aplicar.service.ts:191](</C:/Users/Iván/repositorios/FLACSO Uruguay/salavirtual-flacsouruguay/src/modules/reuniones/migracion-zoom-aplicar.service.ts:191>)

Para solicitudes sin `serieReunionId`, la vista previa agrupa por `docenteProgramaId`, título y `createdAt`; la aplicación reconstruye el filtro con esos mismos campos. Eso hace coherentes ambos criterios, pero no demuestra que solicitudes heredadas con esos valores deban ser la misma serie. Un cambio menor en el título o diferencias en fechas de creación separa encuentros de una serie lógica; valores idénticos pueden agrupar solicitudes independientes.

**Escenario:** la vista previa muestra migrable un encuentro de una serie legada porque otro encuentro queda en una solicitud con título o `createdAt` diferente. Aplicado ese encuentro, el enlace de Zoom diverge del resto.

**Arreglo sugerido:** establecer una regla explícita para identificar series heredadas, validarla con datos reales y probar tanto colisiones como separaciones. En el diseño de corrección de datos, “docente-programa, título y fecha” aparece como supuesto de agrupación, no como identidad garantizada. [serie-reunion.domain.ts:8](</C:/Users/Iván/repositorios/FLACSO Uruguay/salavirtual-flacsouruguay/src/modules/reuniones/serie-reunion.domain.ts:8>)

#### Importante — La cuenta de encuentros es correcta en ambos flujos, pero las pruebas no verifican todos los estados pedidos

**Referencias:** [migracion-zoom.service.ts:98](</C:/Users/Iván/repositorios/FLACSO Uruguay/salavirtual-flacsouruguay/src/modules/reuniones/migracion-zoom.service.ts:98>), [migracion-zoom-aplicar.service.ts:192](</C:/Users/Iván/repositorios/FLACSO Uruguay/salavirtual-flacsouruguay/src/modules/reuniones/migracion-zoom-aplicar.service.ts:192>), [migracion-zoom-preview.domain.ts:68](</C:/Users/Iván/repositorios/FLACSO Uruguay/salavirtual-flacsouruguay/src/modules/reuniones/migracion-zoom-preview.domain.ts:68>)

La vista previa cuenta instancias `PROGRAMADA` cuyo inicio es posterior a `ahora`; la aplicación usa el mismo criterio y filtro de serie. Los cancelados, pasados y encuentros en curso quedan excluidos. El orden de reglas conserva `NO_FUTURO`, `YA_ZOOM` y `EXCEPCION` antes de `SERIE`, seguido de `CERCANO` y `REVISAR`.

Sin embargo, las nuevas pruebas no muestran casos de encuentro cancelado, en curso, Zoom activo dentro de una serie, mezcla de proveedores ni la clave de serie heredada. La prueba de solicitudes distintas de la misma serie cubre el caso con `serieReunionId` común, no los legados.

**Arreglo sugerido:** agregar pruebas de comportamiento del servicio y del aplicador para esos casos, incluidos registros legados agrupados y separados según la regla acordada.

#### Menor — Una prueba de UI comprueba texto fuente, no comportamiento de selección

**Referencia:** [migracion-zoom-serie-ui.test.ts:1](</C:/Users/Iván/repositorios/FLACSO Uruguay/salavirtual-flacsouruguay/test/migracion-zoom-serie-ui.test.ts:1>)

La prueba lee el TSX como texto y busca etiquetas y fragmentos. Eso puede pasar aunque la interacción, el filtro o la selección estén rotos. Las pruebas de dominio y servicio sí comprueban que el estado `SERIE` se genera y que el aplicador omite el caso.

**Arreglo sugerido:** probar la interacción renderizada o extraer una función de selección/filtro y probar sus resultados.

### B. Diseño y planes

#### Crítico — El plan declara idempotencia y bloqueo, pero no especifica una garantía contra dos creaciones simultáneas

**Referencias:** [plan, Task 1 y modelo](</C:/Users/Iván/repositorios/FLACSO Uruguay/salavirtual-flacsouruguay/docs/superpowers/plans/2026-11-03-zoom-enlace-unico-por-serie.md:43>), [plan, Task 4](</C:/Users/Iván/repositorios/FLACSO Uruguay/salavirtual-flacsouruguay/docs/superpowers/plans/2026-11-03-zoom-enlace-unico-por-serie.md:91>), [schema: EventoProveedor](</C:/Users/Iván/repositorios/FLACSO Uruguay/salavirtual-flacsouruguay/prisma/schema.prisma:345>)

El plan propone `@@unique([proveedorId, serieClave])`, pero no define cómo se crea o reclama atómicamente la reunión compartida antes de llamar a Zoom. Dos workers pueden observar que no existe, crear dos reuniones Zoom y competir por registrar una. La unicidad de base evita persistir dos filas, pero no deshace la segunda reunión externa. Los tests propuestos para Task 4 prueban dos eventos de forma secuencial, no dos workers concurrentes.

**Escenario:** llegan dos operaciones `PROVISIONAR` de la misma serie a la vez; ambas hacen POST a Zoom y los encuentros terminan con IDs o enlaces distintos, o una reunión queda huérfana.

**Arreglo sugerido:** definir una operación de claim/idempotencia persistida bajo bloqueo por serie, con recuperación de fallos entre el POST externo y la persistencia; incluir una prueba concurrente que simule dos claims y una sola creación externa. El bloqueo por instancia usado en la migración actual no equivale a un bloqueo por serie. [migracion-zoom-aplicar.service.ts:69](</C:/Users/Iván/repositorios/FLACSO Uruguay/salavirtual-flacsouruguay/src/modules/reuniones/migracion-zoom-aplicar.service.ts:69>)

#### Importante — La relajación de unicidad de `EventoProveedor` deja huecos de integridad durante la transición

**Referencias:** [schema: EventoProveedor](</C:/Users/Iván/repositorios/FLACSO Uruguay/salavirtual-flacsouruguay/prisma/schema.prisma:345>), [plan, Task 1](</C:/Users/Iván/repositorios/FLACSO Uruguay/salavirtual-flacsouruguay/docs/superpowers/plans/2026-11-03-zoom-enlace-unico-por-serie.md:43>)

Hoy el esquema impide compartir `externalEventId` entre filas de `EventoProveedor` mediante `@@unique([proveedorId, externalEventId])`; mantiene además unicidad por instancia y proveedor. El plan reemplaza la primera restricción por un índice no único y traslada la unicidad a `ReunionProveedor`, pero conserva copias del ID externo en los eventos. No especifica cómo migrar esas copias, cómo garantizar que correspondan a la entidad compartida, ni cómo desplegar el cambio junto con versiones anteriores del worker que aún eliminan o reprograman por evento.

**Escenario:** durante un despliegue mixto, una versión antigua procesa `CANCELAR` para uno de los eventos y elimina la reunión que los demás siguen usando.

**Arreglo sugerido:** diseñar el orden de rollout compatible entre versiones, el backfill/vinculación de filas existentes y las restricciones que impiden vínculos a proveedor/cuenta incompatibles. Incluir prueba de worker antiguo/nuevo o una estrategia de despliegue que impida esa coexistencia.

#### Importante — El tratamiento de fallos de Calendar puede dejar las citas parcialmente cambiadas

**Referencias:** [plan de migración, Task 7](</C:/Users/Iván/repositorios/FLACSO Uruguay/salavirtual-flacsouruguay/docs/superpowers/plans/2026-11-03-zoom-enlace-unico-por-serie.md:132>), [plan de corrección, Task 3](</C:/Users/Iván/repositorios/FLACSO Uruguay/salavirtual-flacsouruguay/docs/superpowers/plans/2026-11-03-corregir-series-con-enlaces-distintos.md:75>)

El plan de migración hace bien en posponer el cambio de proveedor hasta verificar todas las citas, y el de corrección pospone la eliminación de reuniones antiguas hasta el parcheo. Pero ambos admiten que el parcheo de una cita intermedia falle después de que otras ya fueron modificadas. No se describe una restauración compensatoria ni un estado persistido que permita identificar y reparar cada cita pendiente; la reanudación debe además evitar duplicar avisos.

**Escenario:** se actualizan dos citas de tres; la tercera falla y el proceso no registra de forma durable cuáles ya cambiaron. La serie queda con enlaces distintos en Calendar hasta un reintento exitoso.

**Arreglo sugerido:** persistir estado por etapa y por cita, consultar antes de reintentar, y definir explícitamente compensación o reparación manual. Probar fallo/reintento en cada posición, no solo la tercera.

#### Importante — Las suposiciones de Zoom son explícitamente riesgosas y todavía no verificadas

**Referencias:** [spec, supuestos pendientes](</C:/Users/Iván/repositorios/FLACSO Uruguay/salavirtual-flacsouruguay/docs/superpowers/specs/2026-11-03-zoom-enlace-unico-por-serie-design.md:68>), [zoom-client.ts:47](</C:/Users/Iván/repositorios/FLACSO Uruguay/salavirtual-flacsouruguay/src/integrations/zoom/zoom-client.ts:47>), [plan, Task 2](</C:/Users/Iván/repositorios/FLACSO Uruguay/salavirtual-flacsouruguay/docs/superpowers/plans/2026-11-03-zoom-enlace-unico-por-serie.md:57>)

El cliente actual crea reuniones tipo 2 (`type: 2`) con horario; el código leído no verifica reuniones recurrentes sin horario, estabilidad de `join_url`, vencimiento por inactividad, ni el efecto sobre cuentas con capacidad 1. El propio spec deja esas afirmaciones como preguntas pendientes. No es seguro asumir que el nuevo modelo cumple el requisito del producto sin confirmar esos puntos con documentación oficial y una prueba controlada en Zoom.

**Arreglo sugerido:** resolver estas preguntas antes de implementar el cliente y registrar límites, comportamiento de sesiones, grabaciones y política de inactividad.

#### Importante — El plan de corrección puede invalidar enlaces usados en invitaciones y otros registros

**Referencias:** [plan de corrección, decisión B](</C:/Users/Iván/repositorios/FLACSO Uruguay/salavirtual-flacsouruguay/docs/superpowers/plans/2026-11-03-corregir-series-con-enlaces-distintos.md:16>), [plan, Task 3](</C:/Users/Iván/repositorios/FLACSO Uruguay/salavirtual-flacsouruguay/docs/superpowers/plans/2026-11-03-corregir-series-con-enlaces-distintos.md:75>), [schema: EventoProveedor](</C:/Users/Iván/repositorios/FLACSO Uruguay/salavirtual-flacsouruguay/prisma/schema.prisma:350>)

La opción B cambia el enlace en todas las citas y recién después elimina las reuniones anteriores, lo que es un orden prudente para Calendar. No garantiza actualizar otros lugares desde los que se distribuyeron los enlaces: correos previos, recordatorios ya enviados, asistencia, grabaciones ni `start_url`. El plan prohíbe exponer `start_url`, pero no establece cómo se obtiene para una reunión compartida ni cómo se trata un `start_url` previamente asociado a una reunión eliminada.

**Escenario:** una persona abre el enlace viejo desde un correo anterior tras eliminarse esa reunión y no puede entrar; o una operación de inicio de anfitrión usa el ID por evento que ahora quedó compartido o desactualizado.

**Arreglo sugerido:** inventariar y tratar explícitamente esos puntos en diseño y rollout; definir un período de convivencia o aviso de cambio de enlace, y especificar cómo se obtiene el `start_url` fresco para la reunión compartida.

#### Menor — Las pruebas propuestas no cubren algunos requisitos que los planes consideran críticos

**Referencias:** [plan principal, Task 8](</C:/Users/Iván/repositorios/FLACSO Uruguay/salavirtual-flacsouruguay/docs/superpowers/plans/2026-11-03-zoom-enlace-unico-por-serie.md:143>), [plan de corrección, Task 4](</C:/Users/Iván/repositorios/FLACSO Uruguay/salavirtual-flacsouruguay/docs/superpowers/plans/2026-11-03-corregir-series-con-enlaces-distintos.md:98>)

Hay pruebas manuales previstas para Zoom y Calendar, pero aún no realizadas. También falta en el plan principal una comprobación explícita de migración/backfill de reuniones actuales y de notificaciones ya enviadas. Los documentos mantienen tareas sin marcar, así que no son evidencia de ejecución.

**Arreglo sugerido:** completar criterios verificables para datos históricos, recordatorios y rollback antes de ejecutar las tareas.

## 3. Verificado y correcto

- La vista previa filtra `PROGRAMADA` y `inicioProgramadoAt > ahora`; la aplicación revalida ese mismo criterio dentro de transacción.
- Los dos flujos usan `claveSerieReunion`/`construirFiltroSerieSolicitud` para identificar encuentros relacionados; al aplicar, el recuento incluye el encuentro actual.
- El orden de clasificación conserva `NO_FUTURO`, `YA_ZOOM` y `EXCEPCION` antes de `SERIE`; luego siguen `CERCANO` y `REVISAR`.
- El aplicador devuelve omisión de validación para `SERIE` antes de sincronizar Zoom o actualizar Calendar. El modo piloto y el lote llegan a `aplicarMigracionZoom`.
- Los documentos reconocen que las API de Zoom y la operación real aún no se verificaron.

## 4. No verificado

- **No ejecuté tests, TypeScript, build ni validación Prisma.** No se autorizaron comandos de verificación y la revisión solicitada fue solo lectura.
- **No comprobé el comportamiento real de Zoom o Google Calendar**, ni datos de producción. No hice consultas externas.
- **No revisé en detalle todas las rutas HTTP** de migración ni la integridad de todos los tests existentes.
- No encontré `node_modules/next/dist/docs/` en las lecturas realizadas; el bloqueo revisado no introduce cambios de API de Next.js.

## 5. Recomendaciones

1. Antes de implementar, cerrar los supuestos de Zoom y diseñar el claim idempotente por serie frente a concurrencia.
2. Definir identidad de series heredadas y validar esa regla con datos reales anonimizados.
3. Añadir plan de rollout/backfill compatible con versiones anteriores y pruebas de carrera, recuperación y cancelación.
4. Persistir y reanudar el parcheo por cita de Calendar, y documentar cómo se resuelven los enlaces antiguos en correos y recordatorios.
5. Ampliar las pruebas del bloqueo para estados de borde y cambiar la prueba de UI basada en texto por una prueba de comportamiento renderizado.