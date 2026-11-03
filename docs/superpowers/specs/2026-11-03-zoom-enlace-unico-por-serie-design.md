# Un solo enlace de Zoom por serie

## Contexto

En Meet, todos los encuentros de una serie comparten un solo enlace. En Zoom, hoy cada encuentro crea su propia reunión con su propio `join_url`, tanto al crear una serie nueva como al migrarla desde Meet. Una serie en Zoom debe volver a tener un único enlace y una única sala (cuenta anfitriona) para todos sus encuentros.

Decisiones tomadas por la persona responsable del producto:

- Una **reunión Zoom recurrente sin horario fijo** por serie, compartida por todos sus encuentros.
- La migración de Meet a Zoom pasa a ser **por serie completa**, no por encuentro.
- Mientras tanto, se **bloquea** migrar encuentros de series con varios encuentros futuros.
- Hay que **corregir las series que ya tienen enlaces distintos** (plan aparte, ver más abajo).

Este spec se apoya en `2026-11-02-zoom-primary-migration-design.md` y en `2026-11-03-zoom-reuniones-ui-design.md`.

## Estado actual del código

Verificado leyendo el código; no se probó contra datos ni contra la API de Zoom.

- `EventoProveedor` es uno por encuentro y proveedor (`@@unique([instanciaSalaId, proveedorId])`). También tiene `@@unique([proveedorId, externalEventId])`: dos filas Zoom no pueden compartir el ID externo.
- `crear-reuniones.service.ts` elige **una** cuenta anfitriona para toda la serie y valida la disponibilidad de todos los horarios, pero crea un `EventoProveedor` por encuentro y cada `PROVISIONAR` crea una reunión Zoom nueva (tipo 2, con horario).
- El worker (`provisionar-conferencias.use-case.ts`) aplica `PROVISIONAR`, `REPROGRAMAR` y `CANCELAR` con el ID externo de cada fila.
- `agregarEncuentro` crea otro evento Zoom individual. `cancelarSolicitudesAtomicas` y `eliminarReunionCompleta` marcan `CANCELAR` fila por fila.
- La migración (`migracion-zoom-aplicar.service.ts`) crea una fila Zoom y una reunión por encuentro, parchea una cita de Calendar y cambia el proveedor de ese encuentro.
- Quitar solo la restricción de unicidad **no** alcanza: el worker seguiría reprogramando y borrando la misma reunión una vez por fila.

## Objetivo

Todos los encuentros de una serie en Zoom usan el mismo `join_url`, la misma cuenta anfitriona y la misma reunión Zoom. Reprogramar o cancelar un encuentro no afecta al resto de la serie. La reunión Zoom se elimina solo cuando no queda ningún encuentro activo que la use.

## Comportamiento

