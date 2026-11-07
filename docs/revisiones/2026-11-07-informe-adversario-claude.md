# Informe de revisión técnica adversaria: Zoom Reuniones con Horario Fijo (Type 8 / Type 2)

Leí `zoom-client.ts` y `gestionar-encuentros.service.ts`. No ejecuté nada ni probé contra la API real de Zoom. Lo que digo de Zoom sale de lo que sé de su documentación y marco como **[verificar]** lo que hay que confirmar con una cuenta de prueba.

## 1. Veredicto

**El plan no es viable tal como está. Hay que ajustarlo antes de implementar.**

El plan cumple la restricción 1: no queda ningún `type: 3`. Cumple la restricción 2 solo cuando la serie es una regla semanal limpia. Con una regla semanal, Zoom genera ocurrencias con `occurrence_id` distinto, pero con un único `meetingId` y un único `join_url`.

El problema está en el supuesto central, que dice «las fechas de la serie = lo que la regla de Zoom genera». Eso es falso en varios casos reales:

- El modo MANUAL permite fechas arbitrarias.
- Los feriados dejan huecos en la serie.
- Las ocurrencias pueden tener horarios distintos.
- `agregarEncuentro` y la reprogramación modifican la serie después de creada.

Hoy el sistema evita todos estos problemas porque `type: 3` no tiene horario en Zoom. El plan los vuelve a abrir. La reprogramación es la más grave, porque el código actual asume que no hay nada que hacer en Zoom (ver 2.2).

## 2. Hallazgos críticos e importantes

### 2.1 [CRÍTICO] Fechas irregulares, feriados u horarios distintos

La regla propuesta toma el `start_time` de la primera instancia, un solo `duration`, los `weekly_days` y `end_times = cantidad de instancias`. Eso solo es correcto si las fechas son semanales, consecutivas y con el mismo horario. Casos que fallan:

- **4 fechas no consecutivas** (por ejemplo semanas 1, 2, 4 y 5 por un feriado). `weekly_days="3"` y `end_times=4` generan las semanas 1, 2, 3 y 4. En Zoom queda una ocurrencia el día del feriado y falta la semana 5. El calendario de la cuenta anfitriona muestra fechas que no existen en Sala Virtual.
- **Fechas en días de semana distintos** (modo MANUAL). Los `weekly_days` pasan a ser la unión de los días. Con `end_times = N` Zoom genera más ocurrencias de las pedidas (varios días por semana) o un orden distinto.
- **Horarios o duraciones distintos.** Una regla solo admite un horario y una duración. Hay que editar cada ocurrencia con `PATCH ?occurrence_id=`, y el plan no tiene ese paso.
- **Cruce de medianoche o cambio de día en la zona horaria local.** Si `weekly_days` se calcula en UTC y no en zona local, el día queda mal (ver 3.2).

**Ajuste necesario**
- Definir un predicado puro `esSerieRegular(instancias, tz)`. Debe exigir la misma hora de inicio local, la misma duración, el mismo día de semana y un intervalo constante de 7 días.
- Si la serie es irregular, hay tres caminos posibles. Hay que elegir uno explícitamente:
  1. Rechazar la solicitud con un error claro.
  2. Crear la regla semanal cubriendo el rango y luego borrar las ocurrencias sobrantes (`DELETE ?occurrence_id=`) y parchar las que difieran.
  3. Usar `recurrence` mensual o por intervalo más edición de ocurrencias.
- El plan debe decir cuál elige y por qué. Con la restricción 2, el camino 2 es el único que mantiene un solo enlace con fechas irregulares.
- Test obligatorio: comparar las ocurrencias que Zoom devolvería (`GET /meetings/{id}`, campo `occurrences`) con las instancias de BD. Hoy no hay ningún chequeo así.

### 2.2 [CRÍTICO] Reprogramar y cancelar un encuentro individual deja de ser un no-op

