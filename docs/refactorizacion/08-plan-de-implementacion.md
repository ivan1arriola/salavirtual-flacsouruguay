# Plan de implementación por épicas

Los incrementos son independientes, pequeños y revisables. No hay plazo fijo aprobado. E13 es transversal; E14 es posterior a la paridad. Cada tarea tendrá issue o referencia documental, PR, dependencias, evidencia y aceptación.

## Fase 1. Fundamentos

### E01 — Auditoría integral (P0)

- E01.1 Completar inventario S01–S38 y variantes, flujos y capturas por rol.
- E01.2 Mapear políticas, APIs, server actions y efectos externos; construir matriz de permisos exhaustiva.
- E01.3 Inventariar componentes, estilos, duplicación y dependencias; medir línea base.
- E01.4 Registrar tareas críticas de cada rol y escenarios de prueba.
- Salida: cobertura completa, incertidumbres explícitas y evidencia reproducible.

### E02 — Arquitectura de información (P0; depende de E01)

- E02.1 Aprobar dominios, vocabulario, mapa de navegación y destinos.
- E02.2 Aprobar ficha serie/encuentro, propietarios de funciones y estrategia de compatibilidad.
- E02.3 Registrar decisiones rechazadas y actualizar documentación contradictoria.
- Salida: arquitectura aprobada y trazabilidad de todas las funciones.

### E03 — Sistema de diseño (P0; depende de E02)

- E03.1 Consolidar tokens y componentes de encabezado, acciones, formularios y estados.
- E03.2 Definir patrones listados/detalles y accesibilidad.
- E03.3 Crear catálogo y tests; migrar una pantalla piloto.
- Salida: piloto aprobado en tres tamaños y sin regresión.

### E04 — Shell y navegación (P0; depende de E02/E03)

- E04.1 Centralizar destinos y estado activo por rol.
- E04.2 Migrar shell escritorio/móvil, Más, cuenta, notificaciones y retorno contextual.
- E04.3 Validar tours, enlaces y navegación teclado.
- Salida: rutas y acciones existentes localizables para los tres roles.

## Fase 2. Núcleo académico y operativo

### E05 — Agenda y series (P1; depende de E04)

- Inventariar diferencias Meet/Zoom; extraer modelo de lectura y componentes compartidos.
- Unificar agenda y vistas de series/encuentros; mantener filtros y proveedor como atributo.
- Verificar programación, recurrencia, edición, cancelación, corrección de enlaces y cuentas.

### E06 — Fichas de serie y encuentro (P1; depende de E05)

- Definir contratos de presentación y capacidades por proveedor.
- Migrar ficha de serie y luego encuentro: preparación, operación, cierre y archivos.
- Mantener controles de asistencia, evidencia bruta, grabaciones y retornos contextuales.

### E07 — Monitoreo (P1; depende de E06)

- Consolidar cobertura y gestión, disponibilidad previa y selección de asistentes.
- Asegurar asignar, reasignar, desasignar dejando pendiente, postular y resolver postulaciones.
- Verificar horarios académicos/monitoreo, validaciones de conflictos, horas y liquidaciones.

### E08 — Dashboards (P1; depende de E04; cerrar tras E07)

- Repriorizar acciones por rol y enlazar a destinos canónicos.
- Evitar duplicar flujos completos y preservar próximo encuentro, triage y accesos autorizados.

## Fase 3. Módulos restantes

### E09 — Comunidad (P2; depende de E04)

Separar personas/programas, unificar identidad y gestionar accesos y permisos. Mantener ficha especializada del asistente cuando su tarea lo justifique.

### E10 — Biblioteca (P2; depende de E06)

Consolidar búsqueda, filtros y recursos existentes; enlazar cada artefacto al encuentro; mantener estados de sincronización y alcance.

### E11 — Informes (P2; depende de E07/E09)

Centralizar horas, liquidaciones y registros importados existentes. Informes agregados nuevos quedan fuera hasta aprobación explícita.

### E12 — Sistema (P2; depende de E04/E05)

Separar configuración de diagnóstico; eliminar accesos redundantes sin retirar funciones; validar integraciones y preservar registros históricos.

## Fase 4. Calidad y cierre

### E13 — Accesibilidad, responsive y regresión (transversal)

Cada incremento ejecuta la matriz de aceptación y adjunta evidencia. Ejecutar pruebas autenticadas de flujos completos al cierre de cada fase.

### E14 — Contracción del legado (P3; depende de E05–E13)

Verificar consumidores, eliminar código y estilos sin uso, documentar alias restantes, comparar inventario inicial/final, revisar permisos y ejecutar validación final. No eliminar registros históricos.

## Política de ejecución

Los agentes pueden investigar en paralelo; solo un propietario por componente transversal. Una rama por incremento y merge tras revisión y CI verde. Feature flags temporales únicamente cuando sean necesarias, con propietario, prueba de ambas ramas y criterio de retiro. Toda fase termina con una revisión de avance y autorización para la siguiente.
