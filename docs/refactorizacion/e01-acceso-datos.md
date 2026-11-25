# E01.3 — Clasificación de acceso a datos de páginas

Base: `a15943bc1ca3928d1990c8fb59d963527c2e2cbe`. Se inspeccionaron los 42 archivos page.tsx y se clasificaron los 23 que importan directamente src/lib/db. Los wrappers y las páginas que delegan sin importar db no forman parte de esta clasificación; sus dependencias transitivas siguen siendo relevantes.

## Consultas Prisma directas (13)

Estas páginas llaman a delegados de Prisma en su propia implementación; algunas también inyectan db en servicios. La prioridad de extracción depende del alcance de los datos y de las responsabilidades, no solo de la existencia del import.

- S36 /configuracion/correo: configuracionCorreoSes.findUnique y auditoria.findMany (líneas 18–19). Separar lectura de configuración y diagnóstico de entrega; conservar límite de 75 auditorías.
- S34 /configuracion/zoom: configuracionZoom.findUnique (línea 25); además, servicios de configuración y credenciales. Entregar a la vista indicadores y campos explícitos, no secretos.
- S14 /docentes/[usuarioId]/reuniones: usuario.findFirst e instanciaSala.findMany (24, 32). Lectura de actividad del docente para administración; conservar selección por ID y rol, orden y clasificación temporal.
- S29 /mi-perfil: usuario.findUnique (229). Identidad propia por actor.id y preferencias; preservar cambio obligatorio de contraseña.
- S25 /mis-clases: instanciaSala.findMany (52). Lectura académica restringida a programas activos y asociaciones docentes activas; preservar paginación y margen temporal.
- S26 /mis-programas: usuario.findUnique y programa.findMany (34, 47). Consulta propia y catálogo activo. El guard permite DOCENTE y ADMINISTRACION activos; corregir la clasificación anterior de acceso exclusivamente docente.
- S16 /monitoreo/gestion: instanciaSala.findMany (74). Cobertura futura, filtros, contadores y agrupación por día. Consolidar el modelo de lectura con monitoreo sin perder criterios de estado.
- S17 /monitoreo/gestionar/[instanciaId]: instanciaSala.findUnique y asistenteTecnico.findMany (26, 55), además de consultarDisponibilidadCobertura (67). Separar elegibilidad, estado de cobertura y representación de asistentes.
- S28 /notificaciones: notificacion.findMany y count (36, 41). Mantener ámbito actor.id, límite de 80 y conteo de no leídas.
- S11 /reuniones/[solicitudId]/encuentros/[instanciaId]/asistencia: instanciaSala.findUnique y eventoProveedor.findFirst (143, 176). Verifica pertenencia de instancia a serie y permiso de programa. También contiene obtención de credenciales Workspace y lectura de planilla externa. Separar consulta autorizada y adaptadores de evidencia Meet/Zoom.
- S22 /usuarios/[usuarioId]: usuario.findUnique y programa.findMany (32, 42). Lectura administrativa de identidad, cuentas y programas. Proyectar solo campos necesarios; passwordHash se usa para derivar un booleano y no debe incluirse en un DTO de presentación.
- S21 /usuarios: seis expresiones de consulta entre las líneas 52 y 105, condicionadas por vista. Agrupa personas, conteos, solicitudes de acceso y programas. Separar modelos de lectura por tarea.
- S02 /completar-registro: usuario.findUnique y programa.findMany (23, 31). Mantener condición de primer registro y guard de cuenta activa.

## Inyección de db en servicios (9)

No se encontraron llamadas directas a delegados Prisma en estas páginas. La inyección es composición y no debe confundirse con acceso directo de presentación a una tabla.

- S31 /centro-operaciones/zoom: resolveSessionActor y leerInconsistenciasAgendaZoom.
- S33 /configuracion/google: obtenerDatosPaginaConfiguracion.
- S38 /configuracion/historico: consultarRegistrosZoomImportados.
- S37 /configuracion/notificaciones: obtenerDatosPaginaConfiguracion.
- S32 /configuracion: obtenerDatosPaginaConfiguracion y obtenerCredencialesZoom.
- S35 /configuracion/salas: obtenerDatosPaginaConfiguracion.
- S27 /grabaciones: resolveSessionActor y obtenerCredencialPrincipalGoogleWorkspace; el listado usa una fachada distinta. Revisar si es necesario cargar configuración antes de comprobar esAdmin para el enlace de carpeta general.
- S13 /reuniones/duplicados: resolveSessionActor y listarCasosRevisionDuplicados.
- S01 /acceso: puedeRedirigirAlPanel, que delega a resolveSessionActor y comprueba cuenta activa.

## Solo identidad directa (1)

- S12 /reuniones/buscar-meet: db se pasa exclusivamente a resolveSessionActor (línea 21); buscarMeet recibe el actor y se resuelve en bootstrap. La consulta de la búsqueda ya está encapsulada.

No se detectaron imports incidentales sin uso en estas 23 páginas.

## Hallazgo E01-AUTH-01: rol de sesión frente a rol actual

Prioridad alta de corrección y prueba, no una explotación verificada. auth.ts usa sesión JWT: el callback jwt escribe token.role cuando recibe user y session copia ese claim. No relee el rol actual en cada llamada a auth. resolveSessionActor consulta id, rol y activo en PostgreSQL.

El layout autenticado resuelve actor actual, pero no constituye un guard suficiente para todas las páginas hijas. El comentario de require-admin-page.ts reconoce que el layout no se vuelve a ejecutar en toda navegación interna.

Se verificaron nueve páginas con datos administrativos que dependen de un guard local basado únicamente en el claim:

- Las siete páginas bajo /configuracion usan requireAdminPage, que solo comprueba session.user.role.
- /usuarios y /usuarios/[usuarioId] comprueban directamente session.user.role antes de sus consultas.
- Adicionalmente, /centro-operaciones y /historico usan el mismo patrón; el primero muestra navegación y el segundo redirige. No se contabilizan como otras dos lecturas directas de datos sensibles.

La auditoría F9 y PR #102 corrigieron el patrón en rutas API concretas, no en estas páginas. Se requiere un guard de administración activa basado en actor actual y su adopción coherente. Separar el cambio de seguridad de la reorganización visual, conservar redirecciones esperadas y no alterar los permisos legítimos.

Pruebas requeridas: administrador activo autorizado; docente y asistente denegados; sesión anterior de un administrador degradado; cuenta inactiva o eliminada; navegación interna con layout persistente y acceso directo. Comprobar que los datos de administración no se consultan ni se renderizan tras denegación. Usar usuarios sintéticos y entorno aislado. No se ejecutó una prueba real de explotación.

## Límites objetivo para E02

- La ruta valida entrada y compone el caso de uso; no debe depender de un layout para autorizar lecturas sensibles.
- El modelo de lectura se responsabiliza de filtros de alcance y proyección mínima. El componente de presentación recibe datos tipados, no un cliente Prisma ni credenciales.
- La resolución de identidad puede centralizarse en un guard server compartido, sin copiar lógica por página.
- La consulta de registros de asistencia debe separar credenciales, lectura externa y presentación. Mantener fuente y estado de evidencia por proveedor.
- No extraer servicios que solo reenvíen parámetros si no aportan un límite real. La inyección de dependencias existente es válida.

## Estado

Se completa la clasificación de las 23 páginas dentro de E01.3. No se declara completa la revisión transitiva de bootstrap ni la matriz de permisos. La revisión visual y las pruebas negativas siguen pendientes.
