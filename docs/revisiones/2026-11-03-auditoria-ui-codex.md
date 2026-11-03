<!--
Auditoría de interfaz de las pantallas de reuniones Zoom, generada por Codex (codex exec, sandbox de solo lectura).
Fecha: 2026-11-03. Texto del informe tal como lo entregó el revisor. No ejecutó la aplicación en un navegador.
-->

# Auditoría de interfaz: reuniones de Zoom

## 1. Resumen

La versión es funcionalmente mínima y varias partes ya tienen controles de acceso, etiquetas de formulario y paginación.  
Los tres cambios de mayor impacto son: mejorar los nombres accesibles de las acciones repetidas; dar estilos y jerarquía propios a los encuentros y estados de Zoom; y gestionar el foco al editar o al mostrar el diálogo de creación.  
Confirmé en el código los problemas conocidos sobre `role="status"` dentro de un botón, foco al editar y el botón de edición durante una acción.  
No inspeccioné la interfaz en un navegador; las observaciones visuales son sobre el CSS y la estructura disponibles.

## 2. Mejoras

Las prioridades y esfuerzos son estimaciones de auditoría. Las líneas apuntan al lugar que conviene cambiar; cuando el hallazgo depende del CSS cargado desde el layout, indico también ese archivo.

1. **Alta — acciones repetidas sin contexto accesible.** [zoom-join-actions.tsx](/C:/Users/Iv%C3%A1n/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/src/components/zoom-join-actions.tsx:21) y [reuniones-lista-zoom-page.server.tsx](/C:/Users/Iv%C3%A1n/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/src/bootstrap/ui/reuniones/reuniones-lista-zoom-page.server.tsx:124). En cada fila, “Unirse” y “Copiar enlace” no identifican el encuentro al que corresponden. Esto dificulta navegar la lista con lector de pantalla. Pasar un nombre descriptivo desde la fila, por ejemplo `aria-label={`Unirse a ${titulo}, ${fecha}`}` y `aria-label={`Copiar enlace de ${titulo}, ${fecha}`}`. **Esfuerzo: S.**

2. **Alta — foco al abrir la edición.** [reunion-zoom-encuentros.tsx](/C:/Users/Iv%C3%A1n/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/src/modules/reuniones/presentation/components/reunion-zoom-encuentros.tsx:135). Al cambiar `editando`, el formulario aparece, pero no hay gestión explícita del foco. Quien navega por teclado puede perder el contexto o tener que encontrar los campos manualmente. Enfocar el primer campo cuando se abre la edición y devolver el foco al botón que la abrió al cancelar o guardar.

3. **Alta — acciones durante una operación.** [reunion-zoom-encuentros.tsx](/C:/Users/Iv%C3%A1n/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/src/modules/reuniones/presentation/components/reunion-zoom-encuentros.tsx:145). “Editar fecha y hora” permanece habilitado mientras `pending`; cancelar también queda disponible durante el guardado. Puede permitir abrir otro formulario o cerrar la edición en medio de una acción. Aplicar `disabled={pending}` de forma coherente a las acciones de esa fila y mantener visible el estado de guardado.

4. **Alta — `role="status"` dentro del botón.** [zoom-join-actions.tsx](/C:/Users/Iv%C3%A1n/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/src/components/zoom-join-actions.tsx:25). El texto “Copiar enlace”/“Copiado” está dentro del botón y marcado como región viva. El contenido de un botón se expone como presentacional en el árbol de accesibilidad; el anuncio no es fiable. Dejar el texto del botón sin rol y anunciar el resultado en un elemento separado: `<span role="status" className="sr-only">{copied ? "Enlace copiado" : ""}</span>`.

5. **Alta — diálogo de creación sin gestión visible de foco ni cierre.** [meeting-creation-dialog.tsx](/C:/Users/Iv%C3%A1n/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/src/modules/reuniones/presentation/components/meeting-creation-dialog.tsx:18). Tiene `role="dialog"` y `aria-modal`, pero en el componente no se ve foco inicial, contención del foco ni mecanismo de cierre durante el guardado. Puede ser difícil para teclado y lector de pantalla orientarse en el diálogo. Revisar el ciclo completo de foco, incluyendo dónde vuelve el foco cuando termina; si se mantiene como diálogo modal, asegurar foco inicial y contención.

