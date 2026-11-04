# Creación y vista de reuniones en Zoom

## Contexto

Primera iteración de la interfaz Zoom de Sala Virtual. Reemplaza en uso (no en el repositorio) las pantallas de reuniones pensadas para Meet. Se apoya en `2026-11-02-zoom-primary-migration-design.md`. El spec de asistencia (`2026-11-03-zoom-asistencia-design.md`) queda en pausa.

## Objetivo

Crear reuniones en Zoom desde un formulario pensado para Zoom, y verlas en una lista y un detalle pensados para Zoom, con pocas opciones. Las pantallas de Meet se conservan en el repositorio, sin ruta y sin uso.

## Estado actual

- El backend ya crea, reprograma y elimina reuniones Zoom (`provisionar-conferencias.use-case.ts`) y `gestionar-encuentros.service.ts` expone `actualizarEncuentro`, `eliminarEncuentro` y `eliminarReunionCompleta`. La API de creación ya rechaza `GOOGLE_MEET`.
- `meeting-form-v2.tsx` envía `plataforma: "ZOOM"` pero bloquea la creación si el docente no tiene cuenta Google (usada como cohost) y conserva textos de Google.
- La lista (`app/(gestion)/reuniones/page.tsx`) y el detalle (`reunion-detail-page.server.tsx`) mezclan componentes y textos de Meet.

## Decisiones

- **Conservación:** pantallas Zoom nuevas en archivos propios; las rutas apuntan a ellas. Los archivos de Meet no se modifican ni se borran. Sin bandera de configuración.
- **Primera versión mínima:** quedan fuera asistencia, invitaciones, cohost y archivos (grabaciones, transcripciones). Eso es de iteraciones posteriores.

## Comportamiento

1. **Formulario** (`meeting-form-zoom.tsx`):
   - Campos: título, programa/docente, descripción opcional, fechas (una fecha, repetición semanal o fechas específicas, con los mismos dominios de recurrencia y horarios actuales), casilla de grabación en la nube y asistente técnico (asignación solo para administración).
   - No hay cohosts ni invitados.
   - La falta de cuenta Google del docente no bloquea la creación; el host Zoom se asigna del pool de salas por el servidor.
   - La modalidad virtual/híbrida solo se muestra al pedir asistente técnico; si no se pide, se envía `VIRTUAL`.
   - Todos los textos y mensajes hablan de Zoom. Un fallo de aprovisionamiento se informa como enlace de Zoom pendiente.
2. **Lista** (`reuniones-zoom`):
   - Pestañas de próximas y pasadas; búsqueda por título; filtro por programa y período.
   - Por encuentro: fecha y hora, programa, docente, "Unirse" y "Copiar enlace" con el `join_url` del evento Zoom activo.
   - Estado del enlace: listo, pendiente o con error. Administración ve "Reintentar".
   - Usa `obtenerDatosPaginaReuniones` y `seleccionarEventoProveedorActivo`.
3. **Detalle** (`reunion-zoom-detail`):
   - Datos de la reunión y lista de encuentros con su enlace.
   - El enlace de inicio como anfitrión (`start_url`) se muestra solo al docente de la reunión y a administración; nunca a estudiantes.
   - Editar fecha y hora de un encuentro; cancelar un encuentro o toda la serie. Se usan los servicios existentes y el aprovisionamiento actualiza Zoom.
   - No hay cohost, invitados, asistencia ni archivos.
4. **Rutas:** `app/(gestion)/reuniones/nueva/page.tsx`, `app/(gestion)/reuniones/page.tsx` y `app/(gestion)/reuniones/[solicitudId]/page.tsx` apuntan a las pantallas Zoom.

## Pruebas

- Crear una reunión con un docente sin cuenta Google funciona de punta a punta.
- La API sigue rechazando `GOOGLE_MEET`.
- El `start_url` no aparece para un estudiante.
- Las rutas renderizan las pantallas Zoom; los componentes de Meet siguen compilando sin ruta.
- `npm run check` y `npm test` limpios.

## Fuera de alcance

- Asistencia, invitaciones, cohost, archivos y grabaciones como archivos.
- Cambios en `/reuniones/migracion-zoom`.
- Borrar o refactorizar los componentes de Meet.

## Riesgo por verificar

La creación real contra Zoom requiere las nueve cuentas `sala01`–`sala09` registradas y verificadas. Sin ellas, la reunión queda guardada con enlace pendiente.
