# Nueva reunión Zoom — Entrega A, PR A1: refactor sin cambio de comportamiento

Fecha: 2026-11-04
Base: `main` (954e661)
Alcance: solo `/reuniones/nueva` (formulario Zoom). Sin cambios de backend, Prisma ni CSS.

## Objetivo

Descomponer `meeting-form-zoom.tsx` (559 líneas) en un contenedor de estado y envío más componentes presentacionales y una función pura que arma la solicitud. El resultado debe ser idéntico para quien usa la pantalla. Es la base de A2 (UI responsive y resumen) y A3 (validación y confirmación).

## Fuera de alcance de A1

- Selector «Reunión única / Serie», resumen sticky, diálogo de revisión y retiro del stepper (A2/A3).
- `useReducer`: se difiere a A2, cuando cambie la forma del estado.
- Opciones avanzadas de Zoom, capacidades de backend y endurecimiento de series (Entregas B y C).
- Cambios en CSS, esquemas Prisma, migraciones o pantallas legacy Meet.

## Invariantes que se preservan

1. `POST /api/v1/reuniones` sigue siendo el único punto de creación, con `plataforma: "ZOOM"`, sin cohosts ni invitados.
2. `Idempotency-Key` se genera una vez por intento lógico (`||=`) y no se reinicia tras un error.
3. `submittingRef` bloquea el doble envío; el botón se deshabilita con `!isReady || saving || done`.
4. Zona horaria America/Montevideo (`-03:00`), sin usar la zona del navegador.
5. `modalidad` es `"VIRTUAL"` cuando no se pide asistencia técnica.
6. Cobertura virtual: llegada 15 min antes y salida exacta; híbrida: mínimo 30 min antes y después.
7. Las filas de fechas usan `key={date.id}`; el `id` de fila nunca viaja al servidor.
8. Tras un error, el foco pasa al mensaje (`role="alert"`, `tabIndex={-1}`).
9. Mensajes de resultado: «guardada, enlace pendiente» y «creada correctamente» sin cambios.
10. Asignación directa de asistente solo si `canAssignAssistant`.

## Diseño

### Contenedor

`meeting-form-zoom.tsx` conserva `useState`/`useRef`, `submit()`, los manejadores (`cambiarModalidad`, `cambiarRequiereAsistencia`, `cambiarHoraEncuentro`, `generateRecurrence`, `setMeetingDateMode`, etc.) y el render de `MeetingCreationDialog`. Pasa estado y callbacks por props a los componentes extraídos. La firma pública (`programs`, `assistants`, `canAssignAssistant`) no cambia.

### Función pura

`nueva-reunion/solicitud-reunion.ts` exporta `construirSolicitudReunion(entrada)`, que devuelve el cuerpo JSON de la solicitud. Mueve a este archivo `localMontevideoToIso`. Recibe título, descripción, programa, asistente (ya resuelto según rol y modo), flags de asistencia y grabación, modalidad y las fechas. No toca el DOM ni `window`.

### Componentes (en `src/modules/reuniones/presentation/components/nueva-reunion/`)

| Archivo                        | Contenido                                                                           |
| ------------------------------ | ----------------------------------------------------------------------------------- |
| `form-primitives.tsx`          | `Field`, `FormSection`, `ChoicePanel`                                               |
| `academic-details.tsx`         | título, programa y docente, descripción general                                     |
| `meeting-schedule-editor.tsx`  | selector de modo de fechas, aviso de cobertura y router SINGLE / RECURRENT / MANUAL |
| `recurrence-rule-editor.tsx`   | rango, días, horas, cobertura y «Generar vista previa»                              |
| `meeting-instances-editor.tsx` | filas de fechas: edición, quitar, notas, agregar                                    |
| `meeting-options.tsx`          | monitoreo, grabación, modalidad, asignación de asistente                            |
| `meeting-summary.tsx`          | resumen del pie (cantidad, estado, monitoreo y grabación)                           |

Los helpers `updateDate`, `toggleWeekday` y la constante `WEEKDAYS` viajan con el componente que los usa. Se mantienen los mismos nombres de clase, así que no hay cambios de CSS.

## Pruebas

1. **Línea base antes de tocar código:** `npm run check` y las suites de formulario, recurrencia, creación y Zoom. Se registran las fallas previas, si las hay.
2. **Pruebas unitarias nuevas de `construirSolicitudReunion`:**
   - conversión a ISO con offset de Montevideo;
   - `modalidad: "VIRTUAL"` sin asistencia;
   - cobertura virtual fija frente a híbrida editable;
   - `asistenciaInicio`/`asistenciaFin` ausentes sin asistencia;
   - el `id` de fila y la descripción vacía no viajan;
   - `asistenteTecnicoId` solo cuando corresponde.
3. **Pruebas de componentes** con `renderToStaticMarkup` (ya usado en `meeting-schedule-times.test.tsx`), sin dependencias nuevas: marcado de los editores según modo y asistencia.
4. **`test/meeting-form-zoom-contract.test.ts`:** se adapta para leer el formulario y el directorio `nueva-reunion/` en conjunto. Las aserciones de código literal frágiles se reemplazan por comprobaciones de comportamiento donde ya exista la prueba unitaria equivalente.
5. **Capturas** antes y después a 1440, 768 y 375 px, si se puede levantar la app. Si requiere credenciales no disponibles, se informa y no se simulan.

## Entrega

- Rama `refactor/nueva-reunion-a1` desde `main`.
- Commits pequeños, uno por extracción, con `npm run check` y tests tras cada paso.
- Sin push, merge ni despliegue sin autorización.
- Informe final: archivos cambiados, pruebas ejecutadas, limitaciones y riesgos.

## Riesgos

- **Regresión silenciosa al mover JSX.** Se mitiga con cambios mecánicos, mismas clases y pruebas de marcado.
- **Pruebas por texto fuente.** Las del contrato actual fallarían por la ubicación del código; se adaptan en el mismo PR.
- **Estado compartido entre componentes.** Al seguir en el contenedor, no hay estado duplicado ni nuevo.