6. **Alta — estilos propios de los controles Zoom no identificados en los CSS del alcance.** [reunion-zoom-encuentros.tsx](/C:/Users/Iv%C3%A1n/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/src/modules/reuniones/presentation/components/reunion-zoom-encuentros.tsx:101), [reuniones-zoom.module.css](/C:/Users/Iv%C3%A1n/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/app/%28gestion%29/reuniones/reuniones-zoom.module.css:1) y [layout.tsx](/C:/Users/Iv%C3%A1n/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/app/%28gestion%29/layout.tsx:27). El detalle usa `.zoom-encuentros`, `.zoom-link-status` y `.zoom-join-actions`; el módulo Zoom define estilos de la lista, pero no encontré reglas para esos selectores en los archivos de estilo revisados. El resultado puede depender de estilos genéricos de `.status` y `.primary-action`, sin una disposición adaptada a los encuentros. Añadir reglas específicas, con controles apilables en móvil y espacio claro entre fecha, enlace y acciones. **Esfuerzo: M.**

7. **Media — jerarquía y contraste de estados del enlace.** [zoom-link-status.tsx](/C:/Users/Iv%C3%A1n/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/src/components/zoom-link-status.tsx:8). Los estados “listo”, “pendiente”, “error” y “cambios sin sincronizar” se presentan como texto dentro de una clase de estado común; el error de reintento aparece como `<small role="alert">`. No se ve en este componente una separación visual clara entre estado y acción. Dar estilos distintos por estado, mantener el texto explícito y ubicar el error junto al botón de reintento, con `aria-live` adecuado. El contraste real debe medirse en el navegador.

8. **Media — resultado al copiar enlace sin confirmación cuando falla.** [zoom-join-actions.tsx](/C:/Users/Iv%C3%A1n/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/src/components/zoom-join-actions.tsx:9). Si `navigator.clipboard.writeText` falla, se limpia `copied` sin mostrar un mensaje. La persona no sabe si debe volver a intentar o copiar manualmente. Mostrar un mensaje breve de error en una región viva y conservar una alternativa accesible para obtener el enlace. **Esfuerzo: S.**

9. **Media — objetivos táctiles menores a 44 px en controles de Zoom.** [zoom-join-actions.tsx](/C:/Users/Iv%C3%A1n/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/src/components/zoom-join-actions.tsx:21), [zoom-link-status.tsx](/C:/Users/Iv%C3%A1n/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/src/components/zoom-link-status.tsx:51) y [reunion-zoom-encuentros.tsx](/C:/Users/Iv%C3%A1n/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/src/modules/reuniones/presentation/components/reunion-zoom-encuentros.tsx:140). No encontré alturas táctiles declaradas para esos controles en sus componentes ni reglas específicas de Zoom revisadas. En móvil, fijar `min-height: 44px` y permitir que acciones largas ocupen el ancho disponible.

10. **Media — estado vacío de la lista demasiado genérico.** [reuniones-lista-zoom-page.server.tsx](/C:/Users/Iv%C3%A1n/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/src/bootstrap/ui/reuniones/reuniones-lista-zoom-page.server.tsx:109). El mismo “No hay reuniones para mostrar” cubre búsqueda sin resultados, filtros y agenda vacía. Esto no indica si hay que limpiar filtros o crear una reunión. Ajustar el texto según filtros y período, con un enlace o acción existente para limpiar filtros cuando corresponda. **Esfuerzo: S.**

11. **Media — presentación responsive de la lista Zoom por verificar y reforzar.** [reuniones-zoom.module.css](/C:/Users/Iv%C3%A1n/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/app/%28gestion%29/reuniones/reuniones-zoom.module.css:1). El módulo tiene clases para cabecera, filtros y filas, pero la revisión estática no confirma su comportamiento real en anchos móviles. Asegurar que fecha, título, estado y botones se reordenen sin desbordar y que filtros y paginación tengan controles de al menos 44 px. **Esfuerzo: M.**

12. **Media — lista de migración puede ser densa en celular.** [migracion-zoom-aplicar-control.tsx](/C:/Users/Iv%C3%A1n/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/src/components/migracion-zoom-aplicar-control.tsx:157) y [migracion-zoom-aplicar-control.module.css](/C:/Users/Iv%C3%A1n/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/src/components/migracion-zoom-aplicar-control.module.css:1). Cada encuentro reúne fecha, badge, título, programa, datos de migración, detalles y control de excepción. La agrupación es informativa, pero su densidad puede dificultar el escaneo móvil. Confirmar en navegador; si se satura, priorizar título, fecha y estado, y dejar datos secundarios bajo los detalles existentes.

13. **Media — errores y resultados de migración no necesariamente anunciados como cambios.** [migracion-zoom-aplicar-control.tsx](/C:/Users/Iv%C3%A1n/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/src/components/migracion-zoom-aplicar-control.tsx:93). El error se guarda en estado, pero su región y rol no aparecen en el fragmento revisado; el resultado sí tiene `role="status"` más adelante. Verificar el bloque completo y anunciar el error con `role="alert"` o una región viva, además de desplazar o enfocar el resumen cuando se aplica una migración.

