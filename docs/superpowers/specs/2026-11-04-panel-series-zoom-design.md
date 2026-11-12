# Panel de estado por serie Zoom: migración y corrección en una sola herramienta

Fecha: 2026-11-04
Base: `main` (incluye el retiro de `ZOOM_REUNION_COMPARTIDA`)
Alcance: pantalla `/reuniones/migracion-zoom`, el botón «Corregir» de la lista y el detalle de reuniones, y los servicios de migración y corrección de series.

## Problema

La migración por serie de Meet a Zoom y la corrección de series con enlaces distintos dejaron inconsistencias y no ofrecen botones claros para repararlas. Las inconsistencias observadas:

- Series mezcladas: parte de los encuentros en Zoom y parte en Meet.
- Una misma serie con varios enlaces o varias reuniones Zoom distintas.
- Reuniones Zoom duplicadas o huérfanas (sin encuentros activos que las usen).
- Avisos por correo repetidos o faltantes.
- Un estado en pantalla que no coincide con lo que hay en la base, en Calendar o en Zoom.

Causas de diseño identificadas en el código actual:

1. El resultado de una conversión (`ResultadoMigracionSerie`) vive solo en el estado del navegador: se pierde al cerrar o refrescar y puede contradecir la realidad.
2. Ante un error solo hay un botón «Reintentar». Con errores deterministas, como el NUL de la clave de serie corregido en el PR #187, reintentar falla siempre igual.
3. El error se muestra con el texto técnico de la excepción, sin decir qué quedó hecho ni qué conviene hacer.
4. Migración y corrección son dos herramientas con confirmaciones distintas: `MigracionZoomSerieControl` usa un diálogo propio y `CorregirSerieZoomBoton` usa `window.confirm`.
5. La pantalla no muestra cuántos encuentros de la serie están en Zoom y cuántos en Meet, ni cuántas reuniones Zoom distintas tiene.

## Principios

- **El estado se deriva de la base cada vez.** No se persiste un «estado de la serie»: se calcula desde encuentros, eventos, reuniones Zoom y avisos. Así un refresh siempre muestra la realidad y no cambia el esquema de Prisma.
- **Una única función de dominio decide las acciones.** La pantalla no deduce nada; muestra lo que el diagnóstico permite.
- **Las acciones existentes no cambian de semántica.** La migración por serie y la corrección siguen creando una sola reunión compartida por serie, con el mismo anfitrión. Esta entrega cambia qué se ve y cuándo se ofrece cada acción, no cómo se ejecuta.
- **Nada destructivo en esta entrega.** No se borran reuniones Zoom ni se tocan datos de producción.

## Diseño

### 1. Diagnóstico de serie (dominio, sin entrada/salida)

Archivo nuevo `src/modules/reuniones/diagnostico-serie-zoom.domain.ts` con la función pura:

```ts
diagnosticarSerieZoom(entrada: EntradaDiagnosticoSerie): DiagnosticoSerieZoom
```

Entrada (datos ya leídos de la base por un servicio de lectura):

- Encuentros futuros y programados de la serie, con su proveedor activo, enlace y `reunionProveedorId`.
- Las reuniones Zoom de la serie (`ReunionProveedor` por `serieClave`) con `estadoCreacion`, `externalId` y `joinUrl`.
- Los avisos de la serie (`AvisoEnlaceSerie`) por `estado` y `tipo`.

Salida:

- Conteos: `enZoom`, `enMeet`, `total`, `reunionesZoomDistintas`, `enlacesDistintos`.
- `clasificacion`, una de:

  | Valor               | Condición                                                                        |
  | ------------------- | -------------------------------------------------------------------------------- |
  | `SANA`              | todos los futuros en Zoom con una sola reunión y un solo enlace                  |
  | `MIGRABLE`          | todos en Meet, sin reunión Zoom de la serie                                      |
  | `MEZCLADA`          | hay encuentros en Zoom y en Meet                                                 |
  | `ENLACES_DISTINTOS` | todos en Zoom pero con más de una reunión o enlace                               |
  | `RETOMABLE`         | existe una reunión Zoom de la serie sin crear o a medias (`PENDIENTE`/`CREANDO`) |
  | `HUERFANA`          | existe una reunión Zoom de la serie sin ningún encuentro futuro que la use       |
  | `SIN_FUTUROS`       | no hay encuentros futuros programados                                            |

- `avisos`: `{ enviados, pendientes, repetidos }`, donde repetido es más de un aviso del mismo tipo para el mismo correo (no debería ocurrir por la restricción única; se informa si aparece).
- `acciones`: lista ordenada de acciones permitidas, `MIGRAR | UNIFICAR_ENLACE | REANUDAR | VER_DETALLE`, con la principal primero.

Reglas de acciones:

- `MIGRABLE` → `MIGRAR`.
- `MEZCLADA` → `MIGRAR` (completa los encuentros que siguen en Meet usando la reunión y el anfitrión ya existentes) y `VER_DETALLE`.
- `ENLACES_DISTINTOS` → `UNIFICAR_ENLACE`.
- `RETOMABLE` → `REANUDAR` (la misma operación idempotente de migración, que retoma la reunión ya reclamada).
- `HUERFANA`, `SANA`, `SIN_FUTUROS` → solo `VER_DETALLE`; la limpieza de huérfanas queda fuera de esta entrega.

