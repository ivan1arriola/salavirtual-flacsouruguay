# Etapa 6: Notificaciones y Transportes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement task-by-task.
> Baseline: `npm test` passing (111 files, 866 tests), `npm run check` clean, `npm run build` clean.

**Goal:** Implementar las 5 capas arquitectónicas para el módulo `src/modules/notificaciones/` (`domain`, `ports`, `application`, `infrastructure`, `api.ts`), extraer el cliente técnico de Gmail en `src/integrations/google/gmail/`, desacoplar la construcción de plantillas de los transportes de correo (Gmail API / SMTP nodemailer), e implementar tolerancia a fallos en notificaciones, preservando fachadas retrocompatibles.

**Architecture:** Monolito modular desacoplado.

- `src/integrations/google/gmail/`: Cliente técnico HTTP puro para la API de Gmail (`https://gmail.googleapis.com/gmail/v1/users/me/messages/send`), sin reglas de negocio.
- `src/modules/notificaciones/domain/`: Tipos puros e inmutables (`NotificationMessage`, `NotificationRecipient`, `TipoNotificacion`, `PreferenciaCanales`), funciones puras de plantillas (`construirCorreoNotificacion`, `reunionEmailText`, `etiquetaTipoNotificacion`).
- `src/modules/notificaciones/ports/`: Contrato de transporte `EmailTransportPort` (`enviarCorreo`) y contrato de persistencia `NotificacionesRepositoryPort`.
- `src/modules/notificaciones/application/`: Casos de uso de notificación (`notificarUsuario`, `notificarUsuarios`, `notificarAdministracion`, `enviarCorreoConfigurado`) con contención de errores y despacho selectivo push/email según preferencias.
- `src/modules/notificaciones/infrastructure/`: Adaptador compuesto de transporte (`CompositeEmailTransport`) con prioridad Gmail API y fallback SMTP (`nodemailer-secure`); adaptador Prisma (`PrismaNotificacionesRepository`) con resolución de preferencias, bandeja y destinatarios de programa.
- `src/modules/notificaciones/api.ts` y `src/bootstrap/notificaciones.server.ts`: Raíz de composición con `server-only`.
- Fachadas en `src/modules/notificaciones/*` y `src/modules/configuracion/correo.service.ts`: Preservan retrocompatibilidad para llamadas existentes.

**Tech Stack:** Node.js 24, TypeScript, Prisma 6, Vitest, Gmail API (`src/integrations/google/gmail`), Nodemailer.

**Spec Reference:** `docs/superpowers/specs/2026-09-19-capas-y-encapsulamiento-design.md` (Secciones 4, 8, 9, 12, 14, 15) y `docs/superpowers/plans/2026-09-19-capas-y-encapsulamiento-plan-rector.md` (Etapa 6).

---

## Invariantes y Restricciones

1. **Pureza de Dominio:** `src/modules/notificaciones/domain/` contendrá únicamente tipos `readonly` y funciones sincrónicas puras. Cero imports de Prisma, Next.js, React, `nodemailer`, `google-auth-library` o APIs externas.
2. **Prioridad y Tolerancia a Fallos en Correo:**
   - Gmail API es el proveedor prioritario; SMTP es fallback.
   - Un fallo en el envío de correo (red, cuota, credenciales) nunca debe abortar ni hacer fallar la operación de negocio principal (como crear una reunión o asignar un asistente). La falla de correo se captura y registra sin propagar excepción al usuario.
   - Si un asistente técnico está cesado (`cesadoHastaProximoInicioSesion: true`), no se debe enviar ninguna notificación (ni push ni email).
3. **Clientes Técnicos de Google:**
   - La llamada HTTP a `https://gmail.googleapis.com` se encapsula en `src/integrations/google/gmail/`, manteniendo la coherencia con `calendar/` y `meet/`.
4. **Fachadas Temporales Retrocompatibles:**
   - `notificaciones.domain.ts` reexporta del nuevo dominio.
   - `notificacion-email.domain.ts` reexporta del nuevo dominio.
   - `notificaciones.service.ts` preserva `notificarUsuario`, `notificarUsuarios`, `notificarAdministracion`, `preferenciasDeUsuario`, `reunionEmailText`.
   - `src/modules/configuracion/correo.service.ts` preserva `enviarCorreoConfigurado(db, input)`.
5. **Verificación Continua Obligatoria:**
   - `npm run check`
   - `npm test`
   - `npm run validate:schema`
   - `npm run build`

---

## Tareas

### Tarea 1: Cliente Técnico Google Gmail (`src/integrations/google/gmail/`)

