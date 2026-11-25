# Sistema de diseño

Partir de [sistema visual existente](../ui/sistema-visual.md) y app/brand.css. No es un rebranding.

## Fundamentos

- Marca azul institucional #2c4777 y acento existente; color semántico para error, éxito, información y advertencia.
- Tipografía Inter y escala existente; texto base 16 px cuando corresponda. Espaciado basado en tokens de 4 y 8 px.
- Superficies, bordes, radios y elevación consistentes. Evitar gradientes y cajas innecesarias.
- Usar iconos Lucide existentes acompañados de texto cuando su significado no sea evidente.
- WCAG 2.2 AA como objetivo: contraste de texto normal 4.5:1, componentes y texto grande 3:1 cuando corresponda; foco visible no oculto, semántica y teclado. Objetivo interno táctil de 44 px y preferir 48 px en controles principales móviles.

## Componentes prioritarios

- Shell, sidebar, barra móvil, panel Más, menú de cuenta, breadcrumbs y encabezado de página.
- Botones y acciones por importancia, campos de formulario, validación, estados y confirmaciones.
- Tarjetas, listados/tablas adaptativas, paginación, filtros y búsqueda.
- Estados académicos, de cobertura, integración y archivo; no codificarlos solo mediante color.
- Selector de vista, pestañas cuando su patrón semántico corresponda, acordeones y diálogos.
- Fecha y horario académico/monitoreo, resumen de serie y tarjeta de encuentro.
- Carga, vacío, error, acceso denegado, dato no disponible y reintento.

## Patrones

La pantalla de listado tiene encabezado, acción primaria, filtros, resultados y paginación. La de detalle tiene identidad y contexto, resumen, acciones y secciones. La de configuración agrupa parámetros por propósito. En móvil apilar contenido según orden de lectura; conservar secciones continuas en fichas de reunión en vez de ocultar información mediante pestañas innecesarias.

Validar de 320 a 1440 px y mayores, zoom de texto 200%, reflow y orientación horizontal. Para cada componente documentar variantes, estados, teclado y lector de pantalla, y ejemplo real. Las tablas que requieren desplazamiento horizontal deben limitarlo a su contenedor.

Migrar consumidores por incremento; retirar CSS solo tras verificar todos los usos. No exigir un framework ni Storybook para empezar; crear un catálogo de componentes verificable con las herramientas del proyecto y evaluar infraestructura adicional en E03.
