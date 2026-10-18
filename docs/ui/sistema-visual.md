# Sistema visual de Sala Virtual FLACSO

Los tokens compartidos viven en `app/brand.css`. Las hojas de página existentes se migran cuando se trabaje esa pantalla y se hayan comprobado sus consumidores; no se deben borrar ni sobrescribir con parches globales.

## Color

| Uso | Token | Valor o referencia |
|---|---|---|
| Fondo general | `--bg` | `#f5f6f8` |
| Superficie | `--surface` | `#ffffff` |
| Superficie suave | `--surface-soft` | `#f3f4f6` |
| Superficie de marca | `--surface-brand` | `#edf1f7` |
| Superficie al pasar el puntero | `--surface-hover` | `#eceff3` |
| Texto principal | `--text` | `#202938` |
| Texto secundario | `--text-secondary` | `#475467` |
| Texto atenuado | `--muted` | `#667085` |
| Borde | `--line` | `#d9dee7` |
| Marca institucional | `--brand` | `#2c4777` |
| Marca fuerte | `--brand-strong` | `#223a66` |
| Marca profunda | `--brand-deep` | `#172c52` |
| Marca suave | `--brand-soft` | `#edf1f7` |
| Marca secundaria | `--brand-secondary` | `#52698f` |
| Marca secundaria fuerte | `--brand-secondary-strong` | `#40577f` |
| Marca secundaria suave | `--brand-secondary-soft` | `#f1f3f7` |
| Acento institucional | `--accent` | `#ffcf1f` |
| Acento fuerte | `--accent-strong` | `#f2bd00` |
| Acento suave | `--accent-soft` | `#fff4b8` |
| Texto sobre acento | `--accent-text` | `#18345d` |
| Éxito | `--state-success` | Alias de `--ok` (`#24745b`) |
| Advertencia | `--state-warning` | Alias de `--warning` (`#a96f00`) |
| Error | `--state-danger` | Alias de `--danger` (`#a94242`) |
| Información | `--state-info` | Alias de `--brand` |
| Gradiente institucional existente | `--hero-gradient` | Conservar para consumidores actuales |

Los tokens existentes `--ok`, `--warning` y `--danger` siguen disponibles para las hojas actuales. En UI nueva o modificada, usar los alias `--state-*` para estados semánticos.

## Tipografía

| Uso | Token | Valor |
|---|---|---|
| Familia | `--font-sans` | `Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif` |
| Extra pequeña | `--text-xs` | `0.75rem` |
| Pequeña | `--text-sm` | `0.875rem` |
| Base | `--text-md` | `1rem` |
| Grande | `--text-lg` | `1.125rem` |
| Extra grande | `--text-xl` | `1.25rem` |
| Título 2 | `--text-2xl` | `1.5rem` |
| Título 3 | `--text-3xl` | `1.875rem` |

## Espaciado

| Token | Valor |
|---|---|
| `--space-1` | `0.25rem` |
| `--space-2` | `0.5rem` |
| `--space-3` | `0.75rem` |
| `--space-4` | `1rem` |
| `--space-5` | `1.25rem` |
| `--space-6` | `1.5rem` |
| `--space-8` | `2rem` |

## Radios, bordes y elevación

| Uso | Token | Valor |
|---|---|---|
| Radio pequeño | `--radius-sm` | `4px` |
| Radio mediano | `--radius-md` | `6px` |
| Radio grande | `--radius-lg` | `8px` |
| Radio circular | `--radius-full` | `9999px` |
| Ancho de borde | `--border-width` | `1px` |
| Elevación baja | `--shadow-sm` | `0 5px 18px rgba(23, 44, 82, 0.06)` |
| Elevación mediana | `--shadow-md` | `0 16px 42px rgba(23, 44, 82, 0.10)` |
| Elevación alta | `--shadow-lg` | `0 24px 64px rgba(23, 44, 82, 0.14)` |

## Foco de teclado

Los enlaces y controles interactivos muestran un contorno de `3px` con `2px` de separación. `--focus-ring-color` usa el azul institucional `#2c4777`; conservar el indicador visible cuando se ajusten componentes.

## Migración progresiva

- Mantener los nombres de tokens existentes mientras haya consumidores que los utilicen.
- Preferir tokens semánticos en cualquier UI nueva o modificada.
- Migrar estilos de pantalla solo junto con esa pantalla, después de revisar sus hojas globales, modulares y consumidores.
- No crear selectores globales correctivos ni eliminar hojas por conteo o antigüedad.

## Estilos de notificaciones

El listado, el filtro y sus acciones de la ruta /notificaciones se encapsulan en el modulo CSS de la pantalla. Las reglas duplicadas se retiraron de gestion.css y brand-refresh.css. Los botones y estados compartidos siguen usando sus estilos globales.
