# Navegación por rol

La navegación se define en `src/components/app-navigation.ts` y la presenta `AppShell`. Los enlaces móviles principales son un subconjunto de esa misma definición; las opciones restantes aparecen en «Más», agrupadas por actividad. La interfaz filtra enlaces por rol, mientras que cada ruta mantiene sus verificaciones de autorización en el servidor.

## Administración

| Grupo          | Accesos                                                               |
| -------------- | --------------------------------------------------------------------- |
| Trabajo diario | Inicio, Agenda, Reuniones, Monitoreo y Nueva reunión                  |
| Recursos       | Grabaciones y archivos, Personas y programas, Asistentes de monitoreo |
| Sistema        | Centro de operaciones, Configuración                                  |

Agenda abre la vista de encuentros (`/reuniones?vista=encuentros`) y Reuniones abre la vista de series (`/reuniones?vista=series`). Buscar Meet, Duplicados y operaciones de Google Workspace se alcanzan desde el Centro de operaciones, que enlaza a las pantallas existentes.

## Docentes

Trabajo diario contiene Inicio, Mi agenda, Nueva reunión y Mis programas. Grabaciones, Notificaciones y Mi perfil están disponibles en Recursos y cuenta y en el menú móvil «Más» cuando no caben en la barra inferior.

## Asistentes de monitoreo

Monitoreo contiene Inicio, Mi agenda (`/mi-agenda?tab=mes`), Agenda abierta, Mis monitoreos (`/mi-agenda?tab=proximas`) e Historial (`/mi-agenda?tab=historico`). Grabaciones, Notificaciones y Mi perfil están agrupados en Recursos y cuenta.

La navegación mantiene las rutas históricas `/asistencia-tecnica` y `/mi-historico`; sus comportamientos existentes no se reemplazan. Los horarios y estados continúan calculándose en las páginas y servicios existentes.

## Foco y adaptación móvil

Los enlaces indican la página activa con `aria-current="page"`. Cuando varias opciones comparten ruta, el estado activo también considera el parámetro de búsqueda. La barra inferior prioriza cuatro accesos por rol; «Más» ofrece las otras secciones en un panel desplazable que respeta el área visible del teléfono.