14. **Baja — tabulación de proveedor y período necesita confirmar el patrón de teclado.** [proveedor-tabs.tsx](/C:/Users/Iv%C3%A1n/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/src/components/proveedor-tabs.tsx:13) y [reuniones-lista-zoom-page.server.tsx](/C:/Users/Iv%C3%A1n/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/src/bootstrap/ui/reuniones/reuniones-lista-zoom-page.server.tsx:71). Son enlaces dentro de `nav` con `aria-current`, lo que puede ser apropiado para navegación entre páginas; confirmar que visualmente se distingan y que el foco de teclado sea visible. No requieren el patrón ARIA de pestañas si efectivamente navegan a otra página.

15. **Baja — CSS de apariencia clara limita soporte de modo oscuro.** [reuniones-zoom.module.css](/C:/Users/Iv%C3%A1n/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/app/%28gestion%29/reuniones/reuniones-zoom.module.css:1). En los estilos revisados aparecen mezclas explícitas con `#ffffff`; no encontré un tema oscuro asociado a estas pantallas. Si el producto debe soportarlo, usar tokens semánticos para fondo, texto, borde y estados, y comprobar contraste en ambos temas. **Esfuerzo: M.**

16. **Baja — falta una señal de carga para el refresco posterior al reintento.** [zoom-link-status.tsx](/C:/Users/Iv%C3%A1n/repositorios/FLACSO%20Uruguay/salavirtual-flacsouruguay/src/components/zoom-link-status.tsx:30). El texto cambia a “Reintentando…” y el botón se deshabilita, pero la interfaz espera `router.refresh()` para mostrar el estado actualizado. Añadir indicador de progreso accesible y conservar el contexto de la fila durante la espera.

17. **Baja — pruebas de interfaz y accesibilidad no verificadas.** No encontré pruebas en los archivos revisados porque no inspeccioné el árbol de tests completo. Recomiendo cubrir: nombres accesibles de acciones repetidas; foco al abrir/cerrar edición y diálogo; feedback de copia fallida; estados de enlace; y filtros/vacío de la lista. **Esfuerzo: M.**

## 3. Requieren decisión de producto

- **Modo oscuro:** no se desprende de los archivos revisados si es un requisito actual o futuro.
- **Acción ante fallo al copiar:** decidir si alcanza con informar el error o si debe ofrecerse además una forma visible de seleccionar/copiar el enlace.
- **Estados vacíos:** confirmar si se prefiere una explicación distinta para filtros sin resultados frente a una agenda realmente vacía.
- **Densidad de migración:** decidir qué datos deben quedar visibles de inmediato en móvil y cuáles pueden permanecer en “Ver enlace y destinatarios”.
- **Pruebas visuales automatizadas:** priorizar si se incorporan pruebas de navegador para responsive y foco; la estructura revisada no permite confirmar cobertura existente.

## 4. Mejoras que se pueden repartir en paralelo

Agrupación por archivo; cada grupo puede abordarse de forma independiente si se evita editar un mismo archivo en paralelo.

- `zoom-join-actions.tsx`: nombres accesibles, anuncio de copia y feedback de error.
- `reunion-zoom-encuentros.tsx`: gestión del foco en edición, deshabilitación durante acciones y regiones de mensaje.
- `meeting-creation-dialog.tsx`: ciclo de foco y comportamiento accesible del diálogo.
- `zoom-link-status.tsx`: jerarquía visual, carga y error de reintento.
- `reuniones-lista-zoom-page.server.tsx`: nombres con contexto para acciones, vacío contextual y estructura responsive de contenido.
- `reuniones-zoom.module.css`: estilos del detalle Zoom, objetivos táctiles, estados y tokens/tema.
- `migracion-zoom-aplicar-control.tsx` y `migracion-zoom-aplicar-control.module.css`: anuncios de resultado/error y densidad móvil; estos dos archivos conviene trabajarlos juntos.

## 5. No verificado

- No ejecuté ni inspeccioné la aplicación en navegador; por tanto, no confirmé renderizado, desbordes, contraste calculado, foco visible, flujo de teclado ni lector de pantalla.
- No comprobé datos reales para estados vacíos, listas extensas, títulos largos o errores de red.
- No revisé el árbol completo de pruebas; la recomendación sobre cobertura es una brecha sugerida, no una afirmación de ausencia de tests.
- Las reglas de `.zoom-encuentros`, `.zoom-link-status` y `.zoom-join-actions` no aparecieron en los CSS del alcance revisados; no puedo descartar estilos externos al alcance o estilos heredados que modifiquen su aspecto.
- La documentación instalada de Next.js está declarada como requisito antes de escribir código, pero esta auditoría no modifica código ni evalúa APIs de Next.js.

**Solo lectura:** no edité ni creé archivos y no hice commits.