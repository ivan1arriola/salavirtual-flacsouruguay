# Traspaso a la sesión siguiente — Sala Virtual FLACSO

Fecha: 2026-11-04 (la sesión terminó de tarde, hora de Montevideo).
Repositorio: `ivan1arriola/salavirtual-flacsouruguay`. Al cierre de esta nota, `main` estaba desplegada hasta `f30188f` (PR #193). El 2026-11-05 se informó que producción ya estaba en `e466971` (PR #166); comprobar el SHA desplegado antes de una operación nueva.
Léelo entero antes de actuar: contiene reglas de trabajo, el estado real y recetas probadas.

## 1. Cómo trabajar con la persona usuaria

- Idioma: español rioplatense, con voseo. Informes honestos: decir qué se verificó y qué no (nunca se vio la interfaz en un navegador).
- **Un merge o un push a `main` despliega a producción automáticamente** (CI «CI · Sala Virtual» y luego «Deploy · EC2» por SSM). Pedir autorización explícita antes de mergear o empujar a `main`, y avisar que despliega.
- El entorno bloqueó una vez `gh pr merge 189` (clasificador de permisos). No rodear el bloqueo: explicar y esperar la decisión.
- Antes de **escribir en producción** (base, Zoom, Calendar, correos): modo de prueba primero, lista exacta de lo que se toca, confirmación, ejecución de a una serie y detenerse ante el primer error. Los avisos por correo a docentes y asistentes son reales y no se deshacen.
- Commits con el trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; PR con la línea `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- `AGENTS.md`: este Next.js (16) difiere del conocido; leer `node_modules/next/dist/docs/` antes de escribir código de Next.
- La persona usuaria prefiere que Claude ejecute directamente (no delegar) salvo que pida delegar a Codex o Antigravity.

## 2. Estado de producción (todo en `main`)

Desplegado y verificado con el CI:
- Retiro de la bandera `ZOOM_REUNION_COMPARTIDA`: toda serie crea una sola reunión de Zoom compartida. Requisito ya cumplido: sin workers viejos.
- Hotfix #187: la clave de series antiguas ya no lleva NUL (`legacy:programa|creada|título`); causaba el error 22021 de Postgres.
- Diagnóstico por serie (`diagnostico-serie-zoom.*`), mensajes de resultado y regla de reintento (`mensajes-serie-zoom.domain.ts`).
- Guarda de migración: no crea una segunda reunión si hay encuentros en Zoom fuera de la serie.
- #188: «Unificar enlace» acepta series mixtas (Meet y Zoom) y la migración completa después los de Meet.
- #190: lista de Zoom por día y color por cuenta anfitriona; cuenta anfitriona en el detalle de la serie.
- #191: panel de series (estado en texto, botones de acción, diálogo propio, resultados comprensibles).
- #189: el botón «Eliminar encuentro» funciona si es el único de su solicitud; la serie no se muestra cancelada si quedan otras solicitudes activas.
- #186: rediseño responsive de Nueva reunión Zoom (selector de tipo, resumen, helpers de fechas).
- #192: la migración a Zoom incluye encuentros con Meet operativo y solo ajustes de cohosts pendientes.
- #193: duración y botón de copiar ID en la lista de Zoom.

Pendiente al cierre (2026-11-04): ramas sin revisar `codex/attendance-production-hardening`, `feature/zoom-primary-migration`, `docs/spec-webhooks-zoom`, unas 20 `ux/*` de octubre y `codex/asistencia-hibrida-horarios` (5 commits locales sin publicar). Descartadas y borradas: `fix/meet-archivos-20261018` (`cb95ec5`) y `feat/zoom-encuentros-operativos` (`0f05ec6`). Decisión abierta: ocultar o no los encuentros cancelados en la lista de la serie. Producción nunca se verificó en un navegador.

Datos de producción ya corregidos a mano (con las funciones de la app, desde el servidor):
- 8 series dejaron de tener enlaces distintos: Diploma violencias NNA y Diploma Conservación Preventiva (mixtas, unificadas y migradas), tres grupos de Taller Metodológico II, DCCH VII, Corrección y Descripción Ling. del Español Escrito, Diploma de especialización infancias Metodológico.
- «Clases infancia» (2 solicitudes) cancelada; sus eventos de Meet y Zoom quedaron sincronizados. La reemplaza «Clases infancia (Zoom)».
- Quedan a propósito: «Curso básico – Proyecto MIEM FLACSO» en Meet (conservado) y tres series de un solo encuentro con su reunión de Zoom propia (Encuentros sincrónicos IAPE, Taller de Tesis I, Taller de Escritura Creativa).

## 3. Pendientes, con su estado

1. **PR #189** (botón de borrar un encuentro cuando es el único de su solicitud, series antiguas de Meet). Abierto, CI en verde sobre su base vieja.
   - Rama local `fix/borrar-encuentro-solicitud-unica`: tiene un commit de merge de `main` (`3cb2363`) **sin publicar y sin verificar**.
   - Pasos: `npm run check`, `npx vitest run`, empujar la rama, esperar el CI, y mergear solo si la persona usuaria lo confirma.
2. **PR #186** (rediseño A2 del formulario Nueva reunión). Abierto, sin verificar en navegador. Spec y plan en la rama `feat/nueva-reunion-a2` (no están en `main`).
3. **Descubrimiento de salas Zoom desde el grupo «Salas Zoom»** (la persona usuaria creó ese grupo en la cuenta administradora y pidió que las salas se **descubran**, no se declaren). Sin spec escrito todavía. Diseño acordado en la conversación:
   - Leer `GET /groups` y `GET /groups/{id}/members` (paginado). Identificar el grupo por nombre «Salas Zoom» con `ZOOM_GROUP_ID` como override opcional (la pregunta quedó sin responder).
   - Sincronizar con `CuentaProveedor` sin cambiar el esquema: clave `externalAccountId` = ID de usuario de Zoom, adoptar filas existentes por correo, `prioridad` desde el número de `salaNN`, `limiteConcurrente` 1, activa solo si es miembro activo con licencia; las que salen del grupo se desactivan, no se borran.
   - Falla segura: si Zoom no responde o el grupo viene vacío, no desactivar nada. Sincronizar con un botón en Configuración, un temporizador cada 15 minutos y antes de reservar si la sincronización es vieja. El alta manual de salas de Zoom pasa a lista de solo lectura.
   - **Bloqueo:** el token actual de la app de Zoom no tiene `group:read:list_groups:admin` (Zoom responde 400, código 4711).
4. **App de Zoom nueva.** La persona usuaria perdió el acceso a la app original. Debe crear una app Server-to-Server OAuth con los permisos `meeting:write:meeting:admin`, `meeting:read:meeting:admin`, `meeting:update:meeting:admin`, `meeting:delete:meeting:admin`, `meeting:read:list_meetings:admin`, `group:read:list_groups:admin`, `group_member:read:list_members:admin`, activarla y cargar Account ID, Client ID y Client Secret en Configuración → Zoom (la base manda sobre `ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID` y `ZOOM_CLIENT_SECRET`). No desactivar la app vieja hasta validar la nueva. Cuando la cargue: comprobar en solo lectura que se obtiene el token y que se puede listar el grupo.
5. **Webhooks de Zoom.** Diseño escrito en la rama local `docs/spec-webhooks-zoom` (commit `b754f94`, no publicada): `docs/superpowers/specs/2026-11-04-webhooks-zoom-design.md`. Primera entrega: `meeting.started`, `meeting.ended`, `meeting.updated`, `meeting.deleted`. Decisiones abiertas: migración de Prisma `EventoWebhookZoom`; pasar a `NO_REALIZADA` los encuentros de Zoom que nunca empezaron; la app nueva de Zoom como requisito.
6. **26 operaciones de Meet colgadas** (`CONFIGURAR_MEET`, error «Permission denied on resource Member») en encuentros antiguos de Meet. Son la causa del estado «crítico» del servicio `salavirtual-ops-health`. El reconciliador (`/api/v1/reuniones/reconciliar-pendientes`) solo procesa eventos de Meet con `conservarGoogleMeet = true`, por eso las cancelaciones de Meet normales no se sincronizan solas. Sin decisión de la persona usuaria sobre limpiarlas.
7. **306 encuentros ya pasados** figuran como `PROGRAMADA` o `EN_CURSO`: ningún código escribe `EN_CURSO` ni `FINALIZADA`. Lo resolverían los webhooks; los históricos requieren un informe aparte.
8. **Panel de series, mejoras que faltan:** enlace «Ver detalle» por serie y reemplazar `window.confirm` de `CorregirSerieZoomBoton` por el diálogo propio. Además la reunión de Zoom huérfana «Reunión Programa Género y Cultura» (solo se lista; no se borra nada).
9. **Descartado por la persona usuaria:** cohosts de Zoom (la API no permite asignarlos de antemano y los anfitriones alternativos exigen licencia).
10. **Nunca se vio nada en un navegador.** La base configurada en `.env` es remota (`127.0.0.1:15432`, túnel SSH). Verificar a ojo la lista y el panel (contraste de los 12 colores, móvil, densidad compacta) es lo primero que conviene pedirle a la persona usuaria.

## 4. Ramas y espacios de trabajo

- Ramas ya mergeadas en `main`: `fix/clave-serie-sin-nul`, `feat/unificar-serie-mixta`, `feat/detalle-zoom-anfitrion` (incluye la de la lista), `feat/panel-series-zoom-ui`, `integracion/*`, `refactor/*`.
- Con trabajo sin mergear: `fix/borrar-encuentro-solicitud-unica` (PR #189, merge local sin publicar), `feat/nueva-reunion-a2` (PR #186), `docs/spec-webhooks-zoom` (solo local).
- **`main` local está 5 commits atrás de `origin/main`** (no adelantado): empezar con `git fetch` y `git switch main && git pull --ff-only`. Nada de esto se publicó desde `main` local.
- Ramas locales viejas con commits que no están en `main` (revisar antes de borrarlas): `feat/zoom-encuentros-operativos` (+6, trabajo de la primera parte de la sesión sobre las tarjetas de la lista; su contenido ya llegó a `main` por otras ramas, verificar), `fix/zoom-migration-pending-meet-main` (+1), `fix/meet-archivos-20261018` (+3) y `feat/nueva-reunion-a2` (+3, PR #186).
- El resto de las ramas locales de la sesión figuran como «sin publicar» pero ya están contenidas en `main` (+0): se pueden borrar con seguridad.
- Worktrees externos que se pueden borrar con `git worktree remove`: `..\salavirtual-wt-mensajes` y `..\salavirtual-wt-lista` (con un enlace `node_modules`).
- Los scripts auxiliares viven en el directorio temporal de la sesión anterior; no se conservan.

## 5. Recetas probadas (sin secretos)

**Leer producción en solo lectura**
- Abrir el túnel: `ssh -N -o BatchMode=yes -o ExitOnForwardFailure=yes -L 15432:127.0.0.1:5432 servidor-flacso` en segundo plano. Cerrarlo siempre al terminar (buscar el PID con `netstat -ano | grep :15432` y `taskkill //PID <pid> //F`).
- En el script, tomar `DATABASE_URL` de `.env` y agregar `options=-c%20default_transaction_read_only%3Don`. Confirmar que la sesión es de solo lectura con `CREATE TEMP TABLE` (debe fallar con 25006) y abortar si no falla.
- Ejecutar con `npx tsx --tsconfig tsconfig.json script.ts`. Importar `@prisma/client` con una URL `file:///.../node_modules/@prisma/client/index.js` si el script está fuera del repositorio.

**Ejecutar funciones de la app en el servidor** (tiene las credenciales de Zoom y Google, que esta máquina no tiene)
1. `scp` del script a `/tmp` del servidor.
2. Crear el reemplazo de `server-only`: `/tmp/stubs/node_modules/server-only/index.js` (vacío) y su `package.json`.
3. `ssh servidor-flacso 'sudo -n -u salavirtual bash -c "set -a; . /srv/apps/salavirtual-flacso/shared/.env.production; set +a; export NODE_PATH=/tmp/stubs/node_modules; cd /srv/apps/salavirtual-flacso/source && npx tsx --tsconfig tsconfig.json /tmp/script.ts <args>"'`.
4. Borrar de `/tmp` el script y los reemplazos al terminar.
- El código del servidor es el desplegado (`/srv/apps/salavirtual-flacso/source`). El script usa modo `prueba` (solo lectura) y modo `ejecutar`, de a una serie, y se detiene ante el primer error.
- Funciones útiles: `obtenerDiagnosticosSeriesZoom`, `corregirSerieEnlaces`, `aplicarMigracionZoomSerie`, `cancelarSolicitudesAtomicas`, `obtenerServicioConferencias().sincronizarEventosPendientes(ids)`. Las dependencias salen de `crearDependenciasCorreccionSerie()` y `crearDependenciasMigracionZoom()` en `src/bootstrap/migracion-zoom.server.ts`.
- Temporizadores del servidor: `salavirtual-google-pending` (cada 5 minutos, reconcilia Zoom y Meet conservados), `salavirtual-ops-health`, `salavirtual-reminders-24h`.

**Delegar**
- Codex: `codex exec -m gpt-6.1-sol -c model_reasoning_effort=medium -s workspace-write -C . --output-last-message <archivo> - < prompt.md`. No puede escribir en `.git`: no commitea; commitear después. Modelos útiles: `gpt-6.1-sol` (trabajo general), `gpt-6-astra` (el más potente).
- Antigravity: `agy --model gemini-4-argon-medium|high --settings <json> -p "$(cat prompt.md)"`. Sin `--sandbox` (cuelga Vitest) ni `--mode auto` (no disponible). Permisos solo con reglas `write_file(<ruta exacta>)` y `command(<comando exacto>)`; `edit_file` no existe. Pedirle que use únicamente esos comandos, uno por vez. Trabajar en un worktree propio con un enlace a `node_modules`. Si se cuelga, terminar su proceso y completar a mano.
- Revisar siempre el trabajo delegado: `npm run check`, `npx vitest run`, búsqueda de bytes de control y diff de tamaño esperado; para cambios críticos, un revisor independiente.

## 6. Trampas conocidas

- **Bytes de control:** un script de Python con cadenas no crudas convierte `\u0000` en un NUL real (y `\u001f` en un byte de control); git trata el archivo como binario y el diff se infla. Escribir `\\u0000` o usar la herramienta de edición, y verificar siempre que ningún archivo tocado tenga bytes menores a 0x20 (salvo tabulación, LF y CR).
- **Saltos de línea:** el árbol de trabajo está en CRLF (`core.autocrlf=true`). Al editar con scripts, leer y escribir con `newline=""` conservando el estilo del archivo. Comprobar `git diff --stat`.
- **Regla de arquitectura funcional** (`test/functional-architecture.test.ts`): los archivos `*.domain.ts` no pueden usar `let`, métodos que mutan colecciones (`push`, `sort`, `splice`…), `globalThis` ni acceso a procesos o archivos.
- Vitest solo descubre `test/**/*.test.ts` (no `.tsx`). Los CSS Modules exigen que cada selector tenga una clase local.
- Heredocs largos con comillas fallaron una vez en el shell: usar la herramienta de escritura de archivos.
- `gh` es lento: usar `timeout` y no encadenar muchas consultas.

## 7. Verificación estándar antes de commitear

`npm run check` (tsc), `npx vitest run` (línea base al cierre: 251 archivos, 2652 pruebas, con 3 archivos y 14 pruebas omitidas), búsqueda de bytes de control en los archivos tocados y `git diff --stat` con un tamaño razonable.

## 8. Cuentas y series de referencia

- Salas Zoom: `sala01` a `sala08` (y más) `@flacso.edu.uy`. La cuenta administradora de Sala Virtual es `web@flacso.edu.uy` (rol Administración); se usó como actor de auditoría en las acciones de esta sesión, con aval de la persona usuaria.
- Documentos en `main`: `docs/superpowers/specs/2026-11-04-panel-series-zoom-design.md`, `docs/superpowers/plans/2026-11-04-panel-series-zoom.md`, `docs/despliegue-ec2.md` (requisito del worker al retirar la bandera).
