# E01.2 — Trazabilidad de permisos y acciones críticas

Base: `bfcbfc091277086b37a7ae499bc95e54fe441272`. Inspección inicial de guards y servicios. Pendiente completar todos los métodos, server actions y pruebas negativas.

## Reglas confirmadas en código

- Layout de gestión: auth, resolveSessionActor, cuenta activa y requisito de registro. El propio layout no reemplaza controles de cada página o endpoint.
- reuniones.domain.ts: agenda completa y creación A/D; crear para otro docente solo A; asignación al crear solo A.
- permisos-programa.service.ts: actor activo; A tiene acceso; D necesita vínculo docente-programa activo y programa activo; T no tiene este permiso académico.
- Fichas de serie Meet y Zoom verifican puedeGestionarPrograma. La vista de asistencia comprueba también que instancia y solicitud correspondan.
- gestionar-encuentros.service.ts exige permiso de programa y puedeGestionarEncuentros; no autorizar mutaciones solo por acceso a lectura. Cambiar modalidad puntual o horario de monitoreo y restablecerlo son operaciones administrativas; se aplican restricciones por estado.
- gestion-cobertura.service.ts rechaza actor inactivo o rol distinto de A.
- require-admin-page.ts protege cada página de configuración; no confiar solamente en el layout.
- La biblioteca distingue A para enlace a raíz general Drive; verificar alcance de cada archivo y descarga.
- La API de control operativo GET diferencia 404 y 403; PATCH y POST delegan a funciones de bootstrap. Completar trazabilidad de sus políticas y capacidades antes de unificar.

## Mapa inicial de mutaciones

- S09 creación: POST /api/v1/reuniones; preservar idempotencia, identidad docente y proveedor Zoom.
- S10 agregar encuentro: /api/v1/reuniones/[solicitudId]/encuentros; verificar método, permisos y reglas de serie.
- S10 editar/eliminar: PATCH/DELETE /api/v1/reuniones/[solicitudId]/encuentros/[instanciaId]; actualizarEncuentro/eliminarEncuentro, sincronización de proveedor y calendario de asistente; distinguir 202 pendiente de éxito completo.
- S17 gestión de cobertura: POST /api/v1/asistencia/gestion-cobertura; gestionarCoberturaMonitoreo, sincronización posterior al commit para CONVOCAR y ASIGNAR_DIRECTO.
- S18 control operativo: GET/PATCH/POST /api/v1/reuniones/instancias/[instanciaId]/control-operativo; obtenerReunionOperativa, actualizarControlOperativoReunion, guardarRegistroAsistenciaOperativo.
- S11 asistencia: rutas conciliar, regenerar, exportar, original Zoom. Verificar autorización y procedencia por método.
- S19/S20 postulaciones, asignaciones, desvinculación, duración y calendario: familia /api/v1/asistencia. Permiso de objeto y efectos externos pendientes de desglosar.
- S21/S22 usuarios/programas: server actions y API /api/v1/usuarios; comprobar reglas de identidad, último administrador y programa sin asumir que existen controles específicos.
- S27 archivos: familia /api/v1/archivos/zoom; separar consulta, recuperación y vinculación de ocurrencias, comprobar autorización y efectos.
- S32–S37 configuración: server actions y familia /api/v1/configuracion; revisar credenciales, pruebas y sincronización, sin exponer secretos.
- S28/S29 cuenta: API notificaciones y acciones de perfil; validar propiedad de registro.
- S01–S04 autenticación y recuperación: actions respectivas y Auth.js; revisar tokens, expiración, revocación y respuestas sin enumerar cuentas.

## Casos de regresión prioritarios

- Docente activo del programa puede leer; docente ajeno y T no obtienen la ficha académica por URL directa.
- Docente del programa distinto del titular: validar lectura vs. edición; no conceder edición por pertenencia solamente.
- Usuario inactivo, sin sesión o con identificadores alterados: rechazo sin cambios de persistencia.
- Administración modifica horario de encuentro programado; distinguir validación de fecha, error externo y cambio guardado con sincronización pendiente.
- Administración desasigna sin reasignar y la cobertura queda pendiente; verificar disponibilidad y conflictos.
- Asistente asignado y no asignado: verificar operación, registros y archivos según política real.
- Acceso directo a descargas y APIs móviles: validar autorización en servidor, no menú.
- Proveedor histórico y activo coexistentes: conservar evidencia, enlace correcto y controles de rol.

## Fuentes y estado

Archivos inspeccionados: app/(gestion)/layout.tsx, src/modules/reuniones/reuniones.domain.ts, src/modules/reuniones/permisos-programa.service.ts, src/modules/reuniones/gestionar-encuentros.service.ts, src/modules/asistencia/gestion-cobertura.service.ts, las páginas de serie y asistencia, y routes de cobertura, edición y control operativo.

No se ejecutaron pruebas de autorización ni se consultaron datos de producción. Falta matriz completa de acción/método/recurso/rol/estado y resultados reproducibles; E01.2 sigue abierta.
