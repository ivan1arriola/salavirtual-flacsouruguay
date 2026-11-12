# Nueva reunión Zoom A1 — Plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDA: usar superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para ejecutar este plan tarea por tarea. Los pasos usan casillas (`- [ ]`).

**Objetivo:** descomponer `meeting-form-zoom.tsx` en un contenedor de estado y envío, una función pura que arma la solicitud y componentes presentacionales, sin cambiar el comportamiento ni el CSS.

**Arquitectura:** el contenedor conserva todo el estado (`useState`/`useRef`), `submit()` y los manejadores. Los componentes nuevos reciben estado y callbacks por props y reutilizan los mismos nombres de clase. El cuerpo del POST sale a `construirSolicitudReunion`, una función pura con pruebas unitarias.

**Tecnología:** Next.js 16, TypeScript, React, Vitest (`renderToStaticMarkup` para pruebas de marcado, como en `test/meeting-schedule-times.test.tsx`).

**Spec:** `docs/superpowers/specs/2026-11-04-nueva-reunion-a1-refactor-design.md`

## Restricciones globales

- Cero cambios de comportamiento visible, de CSS, de Prisma y de backend.
- Mismos nombres de clase en todo el marcado movido.
- `plataforma: "ZOOM"`; sin cohosts ni invitados; sin la palabra «google» en el formulario ni en sus componentes.
- `Idempotency-Key` con `||=` y sin reinicio tras error; `submittingRef` y `disabled={!isReady || status === "saving" || status === "done"}` intactos.
- `timezone: "America/Montevideo"` con offset `-03:00`; `modalidad: "VIRTUAL"` si no hay asistencia técnica.
- `key={date.id}` en las filas; el `id` de fila no viaja al servidor.
- Archivos nuevos terminan con salto de línea.
- Tras cada tarea: `npm run check` y las pruebas indicadas en verde antes de commitear.
- Sin push, merge ni despliegue.

## Revisión de foco

- Fechas en blanco o con hora fin ≤ inicio: `localMontevideoToIso` conserva su precondición original (lanza `RangeError` con fecha u hora vacías); la validación que lo impide sigue en `submit()` (`datesReady`) y una prueba fija esa precondición.
- Hora cruzando medianoche en cobertura (p. ej. salida 00:30): `asistenciaLocalAIso` ya maneja el desfase; la función pura debe delegar sin reimplementarlo.
- Cambio de modo de fechas descarta filas: el comportamiento actual se conserva tal cual (A2 añadirá confirmación).
- Programa único preseleccionado: el valor inicial de `selectedProgramId` no cambia.
- Descripción vacía por encuentro: no se envía (`undefined`).

---

## Estructura de archivos

Crear en `src/modules/reuniones/presentation/components/nueva-reunion/`:

| Archivo                        | Responsabilidad                                                                                   |
| ------------------------------ | ------------------------------------------------------------------------------------------------- |
| `tipos.ts`                     | tipos compartidos: `Option`, `ProgramOption`, `MeetingDate`, `MeetingDateMode`, `RecurrenceState` |
| `solicitud-reunion.ts`         | `construirSolicitudReunion`, `localMontevideoToIso`                                               |
| `form-primitives.tsx`          | `Field`, `FormSection`, `ChoicePanel`                                                             |
| `academic-details.tsx`         | `AcademicDetails`                                                                                 |
| `meeting-summary.tsx`          | `MeetingSummary`                                                                                  |
| `recurrence-rule-editor.tsx`   | `RecurrenceRuleEditor`                                                                            |
| `meeting-instances-editor.tsx` | `MeetingInstancesEditor`                                                                          |
| `meeting-schedule-editor.tsx`  | `MeetingScheduleEditor` (router de modo)                                                          |
| `meeting-options.tsx`          | `MeetingOptions`                                                                                  |

Modificar: `meeting-form-zoom.tsx` y `test/meeting-form-zoom-contract.test.ts`.
Crear pruebas: `test/nueva-reunion-solicitud.test.ts`, `test/nueva-reunion-componentes.test.tsx`.

---

### Tarea 1: tipos y construcción pura de la solicitud

**Archivos:**

- Crear: `nueva-reunion/tipos.ts`, `nueva-reunion/solicitud-reunion.ts`
- Modificar: `meeting-form-zoom.tsx` (importar tipos y la función; quitar las definiciones locales y `localMontevideoToIso`)
- Prueba: `test/nueva-reunion-solicitud.test.ts`

