# Panel de estado por serie Zoom — Plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDA: usar superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para ejecutar este plan tarea por tarea. Los pasos usan casillas (`- [ ]`).

**Objetivo:** unificar migración y corrección de series Zoom en una sola pantalla que deriva el estado de la base, ofrece una acción clara por serie y explica los errores.

**Arquitectura:** una función de dominio pura (`diagnosticarSerieZoom`) clasifica cada serie y lista sus acciones; un servicio de lectura la alimenta con datos de la base; una segunda función pura traduce resultados de error a mensajes y regla de reintento; la pantalla existente (`MigracionZoomSerieControl`) las consume. Sin cambios de esquema Prisma.

**Tecnología:** Next.js 16, TypeScript, React, Prisma, Vitest (`renderToStaticMarkup` para marcado, sin dependencias nuevas).

**Spec:** `docs/superpowers/specs/2026-11-04-panel-series-zoom-design.md`

**Entrega:** tres PR, uno por fase, cada uno desde `main`: Fase 1 (Tareas 1–2), Fase 2 (Tarea 3), Fase 3 (Tareas 4–6). Sin push ni merge sin autorización.

## Restricciones globales

- No cambia la semántica de las acciones: `aplicarMigracionZoomSerie` y `corregirSerieEnlaces` siguen creando una sola reunión compartida por serie con un anfitrión.
- Sin migración de Prisma ni escritura en base desde el diagnóstico; el servicio de lectura es de solo lectura y exige Administración (`exigirAdministracion`).
- No se borra ninguna reunión Zoom ni se llama a Zoom desde el diagnóstico.
- El contrato JSON de `migracion-zoom/series/aplicar`, `series/vista-previa` y `series-enlaces` solo puede crecer, no cambiar.
- Archivos de prueba `*.test.ts` (la configuración no descubre `.tsx`). Texto de interfaz en español rioplatense con voseo; estado con texto, no solo color.
- Al editar archivos con scripts, no introducir bytes de control ni cambiar los saltos de línea: verificar con `git diff --stat` que el diff sea del tamaño esperado.
- Línea base: `npm run check` y `npx vitest run` en verde antes de empezar.

## Revisión de foco

- Serie con una reunión Zoom `CREADA` pero todos sus encuentros aún en Meet: no es «migrable» a secas; se clasifica `RETOMABLE` para reutilizarla y no crear una segunda.
- Serie mezclada con una reunión `CREANDO`: sigue siendo `MEZCLADA` y su acción `MIGRAR` completa los encuentros restantes; no ofrece `UNIFICAR_ENLACE`.
- Reunión `ELIMINADA` de la serie: no cuenta como huérfana ni como reunión existente.
- Error con texto técnico que incluye el código `22021` o «invalid byte sequence»: no se ofrece «Reintentar».
- Serie sin ningún encuentro futuro y sin reunión: `SIN_FUTUROS` con solo «Ver detalle», nunca una acción que escriba.

---

## Estructura de archivos

Crear en `src/modules/reuniones/`: `diagnostico-serie-zoom.domain.ts`, `diagnostico-serie-zoom.service.ts`, `mensajes-serie-zoom.domain.ts`.
Crear en `src/components/`: `confirmar-accion-serie-zoom.tsx` (diálogo compartido).
Modificar: `src/components/migracion-zoom-serie-control.tsx`, `src/components/corregir-serie-zoom-boton.tsx`, `src/modules/reuniones/migracion-zoom-serie.service.ts` (agrega el diagnóstico a la vista previa), `app/(gestion)/reuniones/migracion-zoom/page.tsx`.
Pruebas: `test/diagnostico-serie-zoom.test.ts`, `test/diagnostico-serie-zoom-service.test.ts`, `test/mensajes-serie-zoom.test.ts`, `test/panel-series-zoom.test.ts`.

---

### Tarea 1: diagnóstico de serie (dominio)

**Archivos:** Crear `diagnostico-serie-zoom.domain.ts`; Prueba `test/diagnostico-serie-zoom.test.ts`.

**Interfaces:**