- Crear `src/integrations/google/gmail/gmail-messages.client.ts`:
  - `enviarMensajeGmailHttp(auth: JWT, rawBase64Message: string): Promise<void>`.
  - `buildRawGmailMessage(input: MailInput, from: string): string`.
- Actualizar `src/integrations/google/auth/google-auth.client.ts`:
  - Agregar `crearGoogleGmailAuthClient(credentials: GoogleAuthCredentials): JWT`.
- Actualizar `src/integrations/google/index.ts`.
- Crear tests en `test/integrations-google-gmail.test.ts`.

### Tarea 2: Capa de Dominio (`src/modules/notificaciones/domain/`)

- Crear `src/modules/notificaciones/domain/notificaciones.types.ts`:
  - Tipos `TIPOS_NOTIFICACION`, `TipoNotificacion`, `PreferenciaCanales`, `NotificationRecipient`, `NotificationMessage`, `NotificationEmail`, `ReunionEmailInput`, `MailInput`, `MailSendResult`.
- Crear `src/modules/notificaciones/domain/notificaciones.domain.ts`:
  - `esTipoNotificacion`, `etiquetaTipoNotificacion`, `PREFERENCIA_PREDETERMINADA`.
- Crear `src/modules/notificaciones/domain/notificacion-email.domain.ts`:
  - `construirCorreoNotificacion`, `reunionEmailText`.
- Crear `src/modules/notificaciones/domain/index.ts`.
- Mover y actualizar tests en `test/notificaciones-domain.test.ts` y `test/notificacion-email.test.ts`.

### Tarea 3: Capa de Puertos (`src/modules/notificaciones/ports/`)

- Crear `src/modules/notificaciones/ports/email-transport.port.ts`:
  - Contrato `EmailTransportPort` (`enviarCorreo(input: MailInput): Promise<MailSendResult>`).
- Crear `src/modules/notificaciones/ports/notificaciones-repository.port.ts`:
  - Contrato `NotificacionesRepositoryPort` (`obtenerPreferencias`, `guardarNotificacion`, `esAsistenteCesado`, `obtenerDestinatariosPrograma`, `obtenerAdministradores`, `obtenerCredencialesGmail`).
- Crear `src/modules/notificaciones/ports/index.ts`.

### Tarea 4: Capa de Aplicación (`src/modules/notificaciones/application/`)

- Crear `src/modules/notificaciones/application/notificar-usuario.use-case.ts`:
  - Lógica con cese de asistente, verificación de preferencias (push y email), guardado en bandeja y envío seguro de correo.
- Crear `src/modules/notificaciones/application/notificar-usuarios.use-case.ts`:
  - Deduplicación de destinatarios y envío múltiple.
- Crear `src/modules/notificaciones/application/notificar-administracion.use-case.ts`:
  - Notificación a administradores activos.
- Crear `src/modules/notificaciones/application/enviar-correo-configurado.use-case.ts`:
  - Caso de uso para envíos de correo del sistema.
- Crear `src/modules/notificaciones/application/index.ts`.
- Crear tests en `test/notificaciones-application.test.ts`.

### Tarea 5: Capa de Infraestructura (`src/modules/notificaciones/infrastructure/`)

- Crear `src/modules/notificaciones/infrastructure/email/gmail-email-transport.adapter.ts`.
- Crear `src/modules/notificaciones/infrastructure/email/smtp-email-transport.adapter.ts`.
- Crear `src/modules/notificaciones/infrastructure/email/composite-email-transport.adapter.ts`.
- Crear `src/modules/notificaciones/infrastructure/prisma/prisma-notificaciones-repository.adapter.ts`.
- Crear `src/modules/notificaciones/infrastructure/index.ts`.
- Crear tests en `test/notificaciones-infrastructure.test.ts`.

### Tarea 6: API Pública, Raíz de Composición Servidor y Fachadas

- Crear `src/modules/notificaciones/api.ts`.
- Crear `src/bootstrap/notificaciones.server.ts` con `server-only`.
- Crear `test/notificaciones-bootstrap.test.ts`.
- Conectar fachadas retrocompatibles en `src/modules/notificaciones/*` y `src/modules/configuracion/correo.service.ts`.
- Verificar compatibilidad total con consumidores existentes.

### Tarea 7: Fronteras Arquitectónicas y Verificación Integral

- Auditar que `src/modules/notificaciones/` y `src/integrations/google/gmail` cumplan las fronteras en `test/architecture-boundaries.test.ts` y la pureza en `test/functional-architecture.test.ts`.
- Ejecutar:
  - `npm run check`
  - `npm test`
  - `npm run validate:schema`
  - `npm run build`
- Documentar en `walkthrough.md`, actualizar `task_tracking.md` y hacer commit atómico de la Etapa 6.
