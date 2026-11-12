# Pendientes al 2026-11-05

Estado al redactarse: el PR #195 (cuentas anfitrionas de Zoom por grupo) pasó todo el CI. Este archivo junta lo que quedó sin hacer; inicialmente fue una nota local de traspaso.

Actualización 2026-11-05: los PR #166 y #195 ya están mergeados. La lista conserva el estado original para explicar el traspaso; contrastar cada punto con `main` antes de implementarlo.

## 1. Antes de usar la función de grupos de Zoom (bloqueantes para la primera sincronización)

- [ ] **App nueva de Zoom.** La original se perdió. Crear una app Server-to-Server OAuth, activarla y cargar Account ID, Client ID y Client Secret en Configuración › Zoom. No apagar la app vieja hasta validar la nueva.
  - Meetings: `meeting:write:meeting:admin`, `meeting:read:meeting:admin`, `meeting:update:meeting:admin`, `meeting:delete:meeting:admin`, `meeting:read:list_meetings:admin`.
  - Grupos: `group:read:list_groups:admin`, `group_member:read:list_members:admin`.
  - `report:read:admin` no existe con ese nombre en Zoom (solo versiones específicas como `report:read:list_history_meetings:admin`). No hace falta para esta función.
- [ ] **Revisar el grupo en Zoom.** Debe contener las salas como usuarios _licenciados_ (tipo 2) y con los mismos correos que las cuentas actuales (`emailOrganizador`), para que se adopten y no se dupliquen ni queden fuera del grupo.
- [ ] **Foto previa.** Anotar las cuentas Zoom actuales (id, correo, activa, tieneLicencia, prioridad) y sus reuniones futuras `PROGRAMADA`, como referencia para volver atrás.
- [ ] **Primera sincronización a mano**, de un administrador, en un horario tranquilo. Revisar la vista previa. Comprobar que cada sala figura «Disponible». Crear una reunión de Zoom de prueba.
- [ ] **Mirar la interfaz en un navegador.** Solo se verificó con renderizado estático.

## 2. Seguimientos de la función de grupos (PR aparte)

- [ ] **Temporizador periódico** (systemd, como `infra/ec2/salavirtual-google-pending.*`, cableado en `infra/ec2/deploy.sh`). Cada hora o cada día, no cada 5 minutos. El endpoint `GET /api/v1/configuracion/zoom/grupo/sincronizar` con `Authorization: Bearer $CRON_SECRET` responde 502 mientras no haya grupo elegido o si el plan necesita confirmación.
- [ ] **Decidir antes del temporizador:** crear muchas cuentas nuevas hoy no cuenta como cambio masivo. Sin nadie mirando, un grupo equivocado que contenga los correos de las salas crearía anfitriones nuevos que ya reciben reuniones.
- [ ] La vista previa no lista las reactivaciones y repite en «fuera del grupo» las cuentas que ya salieron con reuniones futuras.
- [ ] Los rechazos del temporizador no se guardan (solo un 502 en los logs).
- [ ] La confirmación de un cambio masivo no vuelve a validar el plan si crece entre la vista previa y la confirmación.
- [ ] Perder licencias no activa el control de cambio masivo (solo se ve en la vista previa y el resumen).
- [ ] `EN_CURSO` no cuenta como reunión futura al decidir si desactivar una cuenta.
- [ ] Una migración Meet→Zoom a medio hacer puede perder la cuenta reservada si la sincronización la desactiva.
- [ ] Zoom 401 se informa como «falta permiso»; separar 401 (credenciales) de 403 (permisos).
- [ ] Prueba con Postgres real de la consulta de reuniones futuras (`PROGRAMADA` futura, pasada, `CANCELADA`, instancia con proveedor activo Meet).
- [ ] Rutas: el error 403 sale en inglés («Forbidden»); `GET` de grupos oculta el mensaje de «Zoom no está configurado»; hay ramas de Zoom inalcanzables en `salas-meet/route.ts` para limpiar.
- [ ] Comparación del secreto de cron sin tiempo constante: es el patrón de las 7 rutas de cron; arreglar todas juntas con un ayudante común.
- [ ] Texto viejo «Las 10 cuentas de sala…» en `src/components/zoom-config-form.tsx`.

## 3. Refactor de Configuración y del sidebar (después de mergear la función de grupos)

Informes de Codex en solo lectura, guardados en `.superpowers/sdd/2026-11-05-cuentas-zoom-por-grupo/`: `codex-config-review.md` (Configuración) y `codex-sidebar.md` (sidebar).