- Consume `EncuentroEnlaceSerie` y `evaluarEnlacesDeSerie(encuentros, ahora)` de `series-enlaces-distintos.domain.ts`.
- Produce:
  - `type ClasificacionSerieZoom = "SANA" | "MIGRABLE" | "MEZCLADA" | "ENLACES_DISTINTOS" | "RETOMABLE" | "HUERFANA" | "SIN_FUTUROS"`
  - `type AccionSerieZoom = "MIGRAR" | "UNIFICAR_ENLACE" | "REANUDAR" | "VER_DETALLE"`
  - `type ReunionZoomSerie = Readonly<{ id: string; estadoCreacion: string; externalId: string | null; joinUrl: string | null; cuentaProveedorId: string | null }>`
  - `type AvisoSerie = Readonly<{ email: string; tipo: string; estado: string }>` (`ACEPTADO` = enviado, `RESERVADO` = pendiente, otro = con error)
  - `type EntradaDiagnosticoSerie = Readonly<{ serieClave: string; ahora: Date; encuentros: readonly EncuentroEnlaceSerie[]; reuniones: readonly ReunionZoomSerie[]; avisos: readonly AvisoSerie[] }>`
  - `type DiagnosticoSerieZoom = Readonly<{ serieClave: string; clasificacion: ClasificacionSerieZoom; conteos: Readonly<{ total: number; enZoom: number; enMeet: number; reunionesZoomDistintas: number; enlacesDistintos: number }>; avisos: Readonly<{ enviados: number; pendientes: number; conError: number; repetidos: number }>; acciones: readonly AccionSerieZoom[] }>`
  - `diagnosticarSerieZoom(entrada: EntradaDiagnosticoSerie): DiagnosticoSerieZoom`

Regla de clasificación, en este orden, sobre los encuentros futuros y programados (`estado === "PROGRAMADA"` e `inicio > ahora`) y las reuniones con `estadoCreacion !== "ELIMINADA"`:

1. Sin futuros: `HUERFANA` si hay reuniones activas, si no `SIN_FUTUROS`.
2. Hay encuentros en Zoom y en Meet: `MEZCLADA`.
3. Alguna reunión `PENDIENTE` o `CREANDO`, o reunión activa con todos los futuros en Meet: `RETOMABLE`.
4. Todos en Zoom: `ENLACES_DISTINTOS` si `evaluarEnlacesDeSerie(...).necesitaCorreccion`, si no `SANA`.
5. Todos en Meet sin reuniones activas: `MIGRABLE`.

Acciones: `MIGRABLE` → `[MIGRAR]`; `MEZCLADA` → `[MIGRAR, VER_DETALLE]`; `ENLACES_DISTINTOS` → `[UNIFICAR_ENLACE, VER_DETALLE]`; `RETOMABLE` → `[REANUDAR, VER_DETALLE]`; `HUERFANA`, `SANA`, `SIN_FUTUROS` → `[VER_DETALLE]`. `repetidos` cuenta los avisos que comparten correo y tipo más allá del primero.

- [ ] **Paso 1: pruebas que fallan** en `test/diagnostico-serie-zoom.test.ts`, una por clasificación con su lista exacta de acciones, más: encuentros cancelados o pasados no cuentan; reunión `ELIMINADA` ignorada; los cuatro casos de la Revisión de foco; conteos de `enZoom`, `enMeet`, `enlacesDistintos`; avisos `{ enviados, pendientes, conError, repetidos }` con un correo repetido.
- [ ] **Paso 2: ejecutar** `npx vitest run test/diagnostico-serie-zoom.test.ts`; esperado: FALLA por módulo inexistente.
- [ ] **Paso 3: implementar** el dominio como funciones puras sin acceso a base, reutilizando `evaluarEnlacesDeSerie`.
- [ ] **Paso 4: verificar** `npm run check` y la prueba; esperado: PASA.
- [ ] **Paso 5: commit** `feat: diagnóstico de serie Zoom con clasificación y acciones permitidas`.

### Tarea 2: servicio de lectura del diagnóstico

**Archivos:** Crear `diagnostico-serie-zoom.service.ts`; Prueba `test/diagnostico-serie-zoom-service.test.ts`.

**Interfaces:**

