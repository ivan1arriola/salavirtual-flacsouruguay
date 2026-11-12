<!--
Auditoría de interfaz de las pantallas de reuniones Zoom, generada por Antigravity (agy, modo plan, sin la bandera de saltar permisos).
Fecha: 2026-11-03. Texto del informe tal como lo entregó el revisor; se omitió su razonamiento previo. No ejecutó la aplicación en un navegador.
-->

# Informe de auditoría de interfaz — Pantallas de reuniones Zoom

## 1. Resumen

Las pantallas de reuniones Zoom resuelven los flujos principales con HTML liviano, pero presentan una brecha marcada entre las vistas pulidas (formulario de alta y migración) y el detalle de reunión ([`ReunionZoomDetailPage`](file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/src/bootstrap/ui/reuniones/reunion-zoom-detail-page.server.tsx#L17-L104) / [`ReunionZoomEncuentros`](file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/src/modules/reuniones/presentation/components/reunion-zoom-encuentros.tsx#L42-L170)), que carece por completo de estilos propios y de gestión de foco. También hay problemas de accesibilidad en modales, regiones vivas y acciones repetidas por fila, y varios controles quedan por debajo del objetivo táctil de 44×44 px en móvil.

**Las 3 mejoras de mayor impacto son:**

1. **Estilar el detalle de reunión Zoom y conectar los tokens semánticos de estado** (`.zoom-encuentros`, `.zoom-link-status`, `.zoom-join-actions`), hoy renderizados como lista HTML cruda y sin colores de estado.
2. **Corregir la accesibilidad de acciones por encuentro y diálogos modales** (sacar `role="status"` de adentro del `<button>` en [`ZoomJoinActions`](file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/src/components/zoom-join-actions.tsx#L6-L30), contextualizar nombres accesibles por fecha/título y atrapar/mover el foco en edición inline y modales).
3. **Llevar todos los objetivos táctiles e inputs móviles a ≥ 44 px y `font-size: 16px`** en lista, filtros, edición de encuentros y migración para evitar toques fallidos y auto-zoom en iOS.

---

## 2. Mejoras propuestas (ordenadas por prioridad)

### Prioridad Alta

#### 1. `src/modules/reuniones/presentation/components/reunion-zoom-encuentros.tsx:101-169` — Detalle de Zoom sin CSS propio

- **Verificado en:** [`reunion-zoom-encuentros.tsx`](file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/src/modules/reuniones/presentation/components/reunion-zoom-encuentros.tsx#L101-L169), [`reunion-zoom-detail-page.server.tsx`](file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/src/bootstrap/ui/reuniones/reunion-zoom-detail-page.server.tsx#L84-L102) y [`meeting-detail-v2.css`](<file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/app/(gestion)/meeting-detail-v2.css#L1-L70>). _(Problema conocido confirmado)._
- **Problema:** `.zoom-encuentros`, `.zoom-join-actions` y el `<header>` directo de `.meeting-detail-v2` no tienen reglas CSS en ningún archivo importado por [`app/(gestion)/layout.tsx`](<file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/app/(gestion)/layout.tsx#L9-L36>).
- **Efecto en el usuario:** La lista de encuentros se ve con viñetas nativas (`<ul>`), textos (`<strong>` y `<span>`) pegados en la misma línea sin separación, botones de acción sin `gap` ni estructura de tarjeta, y el formulario de edición inline colapsado en una sola línea desordenada en celular.
- **Mejora propuesta:** Agregar reglas para `.zoom-encuentros` y `.zoom-join-actions` en [`app/(gestion)/meeting-detail-v2.css`](<file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/app/(gestion)/meeting-detail-v2.css>) reutilizando tokens globales:
  ```css
  .zoom-encuentros,
  .zoom-encuentros > ul {
    display: grid;
    gap: 12px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .zoom-encuentros > ul > li {
    display: grid;
    gap: 12px;
    padding: 16px;
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    background: var(--surface);
  }
  .zoom-encuentros > ul > li > div {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
  }
  .zoom-join-actions {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  ```
- **Esfuerzo estimado:** **M**

#### 2. `src/components/zoom-link-status.tsx:48-57` — Estados del enlace sin jerarquía visual ni clases semánticas existentes

- **Verificado en:** [`zoom-link-status.tsx`](file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/src/components/zoom-link-status.tsx#L48-L57) y [`gestion.css`](<file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/app/(gestion)/gestion.css#L432-L461>). _(Problema conocido confirmado)._
- **Problema:** Se aplica `className="status zoom-link-status is-${estado.toLowerCase()}"`. Las clases `.is-listo`, `.is-atencion`, `.is-pendiente` e `.is-error` no existen en CSS; el sistema usa `.status-ok`, `.status-warning`, `.status-neutral` y `.status-error`. Además, el `<button>` "Reintentar" y el `<small role="alert">` quedan anidados dentro del badge `.status` (que tiene `font-size: 0.75rem; white-space: nowrap`).
- **Efecto en el usuario:** Un enlace en `ERROR` o `ATENCION` se ve idéntico a `LISTO` (sin color ni borde de alerta), y cuando aparece el botón "Reintentar" o un error de red, deforma la píldora de estado.
- **Mejora propuesta:** Mapear `EstadoEnlaceZoom` a las clases `.status-*` existentes y separar el badge del botón/alerta dentro de un contenedor flex:
  ```tsx
  const CLASES_ESTADO: Record<EstadoEnlaceZoom, string> = {
    LISTO: "status-ok",
    ATENCION: "status-warning",
    PENDIENTE: "status-neutral",
    ERROR: "status-error"
  };
  // Render:
  <span className="zoom-link-status">
    <span className={`status ${CLASES_ESTADO[estado]}`}>{ETIQUETAS[estado]}</span>
    {esAdmin && estado !== "LISTO" && eventoProveedorId ? ( ... ) : null}
    {error ? <small className="zoom-link-error" role="alert">{error}</small> : null}
  </span>
  ```
- **Esfuerzo estimado:** **S**

#### 3. `src/components/zoom-join-actions.tsx:25-28` — `role="status"` inválido dentro de `<button>`

- **Verificado en:** [`zoom-join-actions.tsx`](file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/src/components/zoom-join-actions.tsx#L25-L28). _(Problema conocido confirmado)._
- **Problema:** `<span role="status">{copied ? "Copiado" : "Copiar enlace"}</span>` está dentro de un `<button>`. En WAI-ARIA, `button` tiene hijos presentacionales (`Children Presentational: True`), por lo que los lectores de pantalla ignoran el `role="status"` interno o anuncian cada botón como región viva al cargar la lista.
- **Efecto en el usuario:** Usuarios de lector de pantalla no reciben confirmación al copiar el enlace de Zoom, o sufren ruido al navegar la lista.
- **Mejora propuesta:** Dejar el texto plano dentro del `<button>` y colocar una región viva oculta (`className="sr-only"`) fuera del botón que solo renderice texto cuando `copied` es `true`:
  ```tsx
  <button className="secondary-action" onClick={copy} type="button">
    {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
    <span>{copied ? "Copiado" : "Copiar enlace"}</span>
  </button>
  <span className="sr-only" role="status" aria-live="polite">
    {copied ? "Enlace de Zoom copiado al portapapeles" : ""}
  </span>
  ```
- **Esfuerzo estimado:** **S**

#### 4. `src/components/zoom-join-actions.tsx:6-29` y `src/modules/reuniones/presentation/components/reunion-zoom-encuentros.tsx:124-156` — Acciones repetidas sin nombre accesible contextual

- **Verificado en:** [`zoom-join-actions.tsx`](file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/src/components/zoom-join-actions.tsx#L6-L29), [`reuniones-lista-zoom-page.server.tsx`](file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/src/bootstrap/ui/reuniones/reuniones-lista-zoom-page.server.tsx#L128-L135) y [`reunion-zoom-encuentros.tsx`](file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/src/modules/reuniones/presentation/components/reunion-zoom-encuentros.tsx#L118-L156). _(Problema conocido confirmado y ampliado)._
- **Problema:** En una lista o serie con N encuentros, hay N enlaces `"Unirse"`, N botones `"Copiar enlace"`, N `"Reintentar"`, N `"Iniciar como anfitrión"`, N `"Editar fecha y hora"` y N `"Cancelar encuentro"` con nombres accesibles idénticos. Además, los enlaces con `target="_blank"` no avisan que abren pestaña nueva.
- **Efecto en el usuario:** Al navegar por lista de enlaces/botones en un lector de pantalla, es imposible distinguir a qué fecha o reunión pertenece cada acción (WCAG 2.4.4 / 2.4.6).
- **Mejora propuesta:** Pasar una prop opcional `contexto?: string` (por ejemplo, `${encuentro.solicitud.titulo} del ${formatDate(encuentro.inicioProgramadoAt)}` en lista, y `fechaFmt.format(inicio)` en detalle) a [`ZoomJoinActions`](file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/src/components/zoom-join-actions.tsx#L6) y [`ZoomLinkStatus`](file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/src/components/zoom-link-status.tsx#L15), y usar `aria-label` en los botones de [`ReunionZoomEncuentros`](file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/src/modules/reuniones/presentation/components/reunion-zoom-encuentros.tsx#L126-L153):
  ```tsx
  <a
    aria-label={contexto ? `Unirse por Zoom a ${contexto} (abre en pestaña nueva)` : undefined}
    className="primary-action"
    href={url}
    rel="noreferrer"
    target="_blank"
  >
  ```
- **Esfuerzo estimado:** **S**

#### 5. `src/modules/reuniones/presentation/components/reunion-zoom-encuentros.tsx:136-156` — Pérdida de foco al editar encuentro y botones activos durante `pending`

- **Verificado en:** [`reunion-zoom-encuentros.tsx`](file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/src/modules/reuniones/presentation/components/reunion-zoom-encuentros.tsx#L136-L156). _(Problema conocido confirmado)._
- **Problema:**
  1. Al pulsar `"Editar fecha y hora"`, el `<button>` se desmonta y se monta el `<form>`, pero no se mueve el foco al primer campo (`input[name="fecha"]`), ni se devuelve al botón al pulsar `"Cancelar edición"`.
  2. El botón `"Editar fecha y hora"` (línea 145) y `"Cancelar edición"` (línea 141) no tienen `disabled={pending}`, permitiendo abrir o cerrar formularios mientras hay una petición en vuelo.
- **Efecto en el usuario:** Quien navega con teclado o lector de pantalla pierde la posición en la página al abrir/cerrar la edición; en conexiones móviles lentas se puede disparar otra edición mientras se guarda o cancela un encuentro.
- **Mejora propuesta:** Agregar `disabled={pending}` a ambos botones y usar `autoFocus` (o un `ref` callback) en el primer `<input>` del formulario de edición:
  ```tsx
  <label>
    Fecha
    <input autoFocus defaultValue={valores.fecha} disabled={pending} name="fecha" required type="date" />
  </label>
  ...
  <button className="secondary-action" disabled={pending} onClick={() => setEditando(null)} type="button">
    Cancelar edición
  </button>
  ```
  Y en la vista de lectura:
  ```tsx
  <button className="secondary-action" disabled={pending} onClick={() => setEditando(encuentro.id)} type="button">
  ```
- **Esfuerzo estimado:** **S**

#### 6. `src/components/migracion-zoom-aplicar-control.tsx:241-254` y `src/modules/reuniones/presentation/components/meeting-creation-dialog.tsx:19-53` — Modales sin gestión de foco, cierre con `Escape` ni bloqueo de fondo

- **Verificado en:** [`migracion-zoom-aplicar-control.tsx`](file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/src/components/migracion-zoom-aplicar-control.tsx#L241-L254) y [`meeting-creation-dialog.tsx`](file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/src/modules/reuniones/presentation/components/meeting-creation-dialog.tsx#L19-L53).
- **Problema:** Ambos componentes usan `<div role="dialog" aria-modal="true">` manuales en lugar de `<dialog>` nativo, sin mover el foco adentro al abrirse, sin atrapar `Tab` y (en el modal de confirmación de migración) sin cerrar al presionar `Escape`.
- **Efecto en el usuario:** Con teclado, el foco queda detrás del backdrop oscuro, recorriendo los botones e inputs de la página subyacente sin poder confirmar ni cerrar el modal con `Escape`.
- **Mejora propuesta:** Reemplazar el contenedor por `<dialog ref={dialogRef}>` llamado con `.showModal()`, o agregar un `useEffect` que enfoque el primer botón interactivo al montar y escuche `keydown` para `Escape`:
  ```tsx
  useEffect(() => {
    if (!confirmar) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setConfirmar(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [confirmar]);
  ```
- **Esfuerzo estimado:** **M**

---

### Prioridad Media

#### 7. `app/(gestion)/reuniones/reuniones-zoom.module.css:45-62` y `src/bootstrap/ui/reuniones/reuniones-lista-zoom-page.server.tsx:80-107` — Filtros de lista Zoom sin estilos de campo ni objetivos táctiles de 44 px

- **Verificado en:** [`reuniones-zoom.module.css`](<file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/app/(gestion)/reuniones/reuniones-zoom.module.css#L45-L62>) y [`reuniones-lista-zoom-page.server.tsx`](file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/src/bootstrap/ui/reuniones/reuniones-lista-zoom-page.server.tsx#L80-L107).
- **Problema:** Los controles `<input type="search">`, `<select name="programa">`, `<input type="date">` y el enlace `<Link>Limpiar</Link>` dentro de `.filters` no usan la clase `.field` ni tienen reglas de altura, borde o `font-size` en `reuniones-zoom.module.css`. Además, en las líneas 84-86, 90-91, 98-99 y 102-103 se duplica la etiqueta accesible (`<span className="sr-only">` + `aria-label` en el input).
- **Efecto en el usuario:** En móvil los inputs de fecha y selector quedan pequeños (< 44 px), con estilos nativos dispares del navegador, producen auto-zoom en iOS (fuente < 16 px) y el enlace `"Limpiar"` carece de área táctil suficiente.
- **Mejora propuesta:** Eliminar los `aria-label` redundantes (conservando `<span className="sr-only">`) y estilizar inputs, selects y el enlace de limpiar en [`reuniones-zoom.module.css`](<file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/app/(gestion)/reuniones/reuniones-zoom.module.css#L45-L62>):
  ```css
  .filters input,
  .filters select {
    min-height: 44px;
    padding: 8px 12px;
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    background: var(--surface);
    color: var(--text);
    font: inherit;
    font-size: 16px;
  }
  .filters button,
  .filters a {
    min-height: 44px;
    display: inline-flex;
    align-items: center;
  }
  ```
- **Esfuerzo estimado:** **S**

#### 8. `src/modules/reuniones/presentation/components/reunion-zoom-encuentros.tsx:168` — Mensajes de éxito/error en detalle sin estilo visual ni ubicación visible

- **Verificado en:** [`reunion-zoom-encuentros.tsx`](file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/src/modules/reuniones/presentation/components/reunion-zoom-encuentros.tsx#L168). _(Problema conocido confirmado)._
- **Problema:** `{mensaje ? <p role={mensaje.error ? "alert" : "status"}>{mensaje.texto}</p> : null}` se renderiza al final de toda la lista de encuentros y sin clase CSS.
- **Efecto en el usuario:** Si una serie tiene varios encuentros y falla la edición del primero (p. ej. hora fin ≤ hora inicio), el mensaje aparece abajo del todo, fuera del viewport móvil y con apariencia de párrafo común.
- **Mejora propuesta:** Ubicar el aviso arriba de la lista (o junto al encuentro en edición) y usar `.meeting-detail-feedback` combinada con los tokens de estado:
  ```tsx
  {
    mensaje ? (
      <p
        className={`meeting-detail-feedback ${mensaje.error ? "status-error" : "status-ok"}`}
        role={mensaje.error ? "alert" : "status"}
      >
        {mensaje.texto}
      </p>
    ) : null;
  }
  ```
- **Esfuerzo estimado:** **S**

#### 9. `src/components/migracion-zoom-aplicar-control.module.css:121-122,179,215` y `src/components/excepcion-meet-control.module.css:7-25` — Objetivos táctiles menores a 44 px en la pantalla de migración

- **Verificado en:** [`migracion-zoom-aplicar-control.module.css`](file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/src/components/migracion-zoom-aplicar-control.module.css#L121-L122) y [`excepcion-meet-control.module.css`](file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/src/components/excepcion-meet-control.module.css#L7-L25).
- **Problema:** Varios controles interactivos quedan muy por debajo de 44×44 px:
  - Checkbox de selección `.selectBox`: `21px × 18px` (líneas 121-122).
  - Botones de barra y modal `.actionButtons button, .modalActions button`: `min-height: 39px` (línea 179), y en móvil `.clearButton` baja a `min-height: 25px` (línea 215).
  - En [`excepcion-meet-control.module.css`](file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/src/components/excepcion-meet-control.module.css#L7-L25): `.openButton` (`30px`), `.actions button` (`30px`) y `.form input` / `.form button` (`37px`).
- **Efecto en el usuario:** Alta tasa de error al tocar en pantallas táctiles, especialmente al seleccionar encuentros para migrar por lote o al cargar una excepción.
- **Mejora propuesta:** Subir `min-height: 44px` en botones e inputs y ampliar el área de toque de `.selectBox`:
  ```css
  .selectBox {
    display: grid;
    place-items: center;
    width: 44px;
    min-height: 44px;
    margin: -10px -8px -10px -10px;
    cursor: pointer;
  }
  .actionButtons button,
  .modalActions button,
  . actionButtons .clearButton {
    min-height: 44px;
  }
  ```
- **Esfuerzo estimado:** **S**

#### 10. `src/components/migracion-zoom-aplicar-control.module.css:160-174,213` — Superposición de la barra sticky `.actionBar` con la barra de navegación inferior móvil

- **Verificado en:** [`migracion-zoom-aplicar-control.module.css`](file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/src/components/migracion-zoom-aplicar-control.module.css#L160-L216) y [`gestion.css`](<file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/app/(gestion)/gestion.css#L573-L585>).
- **Problema:** En pantallas `≤ 860px`, `.mobile-nav` es `position: fixed; bottom: 0; min-height: 66px; z-index: 20`. En [`migracion-zoom-aplicar-control.module.css`](file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/src/components/migracion-zoom-aplicar-control.module.css#L160-L163), `.actionBar` tiene `position: sticky; bottom: 16px; z-index: 5` (y `bottom: 8px` en `≤ 650px`).
- **Efecto en el usuario:** Al hacer scroll en celular, la barra de acciones ("Convertir piloto", "Convertir selección") queda tapada detrás del menú inferior fijo de la aplicación.
- **Mejora propuesta:** Ajustar `bottom` y `z-index` en viewports móviles (tal como hace `nueva-reunion.module.css` en la línea 1013):
  ```css
  @media (max-width: 860px) {
    .actionBar {
      bottom: calc(74px + env(safe-area-inset-bottom));
      z-index: 22;
    }
  }
  ```
- **Esfuerzo estimado:** **S**

#### 11. `src/modules/reuniones/presentation/components/reunion-zoom-encuentros.tsx:113` — Estado de encuentro mostrado como identificador interno crudo

- **Verificado en:** [`reunion-zoom-encuentros.tsx`](file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/src/modules/reuniones/presentation/components/reunion-zoom-encuentros.tsx#L113).
- **Problema:** Se renderiza `<span className="status">{encuentro.estado.toLowerCase().replaceAll("_", " ")}</span>`, sin clase de color (`.status-ok`, `.status-error`, `.status-neutral`) y en minúsculas sin capitalizar.
- **Efecto en el usuario:** Un encuentro cancelado (`"cancelada"`) se ve igual que uno `"programada"`, dificultando escanear cuáles fechas siguen vigentes en una serie.
- **Mejora propuesta:** Definir un mapa explícito de etiquetas y clases semánticas para el estado de la instancia:
  ```tsx
  const ESTADO_INSTANCIA: Record<string, { label: string; clase: string }> = {
    PROGRAMADA: { label: "Programada", clase: "status-ok" },
    CANCELADA: { label: "Cancelada", clase: "status-error" },
    FINALIZADA: { label: "Finalizada", clase: "status-neutral" }
  };
  const infoEstado = ESTADO_INSTANCIA[encuentro.estado] ?? {
    label: encuentro.estado.toLowerCase().replaceAll("_", " "),
    clase: "status-neutral"
  };
  // <span className={`status ${infoEstado.clase}`}>{infoEstado.label}</span>
  ```
- **Esfuerzo estimado:** **S**

#### 12. `src/components/migracion-zoom-aplicar-control.tsx:218-220` — Códigos internos de backend expuestos en resultados de migración

- **Verificado en:** [`migracion-zoom-aplicar-control.tsx`](file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/src/components/migracion-zoom-aplicar-control.tsx#L218-L220).
- **Problema:** En el bloque de resultados se imprime `{resultado.resultado} · {resultado.etapa}` directamente, exponiendo constantes internas en mayúsculas/guiones bajos al personal administrativo.
- **Efecto en el usuario:** Textos crudos y poco claros al confirmar si una conversión tuvo éxito o en qué paso falló.
- **Mejora propuesta:** Agregar un diccionario de etiquetas legibles en español rioplatense para `resultado` y `etapa` (igual que se hizo con `ETIQUETAS` en las líneas 26-35) y acompañar con un badge `.badgeReady` / `.badgeWarning`.
- **Esfuerzo estimado:** **S**

#### 13. `src/bootstrap/ui/reuniones/reuniones-lista-zoom-page.server.tsx:65-69` — Enlace "Migración a Zoom" suelto fuera de la jerarquía del encabezado

- **Verificado en:** [`reuniones-lista-zoom-page.server.tsx`](file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/src/bootstrap/ui/reuniones/reuniones-lista-zoom-page.server.tsx#L53-L70).
- **Problema:** El botón de administración `<Link className="secondary-action" href="/reuniones/migracion-zoom">Migración a Zoom</Link>` está envuelto en un `<p>` suelto entre el `<header>` y las pestañas de período, ocupando una fila vertical extra.
- **Efecto en el usuario:** Desperdicia espacio vertical antes de la lista (especialmente en móvil) y rompe la alineación de acciones del encabezado.
- **Mejora propuesta:** Agrupar `"Migración a Zoom"` y `"Nueva reunión"` dentro de un contenedor `.actions` en el `<header className={styles.header}>`:
  ```tsx
  <div className="actions">
    {esAdmin ? (
      <Link className="secondary-action" href="/reuniones/migracion-zoom">
        Migración a Zoom
      </Link>
    ) : null}
    <Link className="primary-action" href="/reuniones/nueva">
      <CalendarPlus size={18} aria-hidden="true" />
      Nueva reunión
    </Link>
  </div>
  ```
- **Esfuerzo estimado:** **S**

#### 14. `src/bootstrap/ui/reuniones/reuniones-lista-zoom-page.server.tsx:109-111` — Estado vacío sin contexto ni acción de recuperación cuando hay filtros activos

- **Verificado en:** [`reuniones-lista-zoom-page.server.tsx`](file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/src/bootstrap/ui/reuniones/reuniones-lista-zoom-page.server.tsx#L109-L111).
- **Problema:** Cuando `encuentros.length === 0`, siempre muestra `<p className={styles.empty} role="status">No hay reuniones para mostrar.</p>`, sin distinguir si es porque no existen reuniones en el período o porque la búsqueda/filtro no arrojó coincidencias.
- **Efecto en el usuario:** Si el docente o administrador filtró y no obtuvo resultados, el mensaje es seco y no ofrece limpiar los filtros ni crear una reunión en el lugar.
- **Mejora propuesta:** Distinguir si hay filtros aplicados (`hayFiltros = Boolean(q || programaId || desdeParam || hastaParam)`) y usar el bloque `.empty-state` de `gestion.css`:
  ```tsx
  <div className="empty-state" role="status">
    <strong>
      {hayFiltros
        ? "No hay reuniones que coincidan con los filtros."
        : "No hay reuniones programadas en esta vista."}
    </strong>
    {hayFiltros ? (
      <Link className="secondary-action" href={reunionesHref({ periodo })}>
        Limpiar filtros
      </Link>
    ) : null}
  </div>
  ```
- **Esfuerzo estimado:** **S**

#### 15. `src/modules/reuniones/presentation/components/meeting-form-zoom.tsx:360` — Uso del índice del array como `key` al editar filas de fechas

- **Verificado en:** [`meeting-form-zoom.tsx`](file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/src/modules/reuniones/presentation/components/meeting-form-zoom.tsx#L359-L386).
- **Problema:** Tanto `<div className="date-row" key={index}>` (línea 360) como `<details className="meeting-date-notes" key={dateMode + "-" + index + "-notes"}>` (línea 383) usan `index` como clave.
- **Efecto en el usuario:** Si el usuario abre el desplegable `<details>` de notas en el encuentro 2 y luego elimina el encuentro 1, el estado `open` del `<details>` y el foco quedan asociados al índice equivocado.
- **Mejora propuesta:** Incluir un identificador local estable (`id: string`) en cada objeto `MeetingDate` al crearlo o generarlo en recurrencia y usar `key={date.id}`.
- **Esfuerzo estimado:** **S**

---

### Prioridad Baja

#### 16. `app/(gestion)/reuniones/nueva/nueva-reunion.module.css:279-1052` — Tres bloques `@media (max-width: 760px)` redundantes y reglas duplicadas

- **Verificado en:** [`nueva-reunion.module.css`](<file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/app/(gestion)/reuniones/nueva/nueva-reunion.module.css#L279-L1052>).
- **Problema:** El archivo acumula cuatro iteraciones históricas (líneas 279, 355, 537 y 838) que redefinen `.meeting-form-steps` (`position: sticky` → `static` → `sticky` → `static` → `sticky`), `.programsAction` y `.form-actions` una encima de otra. Además usa radios de `14px`–`16px` que se apartan del criterio de `docs/ui-ligera.md` (≤ 8 px).
- **Efecto en el usuario:** Mayor peso de CSS descargado y riesgo de regresiones visuales al tocar cualquier selector móvil del formulario.
- **Mejora propuesta:** Consolidar los cuatro bloques `@media (max-width: 760px)` en uno solo conservando únicamente los valores finales vigentes (bloque de líneas 838–1051) y usando las variables de [`app/brand.css`](file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/app/brand.css#L1-L77).
- **Esfuerzo estimado:** **M**

#### 17. `src/components/migracion-zoom-aplicar-control.tsx:143-149` — Pestañas de filtro con `role="group"` y `aria-pressed` sin indicar cantidad de resultados al filtrar

- **Verificado en:** [`migracion-zoom-aplicar-control.tsx`](file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/src/components/migracion-zoom-aplicar-control.tsx#L137-L150).
- **Problema:** Al escribir en el buscador (`input type="search"`), los contadores de los botones de categoría muestran el total fijo (`vistaPrevia.conteos.*`) y no existe un anuncio `aria-live="polite"` que informe cuántos encuentros quedaron visibles (`visibles.length`).
- **Efecto en el usuario:** Usuarios con lector de pantalla (y usuarios visuales cuando combinan búsqueda por texto + categoría) no saben cuántos encuentros coinciden con la búsqueda actual.
- **Mejora propuesta:** Añadir un contador breve con `role="status"` y `aria-live="polite"` debajo de los filtros cuando hay búsqueda activa (`Mostrando ${visibles.length} encuentros`).
- **Esfuerzo estimado:** **S**

#### 18. Hueco de pruebas automatizadas de interfaz para componentes cliente de Zoom

- **Verificado en:** [`package.json`](file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/package.json#L48-L81).
- **Problema:** El proyecto cuenta con `vitest` para pruebas de dominio/servicios, pero no tiene pruebas de renderizado o accesibilidad para [`ZoomLinkStatus`](file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/src/components/zoom-link-status.tsx), [`ZoomJoinActions`](file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/src/components/zoom-join-actions.tsx), [`ReunionZoomEncuentros`](file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/src/modules/reuniones/presentation/components/reunion-zoom-encuentros.tsx) ni [`MigracionZoomAplicarControl`](file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/src/components/migracion-zoom-aplicar-control.tsx).
- **Efecto en el usuario:** Errores como clases CSS inexistentes (`is-listo` en vez de `status-ok`), botones sin `disabled={pending}` o `role="status"` dentro de `<button>` llegan sin detección en CI.
- **Mejora propuesta:** Agregar tests en Vitest (usando `react-dom/server` `renderToStaticMarkup` sin sumar dependencias pesadas, o configurando `@testing-library/react`) que verifiquen:
  1. Clases semánticas y visibilidad del botón `"Reintentar"` según `esAdmin` y `estado` en `ZoomLinkStatus`.
  2. Nombres accesibles contextuales y estructura fuera del `<button>` en `ZoomJoinActions`.
  3. Atributos `disabled` y renderizado de estados en `ReunionZoomEncuentros`.
- **Esfuerzo estimado:** **M**

---

## 3. Requieren decisión de producto

1. **Visibilidad de reuniones pasadas/canceladas en el detalle de una serie Zoom (`ReunionZoomEncuentros`):** Hoy se listan todos los encuentros de la serie juntos en orden cronológico sin separar próximos de realizados ni ocultar cancelados (a diferencia de la lista principal que separa `"Próximas"` y `"Pasadas"`). Definir si en series largas (p. ej. 20 clases semestrales) los encuentros pasados/cancelados deben agruparse o colapsarse por defecto.
2. **Confirmación de cancelación de encuentro o serie (`window.confirm` en `reunion-zoom-encuentros.tsx:91,96`):** Hoy usa el diálogo nativo del navegador con una sola línea (`"¿Cancelar toda la serie de encuentros?"`), sin indicar cuántos encuentros se cancelarán ni si se enviarán avisos a docentes/asistentes. Definir si se mantiene el `confirm` nativo con un texto más explícito o si requiere un modal de confirmación como el de migración.
3. **Qué ve un docente cuando el enlace está en `ERROR` o `ATENCION`:** En [`ZoomLinkStatus`](file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/src/components/zoom-link-status.tsx#L50), solo `ADMINISTRACION` tiene el botón `"Reintentar"`. Un docente ve `"Error al crear el enlace"` o `"Enlace listo, cambios sin sincronizar"` sin indicación de qué hacer ni a quién contactar. Definir si el docente también puede reintentar o si debe mostrarse un texto de ayuda breve.
4. **Criterio de radios y sombras (`docs/ui-ligera.md` vs. implementación actual):** La guía [`docs/ui-ligera.md`](file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/docs/ui-ligera.md#L9) indica _"Mantener radios de 8px o menos"_, pero [`brand-refresh.css`](<file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/app/(gestion)/brand-refresh.css>), [`nueva-reunion.module.css`](<file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/app/(gestion)/reuniones/nueva/nueva-reunion.module.css>) y [`migracion-zoom-aplicar-control.module.css`](file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/src/components/migracion-zoom-aplicar-control.module.css) usan radios de `10px` a `20px`. Conviene decidir si se actualiza `docs/ui-ligera.md` para reflejar el diseño actual (`brand-refresh`) o si se restringen los radios nuevos a `var(--radius-lg)` (`8px`).
5. **Soporte de modo oscuro:** El proyecto fija `colorScheme: "light"` en [`app/layout.tsx:28`](file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/app/layout.tsx#L28) y `:root { color-scheme: light; }` en [`app/globals.css:1-3`](file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/app/globals.css#L1-L3), con numerosos fondos `#ffffff` cableados. Si no está previsto soportar modo oscuro en esta etapa, conviene documentarlo explícitamente para no mezclar variables con hexadecimales fijos sin criterio.

---

## 4. Mejoras que se pueden repartir en paralelo (agrupadas por archivo)

Los siguientes **5 paquetes de trabajo** no comparten archivos entre sí y pueden resolverse en paralelo sin conflictos de merge:

- **Paquete A — Componentes compartidos de enlace Zoom:**
  - [`src/components/zoom-join-actions.tsx`](file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/src/components/zoom-join-actions.tsx) (Mejoras #3 y #4: sacar `role="status"` del `<button>`, prop opcional `contexto` para nombre accesible e indicación de pestaña nueva).
  - [`src/components/zoom-link-status.tsx`](file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/src/components/zoom-link-status.tsx) (Mejoras #2 y #4: mapear a `.status-ok` / `.status-warning` / `.status-neutral` / `.status-error`, separar botón `"Reintentar"` del badge y agregar `contexto` opcional).

- **Paquete B — Detalle de reunión Zoom y sus estilos:**
  - [`src/modules/reuniones/presentation/components/reunion-zoom-encuentros.tsx`](file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/src/modules/reuniones/presentation/components/reunion-zoom-encuentros.tsx) (Mejoras #4, #5, #8 y #11: foco al editar, `disabled={pending}`, alerta superior estilizada, etiquetas y colores de estado de instancia).
  - [`app/(gestion)/meeting-detail-v2.css`](<file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/app/(gestion)/meeting-detail-v2.css>) (Mejora #1: estilos de tarjetas, grillas y responsive para `.zoom-encuentros`, `.zoom-join-actions` y `.zoom-link-status`).

- **Paquete C — Lista de reuniones Zoom:**
  - [`src/bootstrap/ui/reuniones/reuniones-lista-zoom-page.server.tsx`](file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/src/bootstrap/ui/reuniones/reuniones-lista-zoom-page.server.tsx) (Mejoras #7, #13 y #14: quitar `aria-label` duplicados en filtros, integrar `"Migración a Zoom"` al header, mejorar estado vacío con acción `"Limpiar filtros"`).
  - [`app/(gestion)/reuniones/reuniones-zoom.module.css`](<file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/app/(gestion)/reuniones/reuniones-zoom.module.css>) (Mejora #7: alturas mínimas de 44 px, bordes y `font-size: 16px` en `.filters`).

- **Paquete D — Formulario de nueva reunión Zoom:**
  - [`src/modules/reuniones/presentation/components/meeting-form-zoom.tsx`](file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/src/modules/reuniones/presentation/components/meeting-form-zoom.tsx) (Mejora #15: claves estables `date.id` en filas de fechas).
  - [`src/modules/reuniones/presentation/components/meeting-creation-dialog.tsx`](file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/src/modules/reuniones/presentation/components/meeting-creation-dialog.tsx) (Mejora #6: foco inicial en el diálogo al terminar o montar).
  - [`app/(gestion)/reuniones/nueva/nueva-reunion.module.css`](<file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/app/(gestion)/reuniones/nueva/nueva-reunion.module.css>) (Mejora #16: limpieza de `@media (max-width: 760px)` duplicados).

- **Paquete E — Pantalla de migración Meet → Zoom:**
  - [`src/components/migracion-zoom-aplicar-control.tsx`](file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/src/components/migracion-zoom-aplicar-control.tsx) (Mejoras #6, #12 y #17: foco/Escape en modal, traducción de `resultado`/`etapa`, anuncio de cantidad filtrada).
  - [`src/components/migracion-zoom-aplicar-control.module.css`](file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/src/components/migracion-zoom-aplicar-control.module.css) y [`src/components/excepcion-meet-control.module.css`](file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/src/components/excepcion-meet-control.module.css) (Mejoras #9 y #10: objetivos táctiles ≥ 44 px y ajuste de `bottom` de `.actionBar` sobre `.mobile-nav`).

---

## 5. No verificado

Por tratarse de una auditoría estática de lectura de código sin ejecución en navegador ni base de datos conectada, no se pudo comprobar:

- **Renderizado visual real y CLS (Cumulative Layout Shift)** en motores Blink/WebKit/Gecko ni el comportamiento exacto del teclado virtual en iOS Safari / Chrome Android al abrir los selectores nativos `<input type="date">` y `<input type="time">`.
- **Lectura real en lectores de pantalla** (NVDA, VoiceOver, TalkBack) para confirmar cómo anuncian la transición entre los estados `"saving"` y `"done"` de [`MeetingCreationDialog`](file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/src/modules/reuniones/presentation/components/meeting-creation-dialog.tsx).
- **Tiempos de respuesta y volumen real de datos en producción** en [`MigracionZoomPage`](<file:///C:/Users/Iván/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/app/(gestion)/reuniones/migracion-zoom/page.tsx>) (que renderiza todas las filas de `vistaPrevia.filas` sin paginación cliente ni virtualización; si el lote supera varios cientos de encuentros, puede degradar el filtrado en dispositivos móviles de gama media/baja).
- **Textos exactos devueltos por la API** en los campos `error`, `message` y `warning` de `/api/v1/reuniones/...` cuando ocurren fallos de provisión con la API de Zoom.
