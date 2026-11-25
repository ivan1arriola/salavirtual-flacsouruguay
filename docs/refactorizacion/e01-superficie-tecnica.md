# E01.3 — Superficie técnica inventariada

Base: `bfcbfc091277086b37a7ae499bc95e54fe441272`. Conteo de archivos versionados en el árbol Git, no cantidad de tests ejecutados, métodos HTTP ni componentes visuales.

- 42 archivos de página.
- 79 archivos route.ts bajo app/api.
- 10 archivos actions.ts bajo app.
- 52 archivos CSS.
- 368 archivos test/*.test.ts o .tsx.
- 17 directorios de módulos.

## API por familia

### auth (1)

- `/api/auth/[...nextauth]`

### health (1)

- `/api/health`

### archivos (6)

- `/api/v1/archivos/zoom/archivos/[archivoId]/reintentar`
- `/api/v1/archivos/zoom/ocurrencias/[ocurrenciaId]/candidatos`
- `/api/v1/archivos/zoom/ocurrencias/[ocurrenciaId]/desvincular`
- `/api/v1/archivos/zoom/ocurrencias/[ocurrenciaId]/vincular`
- `/api/v1/archivos/zoom/recuperaciones/[barridoId]`
- `/api/v1/archivos/zoom/recuperaciones`

### asistencia (12)

- `/api/v1/asistencia/asignaciones/desvincular`
- `/api/v1/asistencia/asignaciones`
- `/api/v1/asistencia/asistentes/[usuarioId]/estado`
- `/api/v1/asistencia/calendario-zoom`
- `/api/v1/asistencia/duracion`
- `/api/v1/asistencia/gestion-cobertura`
- `/api/v1/asistencia/notificaciones`
- `/api/v1/asistencia/planilla-pagos`
- `/api/v1/asistencia/planillas-vacias`
- `/api/v1/asistencia/postulaciones`
- `/api/v1/asistencia/reportes-mensuales`
- `/api/v1/asistencia/sincronizar-calendarios`

### configuracion (13)

- `/api/v1/configuracion/correo/test`
- `/api/v1/configuracion/google-workspace/drive-access`
- `/api/v1/configuracion/google-workspace/resincronizar-cohosts`
- `/api/v1/configuracion/google-workspace`
- `/api/v1/configuracion/google-workspace/test`
- `/api/v1/configuracion/google-workspace/verificar-cohosts`
- `/api/v1/configuracion/salas-meet`
- `/api/v1/configuracion/zoom/agenda/acciones`
- `/api/v1/configuracion/zoom/agenda/sincronizar`
- `/api/v1/configuracion/zoom/grupo`
- `/api/v1/configuracion/zoom/grupo/sincronizar`
- `/api/v1/configuracion/zoom`
- `/api/v1/configuracion/zoom/webhook`

### mobile (8)

- `/api/v1/mobile/admin/resumen`
- `/api/v1/mobile/admin/reuniones/[id]`
- `/api/v1/mobile/admin/reuniones`
- `/api/v1/mobile/agenda-abierta`
- `/api/v1/mobile/auth/login`
- `/api/v1/mobile/auth/logout`
- `/api/v1/mobile/me`
- `/api/v1/mobile/reuniones`

### notificaciones (1)

- `/api/v1/notificaciones`

### operaciones (2)

- `/api/v1/operaciones/estado`
- `/api/v1/operaciones/google`

### reuniones (32)

- `/api/v1/reuniones/[solicitudId]/cohosts`
- `/api/v1/reuniones/[solicitudId]/cohosts/verificar`
- `/api/v1/reuniones/[solicitudId]/encuentros/[instanciaId]`
- `/api/v1/reuniones/[solicitudId]/encuentros`
- `/api/v1/reuniones/[solicitudId]/enlace-recuperacion`
- `/api/v1/reuniones/[solicitudId]/invitados`
- `/api/v1/reuniones/[solicitudId]/notificar`
- `/api/v1/reuniones/cancelar-serie`
- `/api/v1/reuniones/instancias/[instanciaId]/asistencia/conciliar`
- `/api/v1/reuniones/instancias/[instanciaId]/asistencia/exportar/[fuente]`
- `/api/v1/reuniones/instancias/[instanciaId]/asistencia/original-zoom/[ocurrenciaId]`
- `/api/v1/reuniones/instancias/[instanciaId]/asistencia/regenerar`
- `/api/v1/reuniones/instancias/[instanciaId]/asistencia/zoom-original/[ocurrenciaId]`
- `/api/v1/reuniones/instancias/[instanciaId]/codigo-zoom`
- `/api/v1/reuniones/instancias/[instanciaId]/control-operativo`
- `/api/v1/reuniones/instancias/[instanciaId]/correos-asistencia`
- `/api/v1/reuniones/instancias/[instanciaId]/excepcion-meet`
- `/api/v1/reuniones/instancias/[instanciaId]/incidencias`
- `/api/v1/reuniones/instancias/[instanciaId]/iniciar-zoom`
- `/api/v1/reuniones/instancias/[instanciaId]/participantes-activos`
- `/api/v1/reuniones/instancias/[instanciaId]/participantes-zoom`
- `/api/v1/reuniones/migracion-zoom/aplicar`
- `/api/v1/reuniones/migracion-zoom/series-enlaces`
- `/api/v1/reuniones/migracion-zoom/series/aplicar`
- `/api/v1/reuniones/migracion-zoom/series/vista-previa`
- `/api/v1/reuniones/migracion-zoom/vista-previa`
- `/api/v1/reuniones/operaciones-integracion`
- `/api/v1/reuniones/provisionar-pendientes`
- `/api/v1/reuniones/reconciliar-pendientes`
- `/api/v1/reuniones/recordatorios-24h`
- `/api/v1/reuniones`
- `/api/v1/reuniones/sincronizar-archivos`

### usuarios (2)

- `/api/v1/usuarios/[usuarioId]/cuentas-google`
- `/api/v1/usuarios/[usuarioId]/rol`

### webhooks (1)

- `/api/v1/webhooks/zoom`

Cada archivo puede exponer varios métodos y delegar su autorización. Esta lista solo prueba existencia, no seguridad. Los endpoints de móvil, webhooks y jobs tienen consumidores distintos y no deben eliminarse por carecer de enlaces en el shell.

## Server actions

- `app/(gestion)/configuracion/actions.ts`
- `app/(gestion)/mi-perfil/actions.ts`
- `app/(gestion)/mis-programas/actions.ts`
- `app/(gestion)/reuniones/duplicados/actions.ts`
- `app/(gestion)/usuarios/[usuarioId]/actions.ts`
- `app/(gestion)/usuarios/actions.ts`
- `app/acceso/actions.ts`
- `app/completar-registro/actions.ts`
- `app/recuperar-contrasena/actions.ts`
- `app/restablecer-contrasena/actions.ts`

## Estilos

- `app/(gestion)/admin-assistants.css`
- `app/(gestion)/admin-dashboard-mobile.css`
- `app/(gestion)/admin-upcoming-refresh.css`
- `app/(gestion)/agenda-day-zebra.css`
- `app/(gestion)/agenda-mobile-compact.css`
- `app/(gestion)/agenda-refresh.css`
- `app/(gestion)/agenda-v2.css`
- `app/(gestion)/assistant-agenda.css`
- `app/(gestion)/assistant-dashboard.css`
- `app/(gestion)/assistant-month.css`
- `app/(gestion)/assistant-report-config.css`
- `app/(gestion)/assistants-monitoring-mobile.css`
- `app/(gestion)/attendance-view.css`
- `app/(gestion)/brand-refresh.css`
- `app/(gestion)/centro-operaciones/centro-operaciones.module.css`
- `app/(gestion)/centro-operaciones/zoom/zoom.module.css`
- `app/(gestion)/configuration-center.css`
- `app/(gestion)/gestion.css`
- `app/(gestion)/grabaciones/grabaciones.css`
- `app/(gestion)/meeting-detail-mobile-continuous.css`
- `app/(gestion)/meeting-detail-v2.css`
- `app/(gestion)/meeting-form-v2.css`
- `app/(gestion)/mi-perfil/profile.css`
- `app/(gestion)/mis-clases/page.module.css`
- `app/(gestion)/monitoring-coverage-workflow.css`
- `app/(gestion)/notificaciones/notificaciones.module.css`
- `app/(gestion)/operations.css`
- `app/(gestion)/personal.css`
- `app/(gestion)/profile-navigation-refresh.css`
- `app/(gestion)/program-admin.css`
- `app/(gestion)/proveedor-tabs.css`
- `app/(gestion)/reuniones/buscar-meet/search.module.css`
- `app/(gestion)/reuniones/nueva/nueva-reunion.module.css`
- `app/(gestion)/reuniones/reuniones-zoom.module.css`
- `app/(gestion)/role-dashboard-mobile.css`
- `app/(gestion)/role-dashboard.css`
- `app/(gestion)/settings.css`
- `app/(gestion)/ux-polish.css`
- `app/(gestion)/zoom-detalle.css`
- `app/acceso/acceso.css`
- `app/brand.css`
- `app/globals.css`
- `app/tour.css`
- `src/bootstrap/ui/reuniones/reunion-zoom-operativa.module.css`
- `src/components/dashboard/admin/admin-upcoming-list.module.css`
- `src/components/dashboard/admin/live-participants-indicator.module.css`
- `src/components/excepcion-meet-control.module.css`
- `src/components/migracion-zoom-aplicar-control.module.css`
- `src/components/workspace-credential-form.module.css`
- `src/components/zoom-asistencia-ocurrencias.module.css`
- `src/modules/reuniones/presentation/components/nueva-reunion/nueva-reunion.module.css`
- `src/modules/reuniones/presentation/components/reunion-zoom-encuentros.css`

El layout de gestión importa 30 hojas CSS directamente. Los estilos de módulos, raíz y otras pantallas amplían la superficie. Antes de retirar una regla, mapear selector, consumidor, especificidad, orden de importación y pruebas visuales. No afirmar duplicación solo por el número de archivos.

## Módulos

- `src/modules/archivos/`
- `src/modules/asistencia/`
- `src/modules/auditoria/`
- `src/modules/conferencias/`
- `src/modules/configuracion/`
- `src/modules/dashboard/`
- `src/modules/historico/`
- `src/modules/identity/`
- `src/modules/liquidaciones/`
- `src/modules/meet/`
- `src/modules/migracion/`
- `src/modules/mobile-admin/`
- `src/modules/notificaciones/`
- `src/modules/operaciones/`
- `src/modules/programas/`
- `src/modules/reuniones/`
- `src/modules/usuarios/`

Los dominios de experiencia no son una orden de renombrar módulos. Identificar contratos y dependencias con Dependency Cruiser y pruebas de fronteras antes de mover responsabilidades.

## Evidencia de regresión existente

- `test/admin-dashboard-mobile-ui.test.ts`
- `test/agenda-mobile-compact.test.ts`
- `test/agenda-responsive-layout.test.ts`
- `test/app-navigation.test.ts`
- `test/architecture-boundaries.test.ts`
- `test/asistencia-duracion-boundary.test.ts`
- `test/assistant-agenda-mobile-schedule.test.ts`
- `test/assistant-agenda-mobile-touch-targets.test.ts`
- `test/assistant-open-agenda-mobile-layout.test.ts`
- `test/assistants-monitoring-mobile-ui.test.ts`
- `test/auth-config.test.ts`
- `test/encuentros-domain.test.ts`
- `test/f9-assistance-usecase-permissions.test.ts`
- `test/f9-mobile-agenda-auth-contract.test.ts`
- `test/f9-program-authorization-postgres.test.ts`
- `test/filtro-encuentros-domain.test.ts`
- `test/gestion-cobertura-flujos.test.ts`
- `test/gestion-roles-domain.test.ts`
- `test/gestionar-encuentros-reunion-compartida.test.ts`
- `test/gestionar-encuentros-service.test.ts`
- `test/gestionar-encuentros-titular.test.ts`
- `test/google-oauth-internal-id.test.ts`
- `test/integrations-google-auth.test.ts`
- `test/meeting-detail-sections.test.ts`
- `test/meeting-form-ui-contract.test.ts`
- `test/meeting-form-zoom-contract.test.ts`
- `test/mobile-actor.test.ts`
- `test/mobile-admin-queries.test.ts`
- `test/mobile-login.test.ts`
- `test/mobile-logout.test.ts`
- `test/mobile-me.test.ts`
- `test/mobile-meetings-auth-contract.test.ts`
- `test/mobile-more-navigation-ui.test.ts`
- `test/mobile-token.test.ts`
- `test/navigation-disclosure.test.ts`
- `test/notifications-mobile-touch-targets.test.ts`
- `test/operational-mobile-controls.test.ts`
- `test/presentation-layer-boundaries.test.ts`
- `test/recordings-library-accessibility.test.ts`
- `test/roles.test.ts`
- `test/settings-navigation-domain.test.ts`
- `test/usuarios-responsive-table.test.ts`
- `test/zoom-archivos-access.test.ts`
- `test/zoom-ui-controles.test.ts`

Se listan archivos por nombre, no se certifica su cobertura ni resultado. E01.3 debe medir acoplamientos y consumidores, y E01.4 ejecutar tareas con evidencia.
