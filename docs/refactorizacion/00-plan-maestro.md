# Plan maestro de refactorización integral de Sala Virtual v1.0

Estado: propuesta para revisión. Fecha: 2026-11-25. Línea base: `4ce11ebd4ceffa17467491b252e1e256f28deda3`.

## Propósito

Convertir Sala Virtual en un sistema coherente de gestión de la actividad académica virtual de FLACSO Uruguay, organizado según las tareas de administración, docentes y asistentes de monitoreo. La intervención es de arquitectura de información, experiencia de usuario y consolidación progresiva de presentación y responsabilidades técnicas.

## Alcance y reglas

- Se permite modificar profundamente rutas, componentes, estilos y adaptadores internos cuando exista justificación y paridad comprobada.
- No se pierde ninguna función vigente, dato histórico, enlace compartido ni restricción de autorización.
- Mantener el monolito modular, la separación de dominio, aplicación, infraestructura y presentación y los controles de arquitectura existentes. No introducir un framework UI nuevo por defecto.
- Preservar identidad institucional, dashboards por rol, acceso móvil y operación actual. Zoom es el proveedor de nuevas reuniones; Meet sigue disponible para casos existentes e históricos. La interfaz académica será neutral respecto al proveedor, sin ocultar diferencias de capacidades.
- No introducir funcionalidades de producto nuevas, migraciones destructivas ni cambios de permisos bajo la etiqueta de refactorización. Cualquier ampliación exige decisión separada.
- Mantener las reglas de AGENTS.md y los planes técnicos vigentes. Consultar el código y las pruebas ante contradicciones documentales y registrar la resolución.
- Trabajar mediante PR pequeños y reversibles sobre main. No desactivar controles de CI ni sustituir pruebas reales por una afirmación de conformidad.
- No usar reuniones reales ni datos sensibles en pruebas de mutación. Usar entornos y cuentas autorizados, datos sintéticos y proveedores simulados.

## Resultados verificables

- Un catálogo de pantallas y flujos con trazabilidad entre origen y destino.
- Un único modelo de navegación por rol para escritorio y móvil.
- Un vocabulario consistente de serie, encuentro, monitoreo, cobertura y asistencia.
- Fichas de serie y encuentro coherentes entre proveedores; acciones específicas disponibles según capacidades y permisos.
- Componentes compartidos con accesibilidad, estados y criterios responsive comprobados.
- Reducción de duplicación demostrada mediante inventarios comparables antes y después, sin imponer un número arbitrario de rutas.
- Todos los casos críticos cubiertos por regresión y los controles obligatorios de CI aprobados antes de integrar.

## Documentos rectores

- [Inventario actual](01-inventario-actual.md)
- [Diagnóstico](02-diagnostico.md)
- [Arquitectura objetivo](03-arquitectura-objetivo.md)
- [Navegación por rol](04-navegacion-por-rol.md)
- [Sistema de diseño](05-sistema-de-diseno.md)
- [Matriz de permisos](06-matriz-de-permisos.md)
- [Migración de rutas](07-migracion-de-rutas.md)
- [Plan de implementación](08-plan-de-implementacion.md)
- [Criterios de aceptación](09-criterios-de-aceptacion.md)
- [Seguimiento y decisiones](10-seguimiento.md)

## Gobernanza

El responsable de FLACSO aprueba decisiones funcionales y de arquitectura de información. Cada PR identifica épica, alcance, evidencia, contratos afectados y rollback. Un coordinador mantiene el mapa y resuelve conflictos entre agentes. Ningún agente modifica un componente transversal simultáneamente con otro sin coordinación.

Este PR solo establece la propuesta documental. La auditoría visual autenticada, matriz exhaustiva de acciones y pruebas de comportamiento son parte de E01; el inicio de cambios funcionales depende de las puertas de aceptación del plan.