- Configuración: sacar lecturas de `page.tsx` a consultas por sección; mover reglas de `salas-meet/route.ts` a un servicio por proveedor; unificar guardado y errores (hoy hay `fetch` con estado local y Server Actions con redirect); separar CSS por sección (`settings.css` tiene 1296 líneas); reubicar Programas. Seis entregas separadas, de menor a mayor riesgo. Atención al test que lee `settings.css` como texto (`test/usuarios-responsive-table.test.ts`).
- Sidebar: cerrar «Más» al navegar; declarar los 4 accesos móviles de forma explícita (hoy `slice(0, 4)`); unificar el renderizado del ítem; revisar la frontera de hidratación y `Suspense`.
- Antes de ejecutar, pasar por brainstorming con el usuario.

## 4. Webhooks, asistencia, grabaciones y transcripciones de Zoom

Informe de Codex en `codex-webhooks.md` (misma carpeta). Resumen:

- No existe receptor de webhooks ni cliente de reportes/grabaciones. El spec está solo en la rama local `docs/spec-webhooks-zoom` (commit `b754f94`) y cubre solo los eventos de estado de la reunión.
- Correcciones al spec y plan: atribuir por UUID de ejecución (no por ventana horaria); participantes por UUID, no por id numérico; no agrupar alumnos por nombre; responder en menos de 3 s (guardar el evento y devolver 200); clave de idempotencia que incluya participante o archivo; no guardar `download_token` ni URLs de descarga; no podar todo a 90 días.
- Permisos granulares probables: `meeting:read:participant:admin`, `meeting:read:list_past_instances:admin`, `meeting:read:list_past_participants:admin`, `cloud_recording:read:recording:admin`, `cloud_recording:read:list_recording_files:admin`, `cloud_recording:read:meeting_transcript:admin`; probar en el Marketplace los de los eventos.
- Plan de Zoom: grabación en la nube y reportes requieren Pro o superior; la transcripción puede pedir Business, Education o Enterprise.
- Decisiones tuyas: Drive o S3; retención por tipo de archivo; consentimiento de estudiantes; si la API de reportes es el registro definitivo; quién concilia lo ambiguo; transcripción literal o resúmenes de AI Companion; los 306 encuentros históricos como `PROGRAMADA`/`EN_CURSO`.
- **Rutina de grabaciones de Zoom a una carpeta de Drive** (como la lógica de Meet): análisis pendiente. Antigravity se bloqueó tres veces con `--dangerously-skip-permissions` (el clasificador de permisos de Claude Code lo rechaza). Opciones: hacerlo con Codex, correr `agy` vos en una terminal, o agregar vos una regla de permiso en la configuración.

## 5. Del traspaso anterior

- [ ] **PR #166** (Dependabot menor/patch): esperar el rebase y el CI, mergear si está verde.
- [ ] **Sin responder:** ¿cerrar el PR #173 y los de Dependabot #167 a #170?
- [ ] **Sin decidir:** ocultar o mostrar los encuentros cancelados en la lista de series (hallazgo 1 de Codex en el PR #189).
- [ ] Ramas sin revisar. Remotas: `feat/unificar-serie-mixta`, `fix/clave-serie-sin-nul`, `fix/consola-operativa-zoom-20261104`, `fix/detalle-zoom-detectar-ids-distintos-20261103`, `fix/mostrar-id-zoom-serie-20261103`, `infra/ci-runner-selectable-20261103`. Local: `docs/spec-webhooks-zoom`.
- [ ] 26 operaciones de Meet colgadas (`CONFIGURAR_MEET`, «Permission denied on resource Member») que dejan `salavirtual-ops-health` en estado crítico; sin decisión sobre limpiarlas.
- [ ] 306 encuentros pasados figuran como `PROGRAMADA` o `EN_CURSO`.
- [ ] Panel de series: enlace «Ver detalle» y reemplazar `window.confirm` de `CorregirSerieZoomBoton` por el diálogo propio. Reunión de Zoom huérfana «Reunión Programa Género y Cultura» (solo se lista).
- [ ] Posible rescate: el commit `335ce8f` («Calendar-only guests») de la rama borrada `feature/zoom-primary-migration`, si no está en `main`.
- [ ] Confirmar en el navegador que «Cuenta anfitriona» ya se ve en «Clases infancia (Zoom)» (PR #194).
- [ ] Las SHAs de las ramas borradas están en el scratchpad de la sesión anterior (`backup-shas-todas.txt`).
