# Inicio independiente del proveedor — diseño

Fecha: 2026-11-05

## Intención

La portada de Administración debe ayudar a operar la agenda del día. Hoy muestra textos y controles exclusivos de Google Meet aunque la instancia activa pueda ser Zoom, lo que comunica estados falsos o irrelevantes.

## Objetivos

- Identificar el proveedor activo de cada reunión de la agenda.
- Etiquetar la acción de acceso con el proveedor real: `Entrar a Zoom` o `Entrar a Google Meet`.
- Convertir la copia del enlace en una acción neutral.
- Mostrar el estado de cohosts solo para Google Meet; en Zoom no se muestra esa fila.
- Cambiar el acceso rápido «Buscar Meet» por «Buscar reunión» y llevar a la vista de reuniones, no a la herramienta técnica de búsqueda reversa.
- Mantener «Gestionar monitoreo» y «Nueva reunión».

## Fuera de alcance

- No se modifica el aprovisionamiento, la integración con Zoom/Meet, la base de datos ni los flujos de cohosts.
- La búsqueda reversa de Meet sigue disponible desde el Centro de operaciones.
- No se añade una búsqueda inversa equivalente para Zoom.

## Enfoques considerados

1. Cambiar únicamente las etiquetas visibles mediante detección de URL. Es rápido, pero frágil y deja la UI atada a cómo se redacta el enlace.
2. Usar el proveedor activo que ya resuelve el adaptador del dashboard y exponerlo en su DTO. Elegido: es consistente con la fuente de verdad existente y no altera integraciones.
3. Eliminar todo indicio de proveedor. Se descarta porque «Entrar a Zoom» comunica una acción útil.

## Diseño elegido

El adaptador de Administración añadirá el tipo del proveedor activo al DTO de las reuniones de hoy. La línea de tiempo utilizará ese dato para:

- nombrar el acceso y el tooltip de copia;
- rotular un enlace pendiente como «Enlace de Zoom/Google Meet pendiente»;
- renderizar cohosts únicamente si el proveedor es Google Meet;
- conservar el resto de la información académica y de monitoreo sin cambios.

El encabezado conservará tres acciones. «Buscar reunión» abrirá el listado de reuniones/series; la operación específica de Meet no aparece como acción principal de Inicio.

## Pruebas

- Pruebas de presentación/adapter para proveedor Zoom y Google Meet.
- Prueba del encabezado que verifica la ruta y etiqueta de búsqueda general.
- Comprobación TypeScript y suite de tests relevante.

## Decisiones del implementador

- Se reutilizará el componente existente de copia de enlace, ampliándolo con un nombre genérico y una etiqueta configurable.
- La presentación no intentará inferir el proveedor desde la URL.
