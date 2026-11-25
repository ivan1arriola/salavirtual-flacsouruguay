# Navegación objetivo por rol

Propuesta aprobable, no una especificación de permisos. Los destinos actuales se conservan hasta que cada incremento tenga equivalencia validada.

## Administración

- Trabajo diario: Inicio, Reuniones, Monitoreo, Biblioteca.
- Administración: Comunidad, Informes.
- Sistema: Centro de operaciones, Configuración.
- Acción destacada: Nueva reunión.
- Móvil: Inicio, Reuniones, Nueva, Monitoreo, Más.
- Más: Biblioteca, Comunidad, Informes, Centro de operaciones, Configuración.

Reuniones incluye encuentros y series; Monitoreo incluye cobertura y gestión contextual; Sistema no compite como agenda de trabajo. Informes se incorpora al menú solo cuando existe una pantalla útil con datos existentes.

## Docentes

- Inicio, Mis clases, Mis programas, Biblioteca.
- Acción destacada: Nueva reunión.
- Móvil: Inicio, Clases, Nueva, Biblioteca, Más.
- Más: Mis programas y accesos personales; mantener agenda completa autorizada como acceso contextual.

## Asistentes de monitoreo

- Inicio, Mis monitoreos, Agenda abierta, Horas e historial, Biblioteca.
- Agenda abierta incluye postulaciones como vista interna destacada.
- Móvil: Inicio, Monitoreos, Disponibles, Horas, Más.
- Más: Biblioteca y cuenta personal. No incorporar un destino de pagos nuevo si no existe un registro autorizado.

## Reglas de navegación

- Notificaciones y perfil permanecen accesibles globalmente, sin depender de un menú de sistema.
- Una definición canónica de destinos, grupos, prioridad móvil y resolución de estado activo. Los IDs son semánticos y estables, no índices de arrays.
- Un máximo de cinco posiciones en barra móvil contando Más y la acción de creación.
- Una opción no se duplica dentro del mismo nivel por razones de implementación. Los accesos contextuales se permiten si reducen pasos.
- Más se cierra al elegir un enlace, tocar fuera, pulsar Escape o usar cierre explícito; el estado activo y foco son visibles.
- Breadcrumbs o retorno contextual para detalle de serie, encuentro y entidad; preservar filtros y posición al regresar cuando sea viable.
- Validar onboarding y enlaces directos con cambios de navegación; mantener la ruta raíz como dashboard por rol.
- No esconder una función existente sin proporcionar un camino equivalente verificable.