- Consume `diagnosticarSerieZoom`, `exigirAdministracion` (`migracion-zoom.service.ts`), `claveSerieReunion`, `proveedorActivoDeInstancia`.
- Produce `obtenerDiagnosticosSeriesZoom(db: PrismaClient, actor: Readonly<{ id: string; rol: string }>, ahora?: Date): Promise<ReadonlyMap<string, DiagnosticoSerieZoom>>`, con la clave de serie como llave.

- [ ] **Paso 1: pruebas que fallan** con una base simulada: rechaza a quien no es Administración (403); agrupa los encuentros por `claveSerieReunion`; una sola consulta de `reunionProveedor` (`serieClave in claves`) y una de `avisoEnlaceSerie` (`serieClave in claves`), nunca una por serie; una serie con encuentros en Meet y reunión `CREADA` resulta `RETOMABLE`; no se llama a ninguna operación de escritura.
- [ ] **Paso 2: ejecutar la prueba;** esperado: FALLA.
- [ ] **Paso 3: implementar** el servicio con el patrón de selección de `series-enlaces-distintos.service.ts`, sin escribir.
- [ ] **Paso 4: verificar** `npm run check` y las suites de migración y corrección existentes; esperado: PASAN.
- [ ] **Paso 5: commit** `feat: servicio de lectura de diagnósticos de series Zoom`. Abrir el PR de la Fase 1.

### Tarea 3: mensajes de error y regla de reintento (Fase 2)

**Archivos:** Crear `mensajes-serie-zoom.domain.ts`; Prueba `test/mensajes-serie-zoom.test.ts`.

**Interfaces:**

- Consume `ResultadoMigracionSerie` (de `migracion-zoom-serie-aplicar.service.ts`) y `ResultadoCorreccionSerie` (de `corregir-serie-enlaces.service.ts`).
- Produce `describirResultadoSerie(resultado: Readonly<{ resultado: string; etapa?: string; mensaje?: string; reintentable?: boolean }>): MensajeResultadoSerie` con `MensajeResultadoSerie = Readonly<{ titulo: string; detalle: string; accionSugerida: string; reintentable: boolean; detalleTecnico?: string }>`.

Reglas: `MIGRADA`, `CORREGIDA`, `YA_ZOOM`, `YA_UNIFICADA` y `OMITIDA` tienen mensaje propio sin `detalleTecnico`. Para `ERROR`, el mensaje depende de `etapa` (`VALIDACION`, `ZOOM`, `CALENDAR`, `CAMBIO_PROVEEDOR`, `VINCULACION`, `AVISOS`, `FINAL`). `reintentable` es `false` cuando el servicio lo marca así **o** cuando el texto contiene `22021`, `invalid byte sequence`, `clave de la serie no es válida` o `menos de 24 horas`.

- [ ] **Paso 1: pruebas que fallan:** un mensaje en español por cada resultado y etapa; el texto de Prisma con `22021` produce `reintentable: false` y `detalleTecnico` con el texto original; un error de Zoom o Calendar con `reintentable: true` conserva el reintento; ningún `titulo` ni `detalle` incluye texto técnico de Prisma.
- [ ] **Paso 2: ejecutar la prueba;** esperado: FALLA.
- [ ] **Paso 3: implementar** la función pura.
- [ ] **Paso 4: verificar** `npm run check` y la prueba.
- [ ] **Paso 5: commit** `feat: mensajes de resultado de series Zoom y regla de reintento`. Abrir el PR de la Fase 2.

### Tarea 4: filas con estado, conteos y acción principal (Fase 3)

**Archivos:** Modificar `migracion-zoom-serie.service.ts` (agrega `diagnostico: DiagnosticoSerieZoom` a cada fila de la vista previa, solo agregando el campo), `migracion-zoom-serie-control.tsx`, `app/(gestion)/reuniones/migracion-zoom/page.tsx`; Prueba `test/panel-series-zoom.test.ts`.

**Interfaces:**

