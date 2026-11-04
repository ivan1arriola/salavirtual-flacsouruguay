# Nueva reunión A2 — UI responsive y resumen

## Intención y alcance

Simplificar `/reuniones/nueva` con el orden tipo → datos académicos → fechas → organización → resumen. Se conserva el contenedor de A1, el POST único construido por `construirSolicitudReunion`, la idempotencia, los permisos, las validaciones y `MeetingCreationDialog`. No se modifican backend, Prisma, dependencias ni pantallas legacy. A3 (revisión previa y nuevos errores por campo) queda fuera.

## Diseño y decisiones

- Dos tarjetas radio nativas, agrupadas con `fieldset` y `legend`: «Reunión única» y «Serie de encuentros». La serie ofrece repetición semanal o fechas específicas. Se elige un aviso en línea con Confirmar/Cancelar frente a un modal: mantiene el contexto y permite conservar todo el estado al cancelar. El aviso recibe foco y devuelve el foco al selector al resolverse. También protege los cambios entre modos de serie si hay datos.
- Única mantiene exactamente una fila. Al confirmar el cambio desde una serie conserva el primer encuentro cronológico. Entrar a repetición semanal requiere generar fechas nuevamente; entrar a manual conserva las filas. No se asignan horarios por defecto.
- Programa y docente preceden al título; la descripción general queda en un `details` cerrado. Se retiran el stepper y los rótulos «Paso N».
- Las filas conservan sus ids, se presentan cronológicamente (vacías al final), admiten duplicar con un id nuevo y quitar, y muestran contador y advertencia informativa de solapamientos. Dos encuentros contiguos no se solapan. Se mantiene el límite de 100.
- Editar cualquier campo de la regla semanal invalida la vista previa y vacía las fechas: nunca se envían fechas obsoletas. La regla usa `generarFechasRecurrentes` existente.
- El resumen se deriva de las props: tipo, programa/docente, cantidad, primera/última fecha y horario en español con zona explícita `America/Montevideo`, grabación, monitoreo, cobertura y asignación solo para Administración. Para híbrida se listan las llegadas/salidas por encuentro; para virtual se indica el margen fijo de 15 minutos y fin exacto. Se informa «Un solo enlace de Zoom para todos los encuentros», sin mostrar identificadores ni URLs.
- Solo un estado breve de cantidad y preparación usa `aria-live="polite"`; el resto se consulta sin anunciar cada tecla. El resumen es plegable en móvil/tablet y visible en desktop.
- CSS Module local con tokens existentes (`--surface`, `--surface-soft`, `--text`, `--text-secondary`, `--line`, `--brand`, `--focus-ring-color`). Desktop desde 1100 px: dos columnas 2:1, resumen sticky. Por debajo: una columna; móvil: acción inferior sticky en el flujo, reserva de espacio y safe-area. La acción se ubica 74 px más safe-area por encima del borde inferior para respetar la navegación móvil existente (54 px de contenido, 12 px de márgenes y borde). Controles de al menos 44 px, foco visible, anchos mínimos en cero y texto ajustable.

## Alternativas y compatibilidad

Se descarta conservar tres tarjetas equivalentes de fechas porque oculta la distinción única/serie solicitada. Se conserva la arquitectura de A1 frente a introducir una librería o un segundo estado de resumen. Las reglas globales que todavía sirven a legacy se mantienen; el formulario A2 deja de usar sus clases de raíz para aislar el diseño local. La búsqueda confirmó que `nueva-reunion-page.server.tsx` todavía importa el CSS anterior de la página, por lo que se conserva íntegro. La pantalla Zoom importa únicamente el módulo nuevo para su encabezado y formulario.

## Verificación y límites

TDD con helpers puros y `renderToStaticMarkup` en archivos `*.test.ts`; contrato reforzado de envío, confirmación e invalidación. Se ejecutan `npm run check` y `npx vitest run` completos. No se levanta la aplicación ni túneles por la base remota; capturas, reflow a 320 px/200 %, contraste medido y prueba con lector de pantalla quedan pendientes. Sin commits ni push, en `feat/nueva-reunion-a2`.
