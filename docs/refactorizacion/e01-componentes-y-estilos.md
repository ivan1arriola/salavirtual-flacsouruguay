# E01.3 — Componentes, estilos y límites de presentación

Línea base: `bfcbfc091277086b37a7ae499bc95e54fe441272`. Revisión estática de código y documentación; no se ejecutó un navegador ni se midió CSS computado en producción.

## Superficie de estilos

- 52 archivos CSS en el repositorio.
- 30 hojas importadas desde `app/(gestion)/layout.tsx`.
- 2 hojas globales importadas desde `app/layout.tsx`: `app/globals.css` y `app/brand.css`.
- Las 32 hojas compartidas suman 457.917 bytes (aprox. 447,2 KiB) de CSS fuente.
- Los otros 20 archivos corresponden a estilos de páginas/módulos y CSS Modules; su uso debe rastrearse antes de retirarlos.

Las cinco hojas compartidas más grandes son:

| Archivo | Bytes |
| --- | ---: |
| `operations.css` | 87.426 |
| `meeting-detail-v2.css` | 59.311 |
| `role-dashboard.css` | 28.411 |
| `settings.css` | 26.624 |
| `configuration-center.css` | 23.429 |

Estas cinco suman 225.201 bytes, aproximadamente el 49,2 % del CSS compartido importado.

## Hallazgos de cascada

Una exploración estática inicial detectó numerosos selectores repetidos entre hojas. En el primer conjunto de 16 hojas se identificaron 149 combinaciones selector/propiedad con valores distintos entre archivos. En el segundo conjunto aparecieron tres adicionales. Es un indicador de posibles overrides, no un recuento de defectos: el análisis no resuelve especificidad, capas, media queries ni si dos reglas pueden coincidir en el mismo viewport.

Ejemplos que requieren validar su intención:

- `.app-frame`, `.brand`, `.side-nav a`, `.workspace`, `.mobile-header` y `.mobile-nav` aparecen en `gestion.css` y hojas de refresh.
- `.meetings-agenda-*` aparece tanto en `operations.css` como en `agenda-refresh.css`; este último se importa después.
- `.meeting-detail-v2` se define en `meeting-detail-v2.css` y `meeting-detail-mobile-continuous.css`.
- `.mobile-nav` recibe definiciones en `gestion.css`, `ux-polish.css`, `brand-refresh.css` y `profile-navigation-refresh.css`. La grilla base cambia de cuatro a cinco columnas en `ux-polish.css`.
- `.account-block` pasa de `display: grid` en `gestion.css` a `display: block` en `profile-navigation-refresh.css`.
- `.admin-dashboard-redesigned .admin-metrics-bar-grid` tiene reglas en `admin-dashboard-mobile.css` y `role-dashboard-mobile.css`.

El orden de importación es relevante: el layout carga primero hojas base como `gestion.css` y `operations.css`, y luego hojas de refinamiento como `ux-polish.css`, `brand-refresh.css`, `profile-navigation-refresh.css` y `agenda-refresh.css`. No se debe eliminar una hoja por antigüedad o tamaño. Hay que registrar consumidor, reglas, orden y viewport antes de consolidar.

## Tokens y tipografía

`docs/ui/sistema-visual.md` define `--font-sans` con Inter y recomienda migrar progresivamente a tokens semánticos. `app/brand.css` define ese token y lo asigna a `body`; `app/globals.css` declara Arial; posteriormente `ux-polish.css`, importado por el layout autenticado, vuelve a declarar una pila system sans. Esto produce una posible diferencia tipográfica entre páginas públicas y autenticadas y hace que el token documentado no sea la única fuente de verdad.

Decisión propuesta: `app/brand.css` debe ser la fuente canónica de tokens; las hojas de pantalla no deben redefinir globalmente tipografía, color de marca o elementos HTML. Confirmar con capturas reales antes de cambiar la cascada.

## Shell y navegación

- `AppShell` es la composición compartida de escritorio y móvil para los tres roles. Incluye navegación, creación, notificaciones, perfil y tours.
- `app-navigation.ts` centraliza grupos por rol y accesos móviles; `SidebarLink` calcula estado activo; `DismissibleDetails` implementa cierre de menús.
- Los arrays móviles se construyen usando posiciones como `adminGroups[0].items[0]`. Es frágil ante reordenamientos. Propuesta: identificadores estables por destino y una única definición declarativa de grupos, prioridad móvil y reglas de actividad.
- `isNavigationItemActive` contiene excepciones específicas para `/reuniones`, `/mi-agenda`, `/operacion` y `/mis-clases`. Al crecer los módulos, trasladar esas reglas a metadatos de navegación tipados, con pruebas de rutas y query params.
- `getSecondaryNavigation` filtra por URL completa. Las variantes de una misma ruta con distintos parámetros deben conservarse intencionalmente (por ejemplo, agenda y series).
- Configuración mantiene su subnavegación en `SettingsCenterShell`; es una navegación contextual legítima y no necesita duplicarse en el menú global.