1. **Modelo.** Nueva entidad `ReunionProveedor` (reunión externa compartida) con proveedor, cuenta anfitriona, ID externo único por proveedor, `joinUrl`, estado de integración y clave de serie. `EventoProveedor` gana `reunionProveedorId` opcional (nulo para Meet y para datos antiguos). La unicidad `[proveedorId, externalEventId]` de `EventoProveedor` se reemplaza por un índice no único; la unicidad pasa a la nueva entidad. `EventoProveedor` sigue guardando una copia de `externalEventId` y `joinUrl`, para que las lecturas existentes no cambien.
2. **Zoom.** Se crea una reunión **recurrente sin horario fijo** (`type: 3`). El `join_url` es único y no depende de las fechas de los encuentros; los horarios viven en Sala Virtual y en Calendar. Reprogramar un encuentro no llama a Zoom salvo que cambie el título.
3. **Aprovisionamiento.** El primer `PROVISIONAR` de una serie crea la reunión compartida bajo bloqueo y la registra. Los demás encuentros de la serie la reutilizan y copian el enlace. `REPROGRAMAR` no toca Zoom. `CANCELAR` de un encuentro desvincula ese uso; la reunión Zoom se elimina solo si no queda ningún encuentro activo (no cancelado) que la referencie. Operaciones repetidas son idempotentes.
4. **Creación de series.** Una sola cuenta anfitriona para toda la serie (ya ocurre) y una sola reunión compartida. Se conserva la validación de disponibilidad de todos los horarios, con capacidad 1.
5. **Agregar encuentro.** Si la serie ya está en Zoom, el nuevo encuentro se vincula a la reunión compartida y a la misma cuenta; si esa cuenta está ocupada en el horario nuevo, se rechaza con un mensaje claro, no se elige otra sala.
6. **Migración por serie.** La unidad es la serie: todos sus encuentros futuros en Meet a la vez.
   - Un solo anfitrión Zoom con capacidad para **todos** los horarios de la serie.
   - Una sola reunión compartida; se verifica con un GET real y se guarda su `join_url`.
   - Se parchean las citas de Calendar de **todos** los encuentros con el mismo enlace y se verifica cada una.
   - Solo cuando todas están verificadas, se cambia `proveedorActivoTipo` de todos los encuentros en una sola transacción.
   - Un fallo a mitad de Calendar no se revierte: la serie sigue en Meet activo, el paso es idempotente y se reintenta. Los avisos se envían solo tras el cambio y se deduplican por serie y destinatario.
   - Una serie con excepciones `Conservar en Google Meet` en algunos encuentros no se migra: pasa a `REVISAR` hasta que Administración marque excepción a toda la serie o quite las marcas.
7. **Lecturas.** Los paneles, correos y recordatorios siguen leyendo el enlace del evento activo del encuentro; no cambian. `iniciar-zoom` resuelve el ID desde la reunión compartida.
8. **Bloqueo provisorio (ya aplicado antes de este diseño).** Mientras la migración por serie no exista, la vista previa marca `SERIE` y la aplicación omite cualquier encuentro cuya serie tenga más de un encuentro futuro.

## Corrección de series existentes

Plan aparte (`2026-11-03-corregir-series-con-enlaces-distintos.md`), que depende del modelo de esta entrega. En resumen: detección de solo lectura, enlace canónico por serie, unificación de las reuniones Zoom en una compartida, parche de las citas de Calendar, eliminación de las reuniones sobrantes solo después de verificar, avisos sin duplicar y auditoría. Por serie, idempotente y con vista previa.

## Pruebas

- Una serie nueva en Zoom crea una sola reunión y todos sus encuentros tienen el mismo `join_url` y la misma cuenta.
- Cancelar o reprogramar un encuentro no cambia ni elimina la reunión de la serie; cancelar el último encuentro activo sí la elimina, una sola vez.
- Agregar un encuentro reutiliza la reunión y rechaza si la cuenta está ocupada en ese horario.
- Migrar una serie deja todos los encuentros con el mismo enlace y proveedor activo Zoom, o ninguno; un fallo en el parche de Calendar del tercer encuentro deja la serie en Meet y el reintento no crea una segunda reunión.
- Una serie con una excepción parcial queda en `REVISAR`.
- Los datos antiguos con `reunionProveedorId` nulo siguen funcionando como hoy.

## Fuera de alcance

- Asistencia y grabaciones de Zoom (sub-proyectos 2a y 2b, en pausa).
- Cambios de la interfaz de reuniones más allá de mostrar el estado de las series.

## Supuestos por verificar antes de implementar

- Que las reuniones recurrentes sin horario fijo (`type: 3`) de la API de Zoom sirvan para este uso: un `join_url` estable, sesiones en cualquier momento y sin vencimiento mientras se usen. Zoom elimina las reuniones recurrentes sin uso tras un plazo; hay que confirmar cuál y qué pasa con series que quedan sin encuentros durante meses.
- Que el límite "una reunión a la vez por cuenta" se aplique como hoy cuando varios encuentros comparten una misma reunión (la capacidad la sigue controlando Sala Virtual).
- Que parchear las citas de Calendar sin notificar (`sendUpdates=none`) siga siendo suficiente y los avisos por correo propios cubran a los invitados.
