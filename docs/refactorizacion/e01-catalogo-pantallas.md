# E01.1 — Catálogo técnico de pantallas

Línea base: `bfcbfc091277086b37a7ae499bc95e54fe441272`. Complementa el inventario S01–S38; no sustituye la auditoría visual. A = administración, D = docente, T = asistente, P = entrada pública, R = registro condicionado a sesión. La marca (*) indica un alcance dependiente del caso de uso, pendiente de comprobar exhaustivamente. Los roles indicados son de acceso de página, no permisos para cada acción.

## S01 — /acceso

- Roles: P.
- Tarea: Credenciales, Google, errores y acceso.
- Variantes y estados a cubrir: Estado autenticado redirige; recuperación.
- Implementación: `app/acceso/page.tsx`.
- Evidencia visual y pruebas de interacción: pendientes.

## S02 — /completar-registro

- Roles: R.
- Tarea: Registro institucional y programas.
- Variantes y estados a cubrir: Sesión y necesidad de completar registro.
- Implementación: `app/completar-registro/page.tsx`.
- Evidencia visual y pruebas de interacción: pendientes.

## S03 — /recuperar-contrasena

- Roles: P.
- Tarea: Solicitar recuperación.
- Variantes y estados a cubrir: Formulario, confirmación de envío.
- Implementación: `app/recuperar-contrasena/page.tsx`.
- Evidencia visual y pruebas de interacción: pendientes.

## S04 — /restablecer-contrasena

- Roles: P.
- Tarea: Definir nueva contraseña.
- Variantes y estados a cubrir: Token, error, confirmación.
- Implementación: `app/restablecer-contrasena/page.tsx`.
- Evidencia visual y pruebas de interacción: pendientes.

## S05 — /

- Roles: A.
- Tarea: Agenda, próximos, triage, crear.
- Variantes y estados a cubrir: Dashboard administrativo.
- Implementación: `src/components/dashboard/admin/admin-dashboard.tsx`.
- Evidencia visual y pruebas de interacción: pendientes.

## S06 — /

- Roles: D.
- Tarea: Próxima clase, programas, agenda, grabaciones.
- Variantes y estados a cubrir: Dashboard docente.
- Implementación: `src/components/dashboard/teacher/teacher-dashboard.tsx`.
- Evidencia visual y pruebas de interacción: pendientes.

## S07 — /

- Roles: T.
- Tarea: Próximo monitoreo, asignaciones, horas.
- Variantes y estados a cubrir: Dashboard de asistente.
- Implementación: `src/bootstrap/ui/asistencia/assistant-dashboard.server.tsx`.
- Evidencia visual y pruebas de interacción: pendientes.

## S08 — /reuniones

- Roles: A/D.
- Tarea: Listar, filtrar, navegar a series/encuentros.
- Variantes y estados a cubrir: Meet/Zoom × serie/encuentro; período, búsqueda, densidad.
- Implementación: `src/bootstrap/ui/reuniones/reuniones-lista-page.server.tsx`.
- Evidencia visual y pruebas de interacción: pendientes.

## S09 — /reuniones/nueva

- Roles: A/D.
- Tarea: Programar Zoom y fechas; asignación admin.
- Variantes y estados a cubrir: Programas habilitados, validación, recurrencia.
- Implementación: `src/bootstrap/ui/reuniones/nueva-reunion-zoom-page.server.tsx`.
- Evidencia visual y pruebas de interacción: pendientes.

## S10 — /reuniones/[solicitudId]

- Roles: A/D.
- Tarea: Consultar serie, gestionar encuentros, personas, archivos.
- Variantes y estados a cubrir: Proveedor; titularidad para mutaciones.
- Implementación: `src/bootstrap/ui/reuniones/reunion-detalle-page.server.tsx`.
- Evidencia visual y pruebas de interacción: pendientes.

## S11 — /reuniones/[solicitudId]/encuentros/[instanciaId]/asistencia

- Roles: A/D.
- Tarea: Consultar asistencia y evidencia; regeneración admin.
- Variantes y estados a cubrir: Meet/Zoom, planilla ausente, cancelada, en curso.
- Implementación: `app/(gestion)/reuniones/[solicitudId]/encuentros/[instanciaId]/asistencia/page.tsx`.
- Evidencia visual y pruebas de interacción: pendientes.

## S12 — /reuniones/buscar-meet

- Roles: A.
- Tarea: Buscar por enlace/código, identificar serie.
- Variantes y estados a cubrir: Resultados, sin coincidencia.
- Implementación: `app/(gestion)/reuniones/buscar-meet/page.tsx`.
- Evidencia visual y pruebas de interacción: pendientes.

## S13 — /reuniones/duplicados

