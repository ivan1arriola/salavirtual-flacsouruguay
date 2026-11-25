# E01 — Avance de auditoría

Fecha: 2026-11-25. Base: `bfcbfc091277086b37a7ae499bc95e54fe441272`.

- E01.1: inventario técnico S01–S38 documentado. Corrección: 60 casos iniciales tras distinguir la ficha histórica Zoom. Capturas y recorridos pendientes.
- E01.2: reglas de autorización críticas y mapa inicial de mutaciones documentados. Matriz ruta/método/rol/objeto, pruebas negativas y trazabilidad de las 10 server actions pendientes. Ver [rutas y autorización](e01-rutas-y-autorizacion.md).
- E01.3: inventario de rutas API, actions, CSS, módulos y pruebas por árbol Git. Análisis estático inicial de 32 hojas globales, cascada, shell y separación Meet/Zoom. Pendiente mapa exhaustivo de consumidores y medición de acoplamiento. Ver [componentes y estilos](e01-componentes-y-estilos.md) y [arquitectura de módulos](e01-arquitectura-modulos.md).
- E01.4: casos críticos definidos en criterios de aceptación. Ejecución autenticada pendiente.

La auditoría permanece abierta; no se declara E01 completada. Antes de E02, cerrar capturas por rol, rastrear permisos de todos los métodos y medir duplicación en componentes. No iniciar cambios funcionales todavía.

Documentos: [catálogo](e01-catalogo-pantallas.md), [permisos y acciones](e01-permisos-acciones.md), [superficie técnica](e01-superficie-tecnica.md).

## Incremento: inventario reproducible y acceso a datos

El PR #281 quedó integrado con CI y workflow de inventario aprobados. Ver [resultados](e01-resultados-inventario.md).

E01.3: clasificación de las 23 páginas con import directo de db completada: 13 consultas propias, 9 inyección en servicios, 1 solo identidad. Ver [acceso a datos](e01-acceso-datos.md). Se detectó E01-AUTH-01, inconsistencia de guards administrativos basada en el rol de sesión; requiere corrección y pruebas negativas independientes. La arquitectura visual y la autorización exhaustiva siguen abiertas.