### 2. Lectura

Archivo nuevo `diagnostico-serie-zoom.service.ts` con `obtenerDiagnosticosSeriesZoom(db, actor)`: solo Administración; consulta con una cantidad acotada de lecturas (encuentros, eventos, reuniones y avisos de todas las series de la pantalla) y arma las entradas del dominio. Reutiliza `claveSerieReunion` y los filtros de serie existentes. La vista previa de migración actual (`planificarMigracionZoomPorSerie`) sigue decidiendo el anfitrión y la disponibilidad; el diagnóstico decide qué acción se ofrece.

### 3. Errores comprensibles

Archivo nuevo `mensajes-serie-zoom.domain.ts`:

- `describirResultadoSerie(resultado)` devuelve `{ titulo, detalle, accionSugerida, reintentable, detalleTecnico }` a partir de `resultado` y `etapa`, con mensajes en español rioplatense.
- `reintentable` combina el valor del servicio con una lista de errores conocidos como no reintentables (por ejemplo, rechazo de la base por caracteres inválidos, validación de la clave de serie, encuentro a menos de 24 horas). Ante un error no reintentable no se muestra «Reintentar»; se muestra qué corregir o «Ver detalle».
- El texto técnico original va en un detalle plegable, no como mensaje principal.

### 4. Pantalla única

`/reuniones/migracion-zoom` pasa a ser una lista de series con:

- Etiqueta de estado (con texto, no solo color) y conteos, por ejemplo «5 de 8 en Zoom · 2 enlaces distintos».
- Un botón principal por serie según `acciones[0]` y «Ver detalle» como enlace a la reunión; los botones usan el verbo de la acción («Migrar a Zoom», «Unificar enlace», «Retomar»).
- Un diálogo de confirmación propio (con trampa de foco y Escape, como el existente) que dice qué va a pasar: cuántos encuentros cambian, si se crea o se reutiliza la reunión, quién recibe aviso y que el enlace anterior sigue activo 7 días cuando corresponde. Reemplaza a `window.confirm` en `CorregirSerieZoomBoton`, que pasa a abrir el mismo diálogo.
- Un panel de resultado tras actuar, con el mensaje de `describirResultadoSerie`, y refresco automático del diagnóstico para que la fila refleje el estado real.
- Filtros por clasificación; selección por lotes solo para `MIGRAR` (el límite actual de series por lote se conserva).

### 5. Lo que no cambia

- Las rutas `migracion-zoom/series/aplicar`, `series/vista-previa` y `series-enlaces` y su contrato JSON (se pueden agregar campos, no cambiar los existentes).
- La normalización de la clave de serie y el formato `legacy:` del PR #187.
- El modelo de datos: no hay migración de Prisma.

## Fases (un PR por fase)

1. **Diagnóstico de dominio y servicio de lectura.** TDD con pruebas para cada clasificación y regla de acciones, incluidos los casos mezclados, enlaces distintos, huérfana y retomable.
2. **Mensajes y regla de reintento.** TDD de `describirResultadoSerie`, incluido el caso del NUL como no reintentable.
3. **Panel y diálogo.** Pantalla única, botones por acción, diálogo de confirmación propio y panel de resultado; pruebas de marcado y accesibilidad (roles, foco, texto en lugar de solo color).

## Pruebas

- Dominio: una prueba por clasificación y por combinación de acciones; serie sin encuentros; avisos repetidos.
- Mensajes: cada etapa y resultado tiene mensaje y no hay `reintentable` en errores deterministas.
- Marcado: el botón principal corresponde a la clasificación; ningún botón «Reintentar» para un error no reintentable.
- Regresión: las suites de migración y corrección existentes siguen en verde.
- Verificación en navegador, que requiere una base local o de staging: capturas, teclado y lector de pantalla quedan pendientes mientras no haya una.

## Riesgos y preguntas abiertas

- **Series mezcladas con reuniones Zoom ya creadas.** `MIGRAR` sobre una serie mezclada debe reutilizar la reunión existente y su anfitrión; se verifica en la fase 1 contra `prepararBajoBloqueo` antes de ofrecer la acción. Si no lo soporta con seguridad, la acción pasa a ser solo `VER_DETALLE` hasta resolverlo.
- **Datos actuales inconsistentes.** El panel los hace visibles pero no los repara; la reparación de series ya afectadas se decide serie por serie con el panel en mano.
- **Reuniones Zoom huérfanas.** Esta entrega solo las lista. Eliminarlas requiere llamar a Zoom en producción y se diseña aparte.
- **Avisos repetidos.** La restricción única `(serieClave, email, tipo)` ya impide duplicados con la misma clave. Si aparecen duplicados, la causa más probable es un cambio de clave de serie entre intentos; el diagnóstico los informa y no los borra.