- Roles: A.
- Tarea: Revisar coincidencias.
- Variantes y estados a cubrir: Pendientes, actualizar, falsos.
- Implementación: `app/(gestion)/reuniones/duplicados/page.tsx`.
- Evidencia visual y pruebas de interacción: pendientes.

## S14 — /docentes/[usuarioId]/reuniones

- Roles: A.
- Tarea: Consultar actividad docente.
- Variantes y estados a cubrir: Identidad y reuniones.
- Implementación: `app/(gestion)/docentes/[usuarioId]/reuniones/page.tsx`.
- Evidencia visual y pruebas de interacción: pendientes.

## S15 — /monitoreo

- Roles: A.
- Tarea: Agenda de cobertura y filtros.
- Variantes y estados a cubrir: Estado, búsqueda, fecha.
- Implementación: `src/bootstrap/ui/asistencia/asistencia-tecnica-page.server.tsx`.
- Evidencia visual y pruebas de interacción: pendientes.

## S16 — /monitoreo/gestion

- Roles: A.
- Tarea: Listar encuentros para gestionar cobertura.
- Variantes y estados a cubrir: Estado, búsqueda, fecha.
- Implementación: `app/(gestion)/monitoreo/gestion/page.tsx`.
- Evidencia visual y pruebas de interacción: pendientes.

## S17 — /monitoreo/gestionar/[instanciaId]

- Roles: A.
- Tarea: Gestionar cobertura individual.
- Variantes y estados a cubrir: Disponibilidad, asignación y postulación.
- Implementación: `app/(gestion)/monitoreo/gestionar/[instanciaId]/page.tsx`.
- Evidencia visual y pruebas de interacción: pendientes.

## S18 — /operacion/[instanciaId]

- Roles: A/T*.
- Tarea: Consultar y operar encuentro.
- Variantes y estados a cubrir: Meet; Zoom activo; Zoom histórico: resumen, asistencia, grabaciones.
- Implementación: `src/bootstrap/ui/reuniones/reunion-operativa-page.server.tsx`.
- Evidencia visual y pruebas de interacción: pendientes.

## S19 — /agenda-abierta

- Roles: A/T.
- Tarea: Consultar coberturas, postular según rol.
- Variantes y estados a cubrir: Agenda y postulaciones.
- Implementación: `src/bootstrap/ui/asistencia/agenda-abierta-page.server.tsx`.
- Evidencia visual y pruebas de interacción: pendientes.

## S20 — /mi-agenda

- Roles: T.
- Tarea: Asignaciones, mes, histórico, horas.
- Variantes y estados a cubrir: Próximas, mes, histórico.
- Implementación: `src/bootstrap/ui/asistencia/mi-agenda-page.server.tsx`.
- Evidencia visual y pruebas de interacción: pendientes.

## S21 — /usuarios

- Roles: A.
- Tarea: Personas, programas, solicitudes de acceso.
- Variantes y estados a cubrir: Personas/programas, tipos de usuario.
- Implementación: `app/(gestion)/usuarios/page.tsx`.
- Evidencia visual y pruebas de interacción: pendientes.

## S22 — /usuarios/[usuarioId]

- Roles: A.
- Tarea: Roles, identidad, programas, disponibilidad.
- Variantes y estados a cubrir: Según rol de la persona.
- Implementación: `app/(gestion)/usuarios/[usuarioId]/page.tsx`.
- Evidencia visual y pruebas de interacción: pendientes.

## S23 — /asistentes

- Roles: A.
- Tarea: Equipo de monitoreo, consultar horas/pagos.
- Variantes y estados a cubrir: Mes, estado, búsqueda y orden.
- Implementación: `src/bootstrap/ui/asistencia/asistentes-page.server.tsx`.
- Evidencia visual y pruebas de interacción: pendientes.

## S24 — /asistentes/[usuarioId]

- Roles: A.
- Tarea: Detalle mensual del asistente y reuniones.
- Variantes y estados a cubrir: Mes, identidad.
- Implementación: `src/bootstrap/ui/asistencia/asistente-detail-page.server.tsx`.
- Evidencia visual y pruebas de interacción: pendientes.

## S25 — /mis-clases

- Roles: D.
- Tarea: Consultar clases y asistencia.
- Variantes y estados a cubrir: Próximas, en curso, anteriores.
- Implementación: `app/(gestion)/mis-clases/page.tsx`.
- Evidencia visual y pruebas de interacción: pendientes.

## S26 — /mis-programas

- Roles: D.
- Tarea: Gestionar programas propios.
- Variantes y estados a cubrir: Seleccionados, disponibles, guardado.
- Implementación: `app/(gestion)/mis-programas/page.tsx`.
- Evidencia visual y pruebas de interacción: pendientes.

## S27 — /grabaciones