### Cierre de menús y pruebas

`DismissibleDetails` ya contempla cerrar al activar un enlace (incluso si la URL no cambia), tocar fuera, mover el foco fuera, pulsar Escape y activar el control explícito. Lo utilizan tanto el menú «Más» como el menú de perfil.

La revisión del 5 de noviembre en `docs/superpowers/reviews/2026-11-05-cuentas-zoom-por-grupo/codex-sidebar.md` decía que el menú no cerraba al activar un enlace. Esa observación quedó desactualizada: el código actual incluye `handleLinkClick` en fase de captura y una prueba específica para enlaces internos, incluso cuando la URL no cambia. No repetir ese hallazgo como defecto vigente.

Las pruebas actuales son principalmente estáticas para este comportamiento: `navigation-disclosure.test.ts` comprueba fragmentos del código fuente; `mobile-more-navigation-ui.test.ts` analiza CSS con PostCSS; `app-navigation.test.ts` prueba reglas de navegación. No ejecutan el evento real en un navegador. En `package.json` no se encontraron Playwright, Cypress, Puppeteer, jsdom ni axe-core. La existencia del handler no demuestra por sí sola que el menú cierre correctamente en todos los dispositivos.

Acción E01.4: incorporar pruebas de navegador para seleccionar un enlace del menú móvil, seleccionar la página actual, cerrar con Escape, click exterior, gestión de foco, perfil y navegación atrás. Mantener las pruebas unitarias actuales.

## Presentación de reuniones y proveedores

El código ya centraliza parte de la semántica en `proveedor-reunion.domain.ts`, pero mantiene composiciones de presentación diferenciadas:

- `reuniones-lista-page.server.tsx` selecciona páginas de lista Meet o Zoom.
- `reunion-detalle-page.server.tsx` selecciona detalles Meet o Zoom y contempla series mixtas que se dividen en paneles por proveedor.
- `reunion-operativa-page.server.tsx` compone la operación Meet y las variantes Zoom operativa e histórica.
- La ficha histórica Zoom expone secciones de resumen, asistencia y grabaciones.

No se recomienda fusionar todas estas pantallas en un componente monolítico. La dirección objetivo es compartir shell, encabezado, resumen, estados, estructura de ficha y patrones de interacción, manteniendo adaptadores, capacidades y evidencias propias del proveedor. Preservar explícitamente la división de series mixtas y los datos históricos.

## Documentación contradictoria

`docs/arquitectura.md` afirma que Meet es el proveedor operativo y Zoom histórico, mientras el formulario de creación actual es `nueva-reunion-zoom-page.server.tsx` y la lista documenta Zoom para reuniones nuevas y migradas. `docs/ui/reuniones.md` también describe flujos de asistencia basados en Meet. La documentación debe distinguir el estado histórico, la migración y el comportamiento actual, sin asumir que todas las series o encuentros ya fueron migrados.

La auditoría de Zoom del 3 de noviembre (`docs/revisiones/2026-11-03-auditoria-ui-antigravity.md`) registra problemas de estilos y accesibilidad, pero declara que no se ejecutó la aplicación en navegador. Debe tratarse como evidencia histórica a revalidar, no como prueba de defectos vigentes.

## Decisiones y tareas para E01

1. Crear un mapa de propiedad CSS: archivo, consumidor, componente, breakpoints y orden de carga.
2. Identificar reglas globales que deben pasar a tokens y componentes compartidos.
3. Consolidar overrides solo junto con capturas antes/después y regresión visual.
4. Migrar navegación a identificadores estables y metadatos declarativos.
5. Añadir pruebas de navegador para navegación, menús, foco y recorridos críticos.
6. Unificar presentación de proveedores por composición y capacidades, no por eliminación de diferencias de dominio.
7. Reconciliar la documentación de Meet/Zoom antes de aprobar E02.

## Limitación de esta revisión

El navegador conectado no permitió leer la pestaña de Sala Virtual por falta de permiso de extensión para ese host. Por tanto, esta entrega es una auditoría estática del repositorio. Capturas autenticadas por rol, medición de estilos computados, pruebas de lector de pantalla y recorridos reales siguen pendientes.