En `gestionar-encuentros.service.ts:346-357` el código dice: «Con una reunión compartida ya creada en Zoom, el horario de este encuentro vive en Sala Virtual y en Calendar: no hay nada que reprogramar en Zoom». Con `type: 8` eso es falso. El horario vive en Zoom, y si la BD cambia y Zoom no, hay una divergencia silenciosa.

Consecuencias:
- Un encuentro reprogramado en Sala Virtual sigue mostrando el horario viejo en Zoom, en la agenda y en los recordatorios de Zoom.
- Si dos reuniones comparten sala y el horario nuevo choca con otra, Zoom no lo sabe. Con un anfitrión de capacidad 1 se rompe la garantía de «1 reunión concurrente por sala».
- Los participantes reciben invitaciones con la hora vieja.

**Ajuste necesario**
- Para reprogramar, hay que hacer `PATCH /meetings/{id}?occurrence_id={occId}`. Para cancelar, `DELETE ...?occurrence_id=`.
- Hay que persistir el `occurrence_id` por `InstanciaSala` o `EventoProveedor`. Hoy el esquema probablemente no lo tiene, así que haría falta una migración.
- El plan ignora por completo `reprogramar`, `cancelar` y `eliminarReunionCompleta` (línea 633). Debe incluir tareas y tests para esos tres flujos.
- Si el `occurrence_id` no se persistió, se puede reconstruir con `GET /meetings/{id}` y casando por `start_time`. Ese casamiento falla justamente cuando hubo una reprogramación previa.

### 2.3 [CRÍTICO] `agregarEncuentro` sobre una serie ya creada

La reunión se creó con `end_times: N`. Zoom no tiene un endpoint que añada una ocurrencia arbitraria. Las opciones son:

- **Editar la recurrencia** (`PATCH /meetings/{id}` con `end_times: N+1` o una fecha). Esto solo sirve si la nueva fecha es exactamente la siguiente de la regla. En cualquier otro caso crea una ocurrencia distinta de la deseada.
- **Dejar la serie sin tocar.** Entonces hay un encuentro en Sala Virtual sin ocurrencia en Zoom. El enlace compartido funciona, pero el calendario de la anfitriona no lo refleja y no hay control de concurrencia.
- **Crear una reunión nueva con otro enlace.** Esto viola la restricción 2.

Hoy el plan no dice qué hacer. La línea 187 del servicio propaga `reunionProveedorId` al nuevo evento sin tocar Zoom, lo que causa justo la divergencia anterior.

**Ajuste necesario**
- Definir una política explícita. Recomiendo: si la nueva fecha encaja en la regla, extender la recurrencia (`PATCH end_times`). Si no encaja, o bien rechazar con mensaje claro, o bien extender y borrar la ocurrencia intermedia no deseada.
- Aclarar que un `PATCH` de la recurrencia **regenera las ocurrencias** y puede perder las ediciones individuales hechas con `occurrence_id` **[verificar]**. El orden de operaciones importa: primero extender y después parchar.
- Si la reunión se creó antes de agregar y el reclamo estaba en vuelo, hay una carrera (ver 2.5).

### 2.4 [IMPORTANTE] Límite de ocurrencias

Zoom limita las series a 50 ocurrencias para diarias, semanales o mensuales (60 en algunas cuentas) **[verificar el límite exacto del plan contratado]**. El plan no valida nada.

- Una serie de más de 50 encuentros hace fallar la creación con un error de Zoom (400), y la solicitud queda en estado de error en el worker, probablemente con reintentos infinitos.
- Un cursado anual con una clase semanal por 52 semanas ya lo supera.
- `end_times` mayor que el máximo no es un error silencioso: Zoom rechaza la solicitud.

**Ajuste necesario**
- Validar `N <= LIMITE` en el dominio (`calcularRecurrenciaZoom`) y fallar de forma determinista, no con un error de Zoom.
- Decidir qué hacer con series largas:
  - Partirlas en varias reuniones Zoom. Esto rompe la restricción 2 («un solo enlace»).
  - Rechazarlas.
  - Limitar `end_times` y extender con otro `PATCH` cuando se acerque el final.