- Consume `DiagnosticoSerieZoom`, `AccionSerieZoom`.
- Produce en el control: etiqueta de estado por clasificación (texto: «Sana», «Para convertir», «Mezclada Meet/Zoom», «Enlaces distintos», «A medias», «Reunión sin encuentros», «Sin encuentros futuros»), conteos («5 de 8 en Zoom · 2 enlaces distintos») y un botón principal por `acciones[0]` con el verbo de la acción («Convertir a Zoom», «Unificar enlace», «Retomar»); «Ver detalle» enlaza al detalle de la reunión.

- [ ] **Paso 1: pruebas que fallan** (`renderToStaticMarkup` sobre filas de ejemplo): cada clasificación muestra su etiqueta en texto y el botón correcto; `SANA` y `HUERFANA` no muestran botón que escriba; los conteos aparecen; ninguna fila sana muestra «Reintentar».
- [ ] **Paso 2: ejecutar la prueba;** esperado: FALLA.
- [ ] **Paso 3: implementar** el cambio en la vista previa (solo agrega el campo), la fila del control y la página. Mantener la selección por lotes solo para `MIGRAR` y el límite actual de series por lote.
- [ ] **Paso 4: verificar** `npm run check`, la prueba nueva y `test/migracion-zoom-serie-control.test.ts`; adaptar sus aserciones solo si dependían del texto de la fila anterior, sin debilitarlas.
- [ ] **Paso 5: commit** `feat: panel de series Zoom con estado, conteos y acción principal`.

### Tarea 5: diálogo de confirmación compartido y panel de resultado

**Archivos:** Crear `src/components/confirmar-accion-serie-zoom.tsx`; Modificar `migracion-zoom-serie-control.tsx` y `corregir-serie-zoom-boton.tsx`; Prueba `test/panel-series-zoom.test.ts`.

**Interfaces:**

- Produce `ConfirmarAccionSerieZoom({ accion: AccionSerieZoom; titulo: string; encuentros: number; diagnostico: DiagnosticoSerieZoom; onConfirmar: () => void; onCancelar: () => void })`, un diálogo con trampa de foco, Escape para cerrar y foco devuelto al disparador (mismo patrón que el diálogo actual de la migración). El texto dice cuántos encuentros cambian, si se crea o se reutiliza la reunión, quién recibe aviso y que el enlace anterior sigue activo 7 días cuando corresponde.
- Consume `describirResultadoSerie` para el panel de resultado: título, detalle, acción sugerida, «Reintentar» solo si `reintentable`, y el detalle técnico en un `<details>`.

- [ ] **Paso 1: pruebas que fallan:** el diálogo declara `role="dialog"`, `aria-modal`, nombre accesible y botones «Confirmar» y «Volver a revisar»; el texto de cada acción menciona los encuentros afectados; `CorregirSerieZoomBoton` ya no usa `window.confirm` (aserción sobre la fuente); el panel de resultado no muestra «Reintentar» para un error con `22021` y sí para un error de Zoom reintentable, y muestra el detalle técnico plegado.
- [ ] **Paso 2: ejecutar la prueba;** esperado: FALLA.
- [ ] **Paso 3: implementar** el diálogo y conectarlo a la migración y a la corrección; tras actuar, llamar a `router.refresh()` para recalcular el diagnóstico.
- [ ] **Paso 4: verificar** `npm run check` y `npx vitest run test/panel-series-zoom.test.ts test/migracion-zoom-serie-control.test.ts`.
- [ ] **Paso 5: commit** `feat: confirmación propia y resultado comprensible en el panel de series Zoom`.

### Tarea 6: verificación final (Fase 3)

- [ ] **Paso 1:** `npm run check`; sin errores.
- [ ] **Paso 2:** `npx vitest run`; todo en verde frente a la línea base.
- [ ] **Paso 3:** `git diff main --stat`; confirmar que no hay cambios en `prisma/` y que los diffs de los archivos editados tienen el tamaño esperado (sin ruido de saltos de línea).
- [ ] **Paso 4:** buscar bytes de control en los archivos tocados (`NUL` y caracteres menores a 0x20 salvo tab, LF y CR); esperado: ninguno.
- [ ] **Paso 5: informe:** archivos cambiados, pruebas, riesgos y lo no verificado. Capturas, teclado y lector de pantalla quedan pendientes si no hay base local o de staging. Abrir el PR de la Fase 3.
