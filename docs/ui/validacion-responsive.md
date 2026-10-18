# Validación responsive

## Agenda de reuniones

La revisión visual autenticada en producción encontró una barra horizontal de página y controles de filtro recortados en una ventana de escritorio de aproximadamente 1344px. La navegación lateral persistente reduce el ancho útil del contenido, mientras que el toolbar seguía intentando usar dos columnas hasta un viewport de 1280px.

El toolbar se apila desde 1400px para considerar el ancho del shell completo. Los filtros mantienen su propia distribución existente y el layout compacto móvil sigue bajo sus breakpoints actuales. El cambio no oculta overflow ni modifica parámetros, rutas o contenido.

La comprobación visual local por rol y en dispositivo móvil requiere autenticación de esos roles; la validación automatizada cubre el breakpoint, TypeScript, suite y compilación.

## Personas

En `/usuarios`, el listado conserva su semántica de tabla para lectores de pantalla. En el patrón móvil de tarjetas, cada campo muestra el nombre de su columna (Persona, Cuentas Google, Acceso y Acción), para que el contenido siga siendo comprensible cuando los encabezados de escritorio se ocultan visualmente.

## Selección de cohosts

En el formulario de reuniones, las filas de cohosts ocupan al menos 44px en móvil y permiten activar el checkbox pulsando cualquier parte de la etiqueta. La selección, los límites de cuentas y el envío del formulario no cambian.

## Operación de reunión

En la consola de operación, los filtros de participantes, la búsqueda, la edición en línea y la acción para quitar cohosts tienen controles de al menos 44px de alto en pantallas de hasta 760px. Los correos largos en los chips se ajustan al ancho disponible.


## Mi agenda de asistentes

En teléfonos, la fecha y la marca de próxima cobertura quedan arriba; los horarios de monitoreo y del encuentro se apilan a todo el ancho debajo, cada uno con su rótulo. La tarjeta conserva los instantes calculados por la reunión y su cobertura asignada.