- Hay que consultar al usuario cuál prefiere, porque choca con su regla.

### 2.5 [IMPORTANTE] Concurrencia entre workers

`reclamarCreacionReunionCompartida` ya existe para que un solo worker cree la reunión. Con `type: 8` cambian tres cosas:

- **La ventana de creación es más grande.** Consulta de instancias, cálculo de regla y llamada a Zoom: si el worker muere después de crear en Zoom y antes de guardar el ID, hay una reunión huérfana. La recuperación por marca existe (`buscarReunionZoomPorMarcaHttp`), pero depende de 2.7.
- **La consulta de horarios dentro del reclamo puede leer datos obsoletos.** Si un `agregarEncuentro` o una reprogramación ocurre entre el reclamo y la creación, la regla se calcula con una lista desactualizada y nadie lo reconcilia. Hace falta una versión o un hash de las instancias usadas, y una reconciliación posterior.
- **Dos workers sobre la misma serie.** Uno crea la reunión y otro intenta parchar una ocurrencia antes de que se guarde el `meetingId`. Los parches deben esperar o quedar pendientes mientras el reclamo está activo.

**Ajuste necesario:** guardar en el reclamo la huella de las instancias usadas, y encolar `REPROGRAMAR` o `CANCELAR` contra la reunión una vez creada, no antes.

### 2.6 [IMPORTANTE] Task 5: `corregir-serie-enlaces.service.ts` y la migración de reuniones `type: 3` existentes

El plan solo habla de «pasar los datos de recurrencia de los encuentros futuros». Pero ya existen reuniones `type: 3` en producción, y **Zoom no permite cambiar el tipo de una reunión existente de 3 a 8** **[verificar]**.

- Migrar implica crear una reunión nueva, y eso **cambia el `join_url`** que las personas ya recibieron.
- Esto choca con la restricción 2 en su espíritu (un enlace estable por serie), y rompe invitaciones ya enviadas.
- El plan debe decidir si migra, si deja las series existentes como están (pero `type: 3` está prohibido) o si las recrea comunicándolo.
- Recordar que las series pasadas parcialmente solo tienen encuentros futuros; las pasadas ya no tienen sentido en Zoom, y la regla debe calcularse solo con las futuras.

### 2.7 [IMPORTANTE] Búsqueda de huérfanas: `type=scheduled` frente a `type=upcoming`

- `buscarReunionZoomPorMarcaHttp` usa `type=scheduled`. Según la documentación de Zoom, `scheduled` incluye reuniones vigentes (no vencidas), en vivo y programadas, y las recurrentes con horario fijo aparecen **una sola vez**, como una reunión. El plan lo afirma sin comprobarlo **[verificar con prueba real]**.
- **Riesgo de expiración:** una serie `type: 8` cuya última ocurrencia ya pasó deja de aparecer en `scheduled` o `upcoming` tras cierto tiempo. Una huérfana vieja no se recupera. Es un problema menor si el reclamo se retoma pronto.
- `type=upcoming` excluye las reuniones ya iniciadas. Una huérfana de una serie que ya empezó se encuentra con `scheduled` pero no con `upcoming`. **Mantener `scheduled` es correcto.**
- `page_size=300` y la recursión por `next_page_token` funcionan, pero una cuenta con muchas reuniones recorre muchas páginas. Es un problema de costo, no de corrección.
- Zoom puede truncar o reescribir la `agenda`. Si el campo se trunca (el límite es de 2000 caracteres), la marca `[serie:<clave>]` debe ir **al principio** de la agenda, no al final.

### 2.8 [IMPORTANTE] Capacidad por sala y choque de horarios

La garantía «1 reunión concurrente por sala» ahora depende de que Zoom conozca los horarios reales. Con `type: 3` Zoom no veía conflictos. Con `type: 8` y fechas irregulares, la ocurrencia fantasma de 2.1 ocupa una sala en un día que Sala Virtual cree libre. Y la ocurrencia que falta puede dejar dos reuniones solapadas sin aviso.