**Interfaces:**

- Produce en `tipos.ts`: `Option = Readonly<{id: string; label: string}>`, `ProgramOption = Option & Readonly<{teacher: string}>`, `MeetingDate` (los mismos campos que hoy), `MeetingDateMode = "SINGLE" | "RECURRENT" | "MANUAL"`, `RecurrenceState` (los mismos campos que hoy).
- Produce en `solicitud-reunion.ts`:
  - `localMontevideoToIso(fecha: string, hora: string): string`
  - `type EntradaSolicitud = Readonly<{ titulo: string; descripcion?: string; docenteProgramaId: string; asistenteTecnicoId?: string; requiereAsistencia: boolean; requiereGrabacion: boolean; modalidad: "VIRTUAL" | "HIBRIDA"; fechas: readonly MeetingDate[] }>`
  - `construirSolicitudReunion(entrada: EntradaSolicitud): SolicitudReunion`, que devuelve el mismo objeto que hoy se serializa en `submit()` (`titulo`, `descripcion`, `docenteProgramaId`, `plataforma: "ZOOM"`, `asistenteTecnicoId`, `requiereAsistenciaTecnica`, `requiereGrabacion`, `modalidad`, `timezone`, `instancias`).

- [ ] **Paso 1: escribir las pruebas que fallan** en `test/nueva-reunion-solicitud.test.ts`:
  - `localMontevideoToIso("2026-11-10", "09:30")` devuelve `"2026-11-10T12:30:00.000Z"`.
  - Sin asistencia: `modalidad` es `"VIRTUAL"` aunque la entrada diga `"HIBRIDA"`; `asistenciaInicio` y `asistenciaFin` son `undefined` en cada instancia.
  - Con asistencia VIRTUAL: `asistenciaInicio` equivale a 15 min antes del inicio y `asistenciaFin` al fin exacto (comparar con `asistenciaLocalAIso` y `sugerirHorarioAsistencia`).
  - Con asistencia HIBRIDA, inicio 10:00, llegada 09:30 y salida 17:30 para un fin 17:00: usa los valores de la fila, no los calculados.
  - Las instancias no contienen la clave `id`, y `descripcion: ""` pasa a `undefined`.
  - `plataforma` es `"ZOOM"` y `timezone` es `"America/Montevideo"`.
  - `asistenteTecnicoId` se propaga solo si viene en la entrada.
- [ ] **Paso 2: ejecutar** `npx vitest run test/nueva-reunion-solicitud.test.ts`; esperado: FALLA por módulo inexistente.
- [ ] **Paso 3: implementar** `tipos.ts` y `solicitud-reunion.ts` moviendo la lógica de `submit()` sin alterarla; la función delega en `asistenciaLocalAIso` y `sugerirHorarioAsistencia`.
- [ ] **Paso 4: usar la función en `submit()`.** Mantener en el contenedor la lectura de `FormData` y la regla de rol (`canAssignAssistant && requiresAssistance && assistanceMode === "ASSIGN"`) que decide `asistenteTecnicoId`.
- [ ] **Paso 5: verificar:** `npm run check` y `npx vitest run test/nueva-reunion-solicitud.test.ts test/meeting-form-zoom-contract.test.ts`. El contrato aún pasa si se conservan las cadenas que busca; si alguna asserción de código literal falla por el movimiento, anotarlo para la Tarea 6, no tocarlo aquí.
- [ ] **Paso 6: commit** `refactor: extraer construcción pura de la solicitud de reunión Zoom`.

### Tarea 2: primitivas, datos académicos y resumen

**Archivos:**

- Crear: `nueva-reunion/form-primitives.tsx`, `academic-details.tsx`, `meeting-summary.tsx`
- Modificar: `meeting-form-zoom.tsx`
- Prueba: `test/nueva-reunion-componentes.test.tsx`

**Interfaces:**

- Produce: `Field({label, wide?, children})`, `FormSection({id, icon, number, title, detail, children})`, `ChoicePanel({title, detail, name, value, noLabel, noDetail, yesLabel, yesDetail, onChange})` (mismas firmas que hoy, exportadas).
- Produce: `AcademicDetails({programs: readonly ProgramOption[], selectedProgramId: string, onProgramChange: (id: string) => void, title: string, onTitleChange: (value: string) => void})`.
- Produce: `MeetingSummary({count: number, isReady: boolean, hasProgram: boolean, academicReady: boolean, requiresAssistance: boolean, requiresRecording: boolean})`.