- Roles: A/D/T*.
- Tarea: Consultar archivos y grabaciones.
- Variantes y estados a cubrir: Proveedor, filtros, alcance, sincronización.
- Implementación: `app/(gestion)/grabaciones/page.tsx`.
- Evidencia visual y pruebas de interacción: pendientes.

## S28 — /notificaciones

- Roles: A/D/T.
- Tarea: Consultar y gestionar avisos personales.
- Variantes y estados a cubrir: Estado y filtros.
- Implementación: `app/(gestion)/notificaciones/page.tsx`.
- Evidencia visual y pruebas de interacción: pendientes.

## S29 — /mi-perfil

- Roles: A/D/T.
- Tarea: Datos, contraseña y preferencias.
- Variantes y estados a cubrir: Datos, acceso, notificaciones.
- Implementación: `app/(gestion)/mi-perfil/page.tsx`.
- Evidencia visual y pruebas de interacción: pendientes.

## S30 — /centro-operaciones

- Roles: A.
- Tarea: Acceder a diagnóstico y tareas pendientes.
- Variantes y estados a cubrir: Enlaces a cobertura, duplicados, Meet, Zoom y Google.
- Implementación: `app/(gestion)/centro-operaciones/page.tsx`.
- Evidencia visual y pruebas de interacción: pendientes.

## S31 — /centro-operaciones/zoom

- Roles: A.
- Tarea: Consultar diagnóstico Zoom.
- Variantes y estados a cubrir: Cuentas, series, pasadas, agenda.
- Implementación: `app/(gestion)/centro-operaciones/zoom/page.tsx`.
- Evidencia visual y pruebas de interacción: pendientes.

## S32 — /configuracion

- Roles: A.
- Tarea: Resumen de estado de configuración.
- Variantes y estados a cubrir: Integraciones, salas, programas.
- Implementación: `app/(gestion)/configuracion/page.tsx`.
- Evidencia visual y pruebas de interacción: pendientes.

## S33 — /configuracion/google

- Roles: A.
- Tarea: Cuenta de servicio, delegación y Drive.
- Variantes y estados a cubrir: Estado y prueba de integración.
- Implementación: `app/(gestion)/configuracion/google/page.tsx`.
- Evidencia visual y pruebas de interacción: pendientes.

## S34 — /configuracion/zoom

- Roles: A.
- Tarea: Conexión, grupo, avisos, agenda.
- Variantes y estados a cubrir: Bloques de configuración.
- Implementación: `app/(gestion)/configuracion/zoom/page.tsx`.
- Evidencia visual y pruebas de interacción: pendientes.

## S35 — /configuracion/salas

- Roles: A.
- Tarea: Gestionar cuentas anfitrionas.
- Variantes y estados a cubrir: Disponibilidad, capacidad, estado.
- Implementación: `app/(gestion)/configuracion/salas/page.tsx`.
- Evidencia visual y pruebas de interacción: pendientes.

## S36 — /configuracion/correo

- Roles: A.
- Tarea: Configurar Amazon SES.
- Variantes y estados a cubrir: Credenciales, prueba, estado.
- Implementación: `app/(gestion)/configuracion/correo/page.tsx`.
- Evidencia visual y pruebas de interacción: pendientes.

## S37 — /configuracion/notificaciones

- Roles: A.
- Tarea: Destinatarios de reportes mensuales.
- Variantes y estados a cubrir: Configuración y guardado.
- Implementación: `app/(gestion)/configuracion/notificaciones/page.tsx`.
- Evidencia visual y pruebas de interacción: pendientes.

## S38 — /configuracion/historico

- Roles: A.
- Tarea: Consultar registros importados.
- Variantes y estados a cubrir: Búsqueda y paginación.
- Implementación: `app/(gestion)/configuracion/historico/page.tsx`.
- Evidencia visual y pruebas de interacción: pendientes.

## Corrección de cobertura

El recuento de 38 pantallas base sigue válido. Los 57 casos iniciales agrupaban S18 en dos variantes (Meet y Zoom). La rama histórica de Zoom tiene tres secciones comprobadas en reunion-zoom-historica.tsx (resumen, asistencia, grabaciones), además de la consola Zoom no histórica. Sustituir los dos casos anteriores por cinco (Meet, Zoom no histórico y tres secciones históricas) eleva el mínimo a 60 vistas, o 180 combinaciones nominales en tres anchos. No es un inventario exhaustivo de estados o roles; las combinaciones deben ajustarse a la aplicabilidad.

## Evidencias pendientes por pantalla

Agregar captura de escritorio, tablet y teléfono, ruta exacta con parámetros y datos sintéticos; registrar controles de teclado, foco, errores, vacío y carga. Probar los recorridos con usuarios de prueba de cada rol. No usar credenciales reales ni guardar PII.