## 3. Hallazgos menores o de borde

### 3.1 Tipos y contrato
- `weekly_days` debe ser **string** (`"1,3"`), no array. El plan lo dice bien en Task 1, pero el dominio debe devolver un tipo ya serializado y ordenado, sin duplicados.
- `end_times` es **number** y debe ser >= 1. Con `N = 1` hay que usar `type: 2`, como dice el plan. Con `N = 2` sigue siendo una serie válida.
- `recurrence.type: 2` es semanal. Con `repeat_interval: 1` es cada semana. Si las fechas están espaciadas de a dos semanas, el plan genera la regla equivocada. El predicado de 2.1 debe detectarlo.

### 3.2 Zona horaria y días de la semana
- Zoom usa `1=Domingo ... 7=Sábado`. JavaScript usa `getDay()` con `0=Domingo ... 6=Sábado`. Es un error de uno clásico; hay que tener un test explícito para cada día.
- El día de la semana debe calcularse en la **zona horaria de la solicitud** (por ejemplo `America/Montevideo`), no en UTC. Una clase de martes 22:00 local puede ser miércoles 01:00 UTC.
- `start_time` debe enviarse en formato local **sin `Z`** junto con `timezone`, o en UTC con `Z` y `timezone`. Mezclarlos desplaza la hora. Hay que fijar un solo formato y probarlo.
- Los cambios de horario de verano son raros en Uruguay hoy, pero la lógica debe usar la zona IANA y no un offset fijo.

### 3.3 Otros
- `duration` en Zoom son **minutos enteros**. Redondear y no truncar.
- `crearReunionZoomHttp` (`type: 2`) con `start_time` en el pasado: hay que decidir qué pasa con un encuentro único que ya comenzó.
- Los tests existentes (`integrations-zoom-recurrente.test.ts`, `conferencias-reunion-compartida*.test.ts`) afirman `type: 3` y deben actualizarse. El plan lo cubre solo de forma genérica en Task 6; conviene listarlos.
- El comentario de `zoom-client.ts:200` («recurrente sin horario fijo») queda obsoleto y puede inducir a error.
- Task 6 solo menciona vitest y tsc. Faltan una prueba de integración contra Zoom (sandbox o mock con las respuestas reales de `occurrences`) y pruebas de las rutas de reprogramación y cancelación.

## 4. Puntos verificados y correctos

- Eliminar `type: 3` y usar `type: 8` con `recurrence` semanal cumple la restricción 1 y mantiene un solo `meetingId` y un solo `join_url` por serie, por lo que la restricción 2 se cumple en el caso regular.
- Tratar el encuentro único con `type: 2` y sin `ReunionProveedor` compartida simplifica el modelo y es coherente con Zoom.
- Poner el cálculo de la recurrencia en una función pura de dominio (`calcularRecurrenciaZoom`) es buena decisión: se prueba sin red.
- Pasar los horarios desde `reclamarCreacionReunionCompartida` evita una segunda consulta a la BD fuera de la transacción de reclamo.
- Mantener `type=scheduled` en la búsqueda por marca es correcto frente a `upcoming`, por lo dicho en 2.7.
- El cliente ya tiene `actualizarReunionZoomHttp`, `eliminarReunionZoomHttp` y `obtenerReunionZoomHttp`, así que la base para trabajar con ocurrencias existe. Faltan los parámetros `occurrence_id`.

## Prioridad sugerida antes de implementar

1. Decidir la política para series irregulares (2.1) y para agregar encuentros (2.3).
2. Definir el manejo de reprogramación y cancelación por ocurrencia, y la migración de esquema para `occurrence_id` (2.2).
3. Resolver con el usuario el límite de 50 ocurrencias, porque choca con la regla de un solo enlace (2.4).
4. Decidir qué hacer con las reuniones `type: 3` ya existentes (2.6).
5. Probar contra Zoom real el listado con `type=scheduled` y la forma del campo `occurrences` (2.7).