- [ ] **Paso 1: pruebas que fallan** (`renderToStaticMarkup`):
  - `AcademicDetails` renderiza el input `name="titulo"` con `minLength=3`, el `select name="docenteProgramaId"` con una `option` por programa en formato «etiqueta — docente» y el `textarea name="descripcion"`.
  - `MeetingSummary` muestra «Listo para crear» si `isReady`; «Elegí un programa» sin programa; «Completá el título» con programa pero sin datos académicos; «Revisá fechas y horarios» en otro caso; «1 encuentro» frente a «2 encuentros»; y «Con monitoreo · Se graba» según los flags.
- [ ] **Paso 2: ejecutar la prueba;** esperado: FALLA.
- [ ] **Paso 3: mover** `Field`, `FormSection`, `ChoicePanel` a `form-primitives.tsx` y el marcado del paso 1 y del bloque `meeting-form-summary-v2` a los componentes nuevos, con las mismas clases y el mismo `role="status" aria-live="polite"`.
- [ ] **Paso 4: verificar** `npm run check` y `npx vitest run test/nueva-reunion-componentes.test.tsx`.
- [ ] **Paso 5: commit** `refactor: extraer primitivas, datos académicos y resumen del formulario Zoom`.

### Tarea 3: editores de fechas

**Archivos:**

- Crear: `nueva-reunion/recurrence-rule-editor.tsx`, `meeting-instances-editor.tsx`, `meeting-schedule-editor.tsx`
- Modificar: `meeting-form-zoom.tsx`
- Prueba: `test/nueva-reunion-componentes.test.tsx`

**Interfaces:**

- Produce `RecurrenceRuleEditor({recurrence: RecurrenceState, requiresAssistance: boolean, meetingMode: "VIRTUAL" | "HIBRIDA", message: string, onChange: (campo: keyof RecurrenceState, value: string | readonly number[]) => void, onTimeChange: (campo: "horaInicio" | "horaFin", value: string) => void, onGenerate: () => void})`.
- Produce `MeetingInstancesEditor({dates: readonly MeetingDate[], dateMode: MeetingDateMode, requiresAssistance: boolean, meetingMode: "VIRTUAL" | "HIBRIDA", onFieldChange: (index: number, campo: Exclude<keyof MeetingDate, "id">, value: string) => void, onTimeChange: (index: number, campo: "horaInicio" | "horaFin", value: string) => void, onRemove: (index: number) => void, onAdd: () => void})`.
- Produce `MeetingScheduleEditor` que compone ambos según `dateMode`, con el selector de modo (`fieldset.date-mode-selector`) y el aviso de cobertura. Recibe las props anteriores más `recurrenceGenerated`, `recurrenceReviewRef` y `onModeChange: (mode: MeetingDateMode) => void`.
- Helpers que viajan con el componente que los usa: `WEEKDAYS` y `toggleWeekday` al editor de recurrencia, `updateDate` queda en el contenedor.

- [ ] **Paso 1: pruebas que fallan:**
  - Modo SINGLE: una fila `date-row-single`, sin botón de quitar ni «Agregar otra fecha».
  - Modo MANUAL con 2 fechas: dos filas con numeración, dos botones «Quitar encuentro N» y el botón «Agregar otra fecha».
  - Modo RECURRENT sin generar: aparece el constructor con los 7 días y no hay filas; con `recurrenceGenerated` aparecen las filas y «Agregar encuentro a la serie».
  - Con asistencia HIBRIDA: campos «Llegada del asistente» y «Salida del asistente» editables; con VIRTUAL: bloque `is-virtual` con la llegada calculada (15 min antes) y la salida igual al fin.
  - Aviso `role="alert"` cuando la llegada es menos de 30 min antes en híbrida.
- [ ] **Paso 2: ejecutar la prueba;** esperado: FALLA.
- [ ] **Paso 3: mover** el JSX del paso 2 («Fechas») a los tres componentes, sin cambiar clases, textos ni atributos de accesibilidad; los manejadores (`cambiarHoraEncuentro`, `cambiarRecurrencia`, `generateRecurrence`, `setMeetingDateMode`, `invalidarVistaPreviaRecurrencia`) permanecen en el contenedor.
- [ ] **Paso 4: verificar** `npm run check` y `npx vitest run test/nueva-reunion-componentes.test.tsx test/recurrencia*`.
- [ ] **Paso 5: commit** `refactor: extraer editores de fechas y recurrencia del formulario Zoom`.

