# Validación responsive

## Agenda de reuniones

La revisión visual autenticada en producción encontró una barra horizontal de página y controles de filtro recortados en una ventana de escritorio de aproximadamente 1344px. La navegación lateral persistente reduce el ancho útil del contenido, mientras que el toolbar seguía intentando usar dos columnas hasta un viewport de 1280px.

El toolbar se apila desde 1400px para considerar el ancho del shell completo. Los filtros mantienen su propia distribución existente y el layout compacto móvil sigue bajo sus breakpoints actuales. El cambio no oculta overflow ni modifica parámetros, rutas o contenido.

La comprobación visual local por rol y en dispositivo móvil requiere autenticación de esos roles; la validación automatizada cubre el breakpoint, TypeScript, suite y compilación.
