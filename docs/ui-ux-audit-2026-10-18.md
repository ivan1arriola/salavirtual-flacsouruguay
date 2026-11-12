# Auditoría UI/UX F0 — Sala Virtual FLACSO

Fecha: 2026-10-18  
Base revisada: `origin/main` en `98a3340`  
Alcance: inventario estático de rutas, navegación, dashboards, estilos y componentes. No se evaluó una sesión real ni se tomó una nueva captura del entorno productivo.

## Inventario por rol

La aplicación autenticada se sirve desde `app/(gestion)/layout.tsx`. El layout resuelve el usuario activo y su rol desde la base antes de renderizar el shell. La navegación visible por rol se define en `src/components/app-navigation.ts`; las políticas de autorización continúan en servicios y páginas del servidor.

| Rol                     | Navegación principal observada                                                                                                                                    | Rutas y funciones relacionadas                                                                                                                                                                                                                                                                                                  |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Administración          | Inicio, Agenda, Reuniones, Monitoreo, Nueva reunión; Grabaciones y archivos, Personas y programas, Asistentes de monitoreo; Centro de operaciones y Configuración | `/`, `/reuniones`, `/reuniones?vista=encuentros`, `/reuniones?vista=series`, `/reuniones/nueva`, `/monitoreo`, `/grabaciones`, `/usuarios`, `/asistentes`, `/centro-operaciones`, `/configuracion`; herramientas técnicas bajo `/reuniones/buscar-meet`, `/reuniones/duplicados`, además de históricos y operaciones de reunión |
| Docentes                | Inicio, Mi agenda, Nueva reunión, Mis programas; Grabaciones, Notificaciones, Mi perfil                                                                           | `/`, `/reuniones`, `/reuniones/nueva`, `/mis-programas`, `/grabaciones`, `/notificaciones`, `/mi-perfil`, `/mi-historico`                                                                                                                                                                                                       |
| Asistentes de monitoreo | Inicio, Mi agenda, Agenda abierta, Mis monitoreos, Historial; Grabaciones, Notificaciones, Mi perfil                                                              | `/`, `/mi-agenda`, `/agenda-abierta`, `/operacion/[instanciaId]`, `/grabaciones`, `/notificaciones`, `/mi-perfil`; el acceso anterior `/cobertura-asistencias` redirige a `/monitoreo`                                                                                                                                          |

La portada (`app/(gestion)/page.tsx`) selecciona un dashboard específico para cada rol: `admin-dashboard`, `teacher-dashboard` y `assistant-dashboard`. Administración tiene listas/timeline y triage; docentes ven próximas clases y grabaciones; asistentes ven agenda, oportunidades y resumen de horas. La implementación por rol existe y debe validarse visualmente contra el orden prioritario definido para cada dashboard.

## Inventario de estilos y componentes

- Hay **30 hojas CSS** bajo `app/`, de las cuales **26** están en `app/(gestion)/`.
- `app/(gestion)/layout.tsx` importa **22 hojas globales** para todas las rutas autenticadas. Entre ellas hay capas generales (`gestion.css`, `ux-polish.css`, `brand-refresh.css`, `profile-navigation-refresh.css`) y hojas por área (`agenda-*`, `assistant-*`, `meeting-*`, `settings.css`, `operations.css`).
- Selectores compartidos como `.app-frame`, `.sidebar`, `.workspace` y `.content-section` aparecen en `gestion.css` y `brand-refresh.css`; botones y cabeceras también reciben reglas globales de `ux-polish.css`. La cascada depende del orden de importación del layout.
- Existen componentes más aislados mediante CSS Modules en centro de operaciones, búsqueda, nueva reunión y algunos widgets del dashboard. Esos límites son un buen patrón para nuevas pantallas.
- Los tokens de marca se definen globalmente; el sistema usa `#2c4777` como azul principal. `brand-refresh.css` agrega fondos radiales y sombras a shell/tarjetas que conviene revisar bajo el principio de evitar decoración sin función.

## Hallazgos priorizados

### P1 — Personas y Programas aparecen en espacios separados

La navegación administrativa presenta `/usuarios` como “Personas y programas”, pero `app/(gestion)/usuarios/page.tsx` solo lista identidades e invitaciones. La administración de programas se muestra en `Configuración > Programas` dentro de `ProgramMembersConfig`. Esto divide dos tareas relacionadas y no coincide con el nombre del acceso principal.

El gestor de programas también solicita “Unidad académica” al crear y editar programas y usa ese dato para mostrar y buscar. El usuario aclaró que los programas son las unidades académicas para este flujo. Hay que quitar el concepto de la interfaz sin borrar a ciegas el campo persistido `unidadAcademicaId`; las ediciones que no incluyan ese campo deben conservar el dato existente hasta que se decida una migración de datos.

### P1 — El sistema visual se construyó por capas acumulativas

Las 22 hojas globales importadas desde un solo layout y los selectores repetidos de shell hacen que cambios pequeños puedan afectar otras rutas. No se debe borrar una hoja por nombre: primero hay que mapear selectores y usos, mover reglas por componente y validar cada paso.

### P2 — Herramientas especializadas y rutas históricas

La navegación principal ya agrupa el trabajo por rol y mantiene las herramientas Meet fuera del primer nivel, lo cual coincide con la arquitectura solicitada. Hay rutas auxiliares y alias de monitoreo que deben conservarse al reorganizar la información; el acceso móvil también depende de distinguir los cuatro destinos principales del menú “Más”.

### P2 — Falta evidencia visual integral en esta auditoría

El código confirma layout móvil inferior, menú secundario desplegable, media queries de agenda y detalles de configuración responsive. El inventario estático no demuestra operación por teclado, lector de pantalla, ausencia de errores de consola ni calidad visual en teléfonos. Esas verificaciones quedan para la fase de cada pantalla y F7.

## Recomendación por fases

1. F1: consolidar tokens y patrones nuevos de forma incremental; no hacer una sustitución masiva de las CSS existentes.
2. F2: conservar el shell por rol actual y validar navegación lateral/móvil con rutas largas, estados activos y alias.
3. F3: contrastar los tres dashboards implementados con los órdenes de prioridad funcionales de la especificación.
4. F4: integrar Personas y Programas en el punto de entrada administrativo existente; retirar “Unidad académica” de la UI sin perder datos previos; probar altas, edición, membresías e invitaciones.
5. F5–F6: seguir monitoreo, grabaciones y configuración sobre el mismo sistema de estados y formularios.
6. F7: validar recorridos completos en viewport móvil y escritorio, teclado y lectores de pantalla, además de logs de consola.

## Verificación realizada

- Inventario de páginas y layouts con `rg --files app`.
- Inspección de `app-navigation.ts`, `AppShell`, layout autenticado y entrada de dashboards.
- Conteo de CSS y revisión de las hojas globales compartidas.
- Lectura de las pantallas `/usuarios`, `Configuración > Programas` y alias de monitoreo.
- No se ejecutaron pruebas: este entregable es una auditoría de lectura y no modifica lógica de producto.