### Tarea 4: opciones de monitoreo y grabación

**Archivos:**

- Crear: `nueva-reunion/meeting-options.tsx`
- Modificar: `meeting-form-zoom.tsx`
- Prueba: `test/nueva-reunion-componentes.test.tsx`

**Interfaces:**

- Produce `MeetingOptions({requiresAssistance: boolean, requiresRecording: boolean, meetingMode: "VIRTUAL" | "HIBRIDA", assistanceMode: "OPEN" | "ASSIGN", canAssignAssistant: boolean, assistants: readonly Option[], onRequiresAssistanceChange: (value: boolean) => void, onRequiresRecordingChange: (value: boolean) => void, onModeChange: (mode: "VIRTUAL" | "HIBRIDA") => void, onAssistanceModeChange: (mode: "OPEN" | "ASSIGN") => void})`.

- [ ] **Paso 1: pruebas que fallan:**
  - Sin asistencia: no aparecen el selector de modalidad ni la asignación.
  - Con asistencia y `canAssignAssistant: false`: aparece «Abierta a postulaciones» y no el selector de asistente (permisos).
  - Con `canAssignAssistant`, `assistanceMode: "ASSIGN"` y 2 asistentes: `select name="asistenteTecnicoId"` con 2 opciones; con 0 asistentes la opción «Asignar ahora» está deshabilitada.
  - Los radios `requiereAsistenciaTecnica` y `requiereGrabacion` reflejan el valor.
- [ ] **Paso 2: ejecutar la prueba;** esperado: FALLA.
- [ ] **Paso 3: mover** el JSX del paso 3 («Opciones») al componente con las mismas clases.
- [ ] **Paso 4: verificar** `npm run check` y `npx vitest run test/nueva-reunion-componentes.test.tsx`.
- [ ] **Paso 5: commit** `refactor: extraer opciones de monitoreo y grabación del formulario Zoom`.

### Tarea 5: adaptar pruebas de contrato y de límites

**Archivos:**

- Modificar: `test/meeting-form-zoom-contract.test.ts`
- Revisar: `test/presentation-layer-boundaries.test.ts`, `test/reuniones-rutas-zoom.test.ts`

- [ ] **Paso 1: adaptar el contrato.** Leer `meeting-form-zoom.tsx` y todos los archivos de `nueva-reunion/` y concatenarlos en una sola cadena `fuente`. Las aserciones «no menciona Google / cohosts / invitados» y «no hay `key={index}`» se hacen sobre `fuente`. Eliminar las aserciones de código literal cuyo comportamiento ya cubren las pruebas de la Tarea 1 (`plataforma`, `modalidad` VIRTUAL, identificador de fila). Conservar sobre el contenedor: `aria-busy={status === "saving"}`, el `disabled` del botón, `submittingRef`, `Idempotency-Key`, y los dos mensajes de resultado.
- [ ] **Paso 2: ejecutar** `npx vitest run test/meeting-form-zoom-contract.test.ts test/presentation-layer-boundaries.test.ts test/reuniones-rutas-zoom.test.ts`; esperado: PASA. Si `presentation-layer-boundaries` rechaza el directorio nuevo, ajustar el import o la prueba con el mismo criterio que los demás componentes.
- [ ] **Paso 3: commit** `test: adaptar contrato del formulario Zoom a componentes extraídos`.

### Tarea 6: verificación final

- [ ] **Paso 1:** `npm run check`; esperado: sin errores.
- [ ] **Paso 2:** `npx vitest run`; esperado: todas las suites en verde (línea base previa: 243 archivos y 2502 pruebas pasaron, 3 archivos y 14 pruebas saltadas).
- [ ] **Paso 3:** `git diff main --stat` y confirmar que no hay cambios en `*.css`, `prisma/` ni backend.
- [ ] **Paso 4: capturas** antes y después a 1440, 768 y 375 px de `/reuniones/nueva`, con la skill `run`. Si la app no se puede levantar (credenciales o base de datos), documentarlo en el informe y no simular las capturas.
- [ ] **Paso 5:** informe final: archivos cambiados, pruebas ejecutadas, limitaciones y riesgos. Sin push.
