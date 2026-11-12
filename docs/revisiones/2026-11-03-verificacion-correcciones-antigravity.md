<!--
Verificación de las correcciones, generada por Antigravity (agy, modo plan, sin la bandera de saltar permisos).
Fecha: 2026-11-03. Documentos revisados hacia el commit 0692ce0; algunos puntos ya fueron atendidos en commits posteriores (b7e46da y siguientes).
Texto entregado por el revisor, sin edición. No ejecutó pruebas.
-->

# Informe de Revisión Técnica Independiente (Verificación de Correcciones)

## 1. Veredicto

Los tres documentos corregidos **resuelven la mayoría de los hallazgos críticos e importantes** de las dos revisiones previas (reclamo persistido, series sin Calendar, tabla `AvisoEnlaceSerie`, definición de encuentro activo, bandera de despliegue y diferimiento de 7 días). Sin embargo, **todavía requieren ajustes puntuales antes de ejecutarse**: las correcciones introdujeron huecos de firma en `ConferenciasRepositoryPort` (Task 4), una desconexión en `CambioEnlaceCita` para limpiar reuniones antiguas de series nacidas en Zoom sin Calendar, y una dependencia invertida entre las Tasks 5 y 9.

---

## 2. Estado de cada hallazgo (1 a 8)

1. **Condición de carrera al crear la reunión compartida (`CREANDO` + token + hora, ID temprano, búsqueda de huérfanas y pruebas):** **Parcial**
   - **Citas:** [2026-11-03-zoom-enlace-unico-por-serie-design.md](file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/docs/superpowers/specs/2026-11-03-zoom-enlace-unico-por-serie-design.md#L33-L37) (Comportamiento §1 y §3) y [2026-11-03-zoom-enlace-unico-por-serie.md](file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/docs/superpowers/plans/2026-11-03-zoom-enlace-unico-por-serie.md#L52-L105) (Tasks 1, 2 y 4).
   - **Justificación:** El diseño de reclamo persistido (`PENDIENTE` → `CREANDO` con `reclamoToken` y `reclamoAt`, vencimiento a los 5 min), `registrarExternalIdTemprano`, `buscarReunionZoomPorMarcaHttp` y los tests `(a2)`–`(a4)` están bien definidos, pero a las firmas de Task 4 les falta devolver `serieClave` para construir la marca `[serie:<serieClave>]` y exponer `reunionProveedorId` al cancelar (ver Problema 1).

2. **Series creadas en Zoom sin cita de Google Calendar:** **Parcial**
   - **Citas:** [2026-11-03-zoom-enlace-unico-por-serie-design.md](file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/docs/superpowers/specs/2026-11-03-zoom-enlace-unico-por-serie-design.md#L47-L62) (Comportamiento §6 y Corrección), [2026-11-03-zoom-enlace-unico-por-serie.md](file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/docs/superpowers/plans/2026-11-03-zoom-enlace-unico-por-serie.md#L145-L148) (Task 7) y [2026-11-03-corregir-series-con-enlaces-distintos.md](file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/docs/superpowers/plans/2026-11-03-corregir-series-con-enlaces-distintos.md#L78-L99) (Tasks 2 y 3).
   - **Justificación:** Se eliminó el estado bloqueante `SIN_CALENDAR` y ambos planes permiten migrar/corregir encuentros sin cita, pero en el plan de corrección el registro de `reunionAnteriorExternalId` para la limpieza a 7 días se guardó en `CambioEnlaceCita` (que en la etapa 3 solo se crea para encuentros con cita de Calendar; ver Problema 2).

3. **Avisos sin colisión con `AvisoMigracionZoom` mediante `AvisoEnlaceSerie`:** **Resuelto**
   - **Citas:** [2026-11-03-zoom-enlace-unico-por-serie-design.md](file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/docs/superpowers/specs/2026-11-03-zoom-enlace-unico-por-serie-design.md#L33-L51) (Comportamiento §1 y §6), [2026-11-03-zoom-enlace-unico-por-serie.md](file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/docs/superpowers/plans/2026-11-03-zoom-enlace-unico-por-serie.md#L52-L148) (Tasks 1 y 7) y [2026-11-03-corregir-series-con-enlaces-distintos.md](file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/docs/superpowers/plans/2026-11-03-corregir-series-con-enlaces-distintos.md#L97-L99) (Task 3).
   - **Justificación:** `AvisoEnlaceSerie` (`@@unique([serieClave, email, tipo])` con tipos `MIGRACION_SERIE` y `CORRECCION_ENLACE`) desacopla ambos flujos de `AvisoMigracionZoom` y tiene pruebas explícitas de no colisión en ambos planes.

4. **Definición de "encuentro activo" (los encuentros pasados no impiden eliminar la reunión Zoom):** **Resuelto**
   - **Citas:** [2026-11-03-zoom-enlace-unico-por-serie-design.md](file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/docs/superpowers/specs/2026-11-03-zoom-enlace-unico-por-serie-design.md#L39-L40) (Comportamiento §3) y [2026-11-03-zoom-enlace-unico-por-serie.md](file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/docs/superpowers/plans/2026-11-03-zoom-enlace-unico-por-serie.md#L81-L86) (Task 3).
   - **Justificación:** `UsoReunionCompartida` ahora incluye `instanciaFin: Date`, `usosActivos` filtra `instanciaEstado` en `PROGRAMADA` o `EN_CURSO` con `instanciaFin > ahora`, y el Step 1 de Task 3 prueba explícitamente la cancelación del último encuentro futuro cuando existen encuentros pasados.

5. **Orden de despliegue y compatibilidad con versiones anteriores del worker (`ZOOM_REUNION_COMPARTIDA` y Task 9):** **Parcial**
   - **Citas:** [2026-11-03-zoom-enlace-unico-por-serie-design.md](file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/docs/superpowers/specs/2026-11-03-zoom-enlace-unico-por-serie-design.md#L56-L58) (Despliegue) y [2026-11-03-zoom-enlace-unico-por-serie.md](file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/docs/superpowers/plans/2026-11-03-zoom-enlace-unico-por-serie.md#L116-L176) (Tasks 5 y 9).
   - **Justificación:** La estrategia de desplegar apagado y encender `ZOOM_REUNION_COMPARTIDA` cuando ya no corren workers viejos evita que un worker antiguo procese `CANCELAR` sobre una reunión compartida, pero la función `reunionCompartidaHabilitada` se introduce recién en la Task 9 mientras que las Tasks 4 a 7 dependen de ella (ver Problema 4).

6. **Citas de Calendar a medias (`CambioEnlaceCita` y pruebas de fallo/reintento en 1.ª, 2.ª y 3.ª cita):** **Resuelto**
   - **Citas:** [2026-11-03-zoom-enlace-unico-por-serie-design.md](file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/docs/superpowers/specs/2026-11-03-zoom-enlace-unico-por-serie-design.md#L33-L51) (Comportamiento §1 y §6), [2026-11-03-zoom-enlace-unico-por-serie.md](file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/docs/superpowers/plans/2026-11-03-zoom-enlace-unico-por-serie.md#L52-L148) (Tasks 1 y 7) y [2026-11-03-corregir-series-con-enlaces-distintos.md](file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/docs/superpowers/plans/2026-11-03-corregir-series-con-enlaces-distintos.md#L97-L99) (Task 3).
   - **Justificación:** Se persiste `PENDIENTE` → `PARCHEADA` → `VERIFICADA` por encuentro y reunión en `CambioEnlaceCita` antes de cambiar `proveedorActivoTipo` o vincular la serie, con tests para fallos en la 1.ª, 2.ª y 3.ª cita en ambos planes.

7. **Plan de corrección (`cuentaProveedorId`, limpieza de enlaces Zoom en descripción, diferimiento de 7 días, ruta y botón de limpieza):** **Parcial**
   - **Citas:** [2026-11-03-corregir-series-con-enlaces-distintos.md](file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/docs/superpowers/plans/2026-11-03-corregir-series-con-enlaces-distintos.md#L94-L114) (Tasks 3 y 4).
   - **Justificación:** Actualiza `EventoProveedor.cuentaProveedorId = plan.hostId`, quita cualquier enlace Zoom previo con `prepararCambioEnlaceZoomACalendar`, difiere 7 días la eliminación y agrega `{ accion: "LIMPIAR" }` y el botón en UI, pero `CambioEnlaceCita` no modela cómo marcar una reunión antigua como ya eliminada ni cómo registrarla si el encuentro no tiene Calendar (ver Problema 2).

8. **Otros (`REPROGRAMAR` sin título en `actualizarEncuentro`; series mixtas y `agregarEncuentro`; `CERCANO` a nivel serie; orden de bloqueos; `recurrence` en `type: 3`):** **Parcial**
   - **Citas:** [2026-11-03-zoom-enlace-unico-por-serie.md](file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/docs/superpowers/plans/2026-11-03-zoom-enlace-unico-por-serie.md#L67-L148) (Tasks 2, 6 y 7) y [2026-11-03-zoom-enlace-unico-por-serie-design.md](file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/docs/superpowers/specs/2026-11-03-zoom-enlace-unico-por-serie-design.md#L48-L84) (Comportamiento §6 y Supuestos).
   - **Justificación:** Se corrigieron `REPROGRAMAR` en `actualizarEncuentro` (Task 6 no deja operación pendiente en Zoom cuando hay reunión compartida), `CERCANO` a nivel serie (Task 7) y la ausencia de `recurrence` en `type: 3` (Task 2); sin embargo, el bloqueo asesor por serie en Task 7 no se coordina con `actualizarExcepcionGoogleMeet` y falta resolver qué pasa con las series mixtas en Task 7 (ver Problemas 3 y 5).

---

## 3. Problemas nuevos o pendientes

### [Importante 1] Firmas incompletas en `ConferenciasRepositoryPort` (Task 4) para construir la marca `[serie:<serieClave>]`, cancelar y liberar reclamos de evento

- **Ubicación:** [2026-11-03-zoom-enlace-unico-por-serie.md](file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/docs/superpowers/plans/2026-11-03-zoom-enlace-unico-por-serie.md#L97-L103) (Task 4) vs [`ConferenciasRepositoryPort`](file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/src/modules/conferencias/ports/conferencias-repository.port.ts#L20-L62) y [`sincronizarEventosPendientesUseCase`](file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/src/modules/conferencias/application/provisionar-conferencias.use-case.ts#L56-L198).
- **Problema:**
  1. Task 2 exige pasar `[serie:<serieClave>]` en `agenda` al llamar a `crearReunionZoomRecurrenteHttp` y `buscarReunionZoomPorMarcaHttp`, pero en Task 4 `reclamarCreacionReunionCompartida` devuelve `{ reunionId, resultado, externalId, joinUrl }` **sin `serieClave`**, y [`EventoReclamableInfo`](file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/src/modules/conferencias/ports/conferencias-repository.port.ts#L20-L27) tampoco incluye `serieClave`.
  2. Cuando `claim.operacion === "CANCELAR"` o `"REPROGRAMAR"`, `reclamarCreacionReunionCompartida` no aplica (es para `PROVISIONAR`), pero `EventoReclamableInfo` no incluye `reunionProveedorId` ni el `estadoCreacion` de la reunión compartida; el caso de uso no tiene de dónde obtener `reunionId` para invocar `usosDeReunionCompartida(reunionId)` y `marcarReunionCompartidaEliminada(reunionId)`.
  3. En `sincronizarEventosPendientesUseCase`, `repository.reclamarEvento(id)` ya grabó `reclamoIntegracionAt` y `reclamoIntegracionToken` en `EventoProveedor` antes de entrar al `switch`. Si `reclamarCreacionReunionCompartida` devuelve `EN_CURSO_POR_OTRO` y el worker simplemente sale sin limpiar el reclamo de `EventoProveedor`, el evento no podrá reintentarse hasta que venza el TTL de `reclamoIntegracionAt`.
- **Arreglo sugerido:**
  - Agregar `reunionProveedorId: string | null` y `serieClave: string | null` a `EventoReclamableInfo` (o devolver `serieClave` en `reclamarCreacionReunionCompartida`).
  - Especificar en Task 4 un método `liberarReclamoEvento(claim: ClaimInfo): Promise<void>` (que limpie `reclamoIntegracionAt` y `reclamoIntegracionToken` manteniendo `operacionPendiente = "PROVISIONAR"`) cuando el resultado sea `EN_CURSO_POR_OTRO`, y aclarar que `marcarReunionCompartidaEliminada(reunionId)` es condicional (`estadoCreacion != "ELIMINADA"`) para que `CANCELAR` no repita `DELETE` en Zoom.

### [Importante 2] `CambioEnlaceCita` no cubre la limpieza de reuniones antiguas en series sin Calendar ni registra cuándo una reunión antigua ya fue eliminada

- **Ubicación:** [2026-11-03-zoom-enlace-unico-por-serie.md](file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/docs/superpowers/plans/2026-11-03-zoom-enlace-unico-por-serie.md#L52) (Task 1) y [2026-11-03-corregir-series-con-enlaces-distintos.md](file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/docs/superpowers/plans/2026-11-03-corregir-series-con-enlaces-distintos.md#L96-L99) (Task 3).
- **Problema:**
  1. En Task 3 del plan de corrección, la etapa (3) crea filas en `CambioEnlaceCita` _"por cada encuentro con cita"_, y la etapa (5) guarda allí `reunionAnteriorExternalId` y `eliminarDespuesDe = ahora + 7 días`. En una serie nacida directamente en Zoom **sin citas de Google Calendar**, ningún encuentro tiene cita en la etapa (3); si no se crean filas en `CambioEnlaceCita` para esos encuentros, sus reuniones Zoom antiguas (`reunionesARetirar`) no se guardan en ningún lado y nunca se eliminan tras los 7 días.
  2. `CambioEnlaceCita` define `estado String @default("PENDIENTE") /* PENDIENTE | PARCHEADA | VERIFICADA */`, `reunionAnteriorExternalId String?` y `eliminarDespuesDe DateTime?`, pero no tiene un campo `reunionAnteriorEliminadaAt DateTime?` (ni especifica poner `reunionAnteriorExternalId = null` tras borrarla). Sin eso, `limpiarReunionesAntiguas` volvería a seleccionar y llamar a Zoom `DELETE` sobre las mismas reuniones en cada ejecución posterior a los 7 días, incumpliendo el test `(g) no repite`.
- **Arreglo sugerido:**
  - En Task 3 etapas (3) y (5), crear `CambioEnlaceCita` para **todos** los encuentros de la serie: los que no tienen cita de Calendar nacen directamente con `estado = "VERIFICADA"`, `reunionAnteriorExternalId` y `eliminarDespuesDe`.
  - Agregar `reunionAnteriorEliminadaAt DateTime?` en `CambioEnlaceCita` (Task 1) —o especificar en Task 3 que `limpiarReunionesAntiguas` filtra `reunionAnteriorEliminadaAt: null` y lo setea al eliminar (o ante 404)—.

### [Importante 3] `aplicarMigracionZoomSerie` (Task 7) no define cómo tratar una serie mixta (encuentros en Meet + encuentros ya en Zoom)

- **Ubicación:** [2026-11-03-zoom-enlace-unico-por-serie.md](file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/docs/superpowers/plans/2026-11-03-zoom-enlace-unico-por-serie.md#L130-L148) (Tasks 6 y 7) y [2026-11-03-corregir-series-con-enlaces-distintos.md](file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/docs/superpowers/plans/2026-11-03-corregir-series-con-enlaces-distintos.md#L47-L64) (Task 1).
- **Problema:** Task 1 del plan de corrección excluye las series mixtas (_"(f) una serie mixta no aparece"_) y Task 6 del plan principal afirma que _"la migración por serie (Task 7) resuelve las series mixtas existentes"_. Sin embargo, Task 7 no incluye ninguna regla ni test para una serie mixta (p. ej. 2 encuentros futuros en Meet y 1 encuentro futuro ya en Zoom por migración previa o por `agregarEncuentro`): no aclara si las reservas Zoom de los encuentros ya en Zoom de la propia serie se excluyen de `reservasZoom` para no autocolisionar, ni si `aplicarMigracionZoomSerie` también vincula ese encuentro ya en Zoom a la nueva `ReunionProveedor`.
- **Arreglo sugerido:** Especificar en Task 7 (y agregar un test `(g) serie mixta`) que al planificar y aplicar la migración por serie: (1) las reservas Zoom de encuentros de la misma `serieClave` no cuentan como colisión de sala, y (2) los encuentros futuros de la serie que ya tenían `proveedorActivoTipo === "ZOOM"` también se vinculan a la `ReunionProveedor` compartida (o quedan todos en Zoom para ser tomados por el flujo de corrección).

### [Menor 4] Orden de tareas invertido entre Task 5 y Task 9 para `reunionCompartidaHabilitada`

- **Ubicación:** [2026-11-03-zoom-enlace-unico-por-serie.md](file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/docs/superpowers/plans/2026-11-03-zoom-enlace-unico-por-serie.md#L115-L176) (Tasks 5 y 9).
- **Problema:** Task 5 pide implementar y probar `crearReuniones` con la bandera `ZOOM_REUNION_COMPARTIDA` encendida y apagada, y Task 9 (línea 173) indica que _"Las Tasks 4 a 7 respetan la bandera"_, pero la función `reunionCompartidaHabilitada(env)` recién se crea en Task 9.
- **Arreglo sugerido:** Definir `reunionCompartidaHabilitada(env)` en Task 3 (o mover Task 9 antes de Task 4) y dejar al final únicamente la documentación del orden de despliegue en `docs/despliegue-ec2.md` y la verificación en Task 8/9.

### [Menor 5] Claves de bloqueo asesor distintas entre `actualizarExcepcionGoogleMeet` y `aplicarMigracionZoomSerie`, y citas de Calendar huérfanas al reprogramar/cancelar encuentros migrados

- **Ubicación:** [2026-11-03-zoom-enlace-unico-por-serie.md](file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/docs/superpowers/plans/2026-11-03-zoom-enlace-unico-por-serie.md#L129-L145) (Tasks 6 y 7) vs [`migracion-zoom.service.ts`](file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/src/modules/reuniones/migracion-zoom.service.ts#L65) y [`gestionar-encuentros.service.ts`](file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/src/modules/reuniones/gestionar-encuentros.service.ts#L219-L327).
- **Problema:**
  1. Task 7 toma _"un solo bloqueo asesor por serie (sin bloqueos por encuentro dentro de la operación)"_, pero [`actualizarExcepcionGoogleMeet`](file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/src/modules/reuniones/migracion-zoom.service.ts#L65) bloquea por `flacso-meet:migracion-zoom:${instanciaId}`. Si no usan la misma clave por `serieClave`, pueden ejecutarse a la vez.
  2. Cuando un encuentro migrado desde Meet (que conserva su cita en Google Calendar) se reprograma (`EDITAR_FECHA`) o cancela más adelante en Sala Virtual, `seleccionarEventoProveedorActivo` selecciona el evento `ZOOM` y la cita histórica de Google Calendar no se reprograma ni se cancela.
- **Arreglo sugerido:** Hacer que `actualizarExcepcionGoogleMeet` tome también el bloqueo asesor por `serieClave` (o pase a operar por serie), y anotar explícitamente en el spec si las citas históricas de Google Calendar de encuentros migrados se actualizan/cancelan al reprogramar o si queda fuera de alcance.

---

## 4. No verificado

- **Ejecución de pruebas, chequeo de tipos (`npm run check`), validaciones de Prisma y build:** No se ejecutaron comandos por restricción explícita de solo lectura.
- **Comportamiento real de la API de Zoom (`type: 3` y listado de reuniones con `agenda`):** No se realizaron llamadas externas a Zoom para confirmar si `GET /users/{userId}/meetings` devuelve siempre el campo `agenda` completo en la lista paginada que consume `buscarReunionZoomPorMarcaHttp`, ni el plazo de caducidad de reuniones `type: 3` en la cuenta institucional de FLACSO.
- **Datos en la base de producción:** No se consultó PostgreSQL para verificar cuántas series legadas sin `serieReunionId`, series mixtas o series nativas de Zoom existen actualmente.
