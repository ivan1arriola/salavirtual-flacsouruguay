# Seguimiento y registro de decisiones

Estado inicial: propuesta documental, sin cambios de aplicación.

## Estado de épicas

- [ ] E01 Auditoría integral.
- [ ] E02 Arquitectura de información.
- [ ] E03 Sistema de diseño.
- [ ] E04 Shell y navegación.
- [ ] E05 Agenda y series.
- [ ] E06 Fichas.
- [ ] E07 Monitoreo.
- [ ] E08 Dashboards.
- [ ] E09 Comunidad.
- [ ] E10 Biblioteca.
- [ ] E11 Informes.
- [ ] E12 Sistema.
- [ ] E13 Accesibilidad y regresión.
- [ ] E14 Contracción del legado.

No marcar una épica completa por la creación de su issue, PR o documento. Requiere evidencia y aceptación.

## Decisiones iniciales propuestas

- ADR-01: organización por dominios de experiencia, no por proveedor.
- ADR-02: conservar tres dashboards y navegación por rol.
- ADR-03: unificar presentación manteniendo capacidades y autorización específicas.
- ADR-04: mantener compatibilidad de rutas y datos históricos.
- ADR-05: ejecución incremental sobre main, sin rama permanente masiva.
- ADR-06: no incluir funcionalidades nuevas ni cambios de permisos sin aprobación separada.

Pendiente de revisión: límites de Informes, organización interna de Comunidad, ruta canónica de encuentro, relación entre agenda y series, acceso global a notificaciones y alcance de equivalencias Meet/Zoom.

## Formato de registro por incremento

Fecha, épica/tarea, responsable, PR/issue, base y destino, decisión, alternativas, justificación, riesgos, pruebas/evidencia, estado, dependencias y rollback.

## Siguiente incremento

E01.1: completar catálogo de vistas, capturas y estados con acceso autorizado; después E01.2, matriz de permisos y acciones. No iniciar cambios de navegación antes de aprobar E02. El PR de este plan no crea automáticamente issues ni un GitHub Project.
