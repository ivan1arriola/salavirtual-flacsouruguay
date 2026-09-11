---
name: flacso-meet
description: Trabajar en Sala Virtual FLACSO. Usar para cambios de Next.js, TypeScript, Prisma, PostgreSQL, Google Meet, Google Workspace, reuniones, cohosts, hosts sala01-sala10, agenda, asistencia, grabaciones, staff, CI o despliegue de este repositorio.
---

# Sala Virtual FLACSO

## Stack

- Node.js 24
- Next.js 16 App Router
- TypeScript
- React 19
- Prisma 6
- PostgreSQL
- Auth.js / NextAuth
- Google Workspace APIs
- Vitest
- GitHub Actions
- Producción en EC2

## Propósito del repositorio

Este repositorio es la aplicación operativa vigente para Google Meet de FLACSO Uruguay.

Los cambios actuales de:

- reuniones;
- solicitudes;
- agenda;
- asistencia;
- grabaciones;
- liquidaciones;
- Google Meet;
- Google Workspace;

deben implementarse aquí.

Los antiguos proyectos de Zoom son históricos y no deben considerarse la fuente operativa actual.

## Principios de arquitectura

El núcleo de la aplicación debe mantenerse lo más agnóstico posible respecto del proveedor.

Google Meet es el proveedor operativo principal.

Zoom se conserva únicamente para:

- historial;
- trazabilidad;
- importación;
- registros previos.

No volver a acoplar la lógica de negocio directamente a Zoom.

Antes de cambiar arquitectura o dominio, revisar:

- `docs/arquitectura.md`
- `docs/modelo-3nf.md`
- `docs/migracion-desde-flacso-zoom.md`
- `docs/configuracion-google-workspace.md`
- `prisma/schema.prisma`

La arquitectura vigente distingue especialmente:

- `SolicitudSala`: solicitud académica;
- `InstanciaSala`: encuentro concreto;
- `EventoProveedor`: representación y estado de integración con el proveedor externo.

No mezclar estas responsabilidades.

## Next.js 16

Este repositorio usa Next.js 16 y puede contener APIs, convenciones o comportamientos diferentes de versiones anteriores.

Antes de implementar o modificar código dependiente de Next.js, revisar primero la documentación relevante instalada en:

```text
node_modules/next/dist/docs/
```

También revisar `AGENTS.md`.

No asumir que una API o convención conocida de versiones anteriores de Next.js sigue siendo válida.

## Entorno local

Usar Node.js 24.

Comprobar:

```bash
node --version
npm --version
```

Instalación:

```bash
npm install
npm run db:generate
```

### Desarrollo con túnel PostgreSQL

`npm run dev` no inicia Next.js directamente.

Actualmente ejecuta:

1. un túnel SSH hacia `servidor-flacso`;
2. publica PostgreSQL remoto en `127.0.0.1:15432`;
3. inicia Next.js mediante `npm run dev:next`.

Comando:

```bash
npm run dev
```

El túnel equivale a:

```bash
ssh -N   -o ExitOnForwardFailure=yes   -o ServerAliveInterval=30   -L 15432:127.0.0.1:5432   servidor-flacso
```

Antes de usar `npm run dev`:

- comprobar qué `DATABASE_URL` está activo;
- comprobar si el puerto `15432` ya está ocupado;
- no asumir que una base accesible mediante `15432` es una base local;
- no iniciar un segundo túnel si ya existe uno;
- considerar una conexión a producción como de solo lectura salvo autorización explícita.

Para iniciar solamente Next.js, sin crear el túnel SSH:

```bash
npm run dev:next
```

No ejecutar scripts que modifican datos reales sin entender primero qué base está configurada en `DATABASE_URL`.

## Seguridad

Nunca versionar:

- `.env`
- `.env.local`
- `DATABASE_URL` real
- contraseñas
- tokens
- claves privadas
- service account JSON
- OAuth secrets
- claves SSH
- `CONFIG_ENCRYPTION_KEY`

No imprimir secretos completos en consola o logs.

Si es necesario diagnosticar configuración:

- mostrar únicamente nombres de variables;
- enmascarar contraseñas, tokens y claves;
- evitar copiar secretos completos a issues, PRs, logs o respuestas.

Las credenciales de Google Workspace gestionadas por la aplicación se almacenan cifradas en PostgreSQL.

No moverlas arbitrariamente a variables `GOOGLE_*`.

`CONFIG_ENCRYPTION_KEY` sí pertenece al entorno de runtime y debe tratarse como secreto crítico.

## Base de datos

La aplicación usa Prisma + PostgreSQL.

Antes de modificar modelos:

1. revisar `prisma/schema.prisma`;
2. localizar todos los usos del modelo;
3. revisar tests;
4. determinar si se requiere migración;
5. revisar posibles datos existentes;
6. revisar restricciones, índices y relaciones afectadas;
7. evaluar compatibilidad con producción.

Generar Prisma cuando corresponda:

```bash
npm run db:generate
```

No usar:

```bash
npm run db:push
```

contra producción.

No usar:

```bash
npm run db:migrate
```

contra producción desde el entorno local.

Si el entorno local apunta a producción, considerarlo de solo lectura salvo autorización explícita.

No ejecutar scripts con `--apply` sobre producción durante una investigación.

## Migraciones Prisma

Los cambios de schema que deban llegar a producción deben quedar representados mediante migraciones versionadas en:

```text
prisma/migrations/
```

Flujo recomendado:

1. modificar `prisma/schema.prisma`;
2. crear la migración en un entorno de desarrollo;
3. revisar el SQL generado;
4. ejecutar tests;
5. validar compatibilidad con datos existentes;
6. versionar schema y migración juntos.

No generar migraciones directamente contra producción.

El despliegue EC2 ejecuta automáticamente:

```bash
npx prisma migrate deploy
```

usando la `DATABASE_URL` de producción antes de activar el nuevo release.

Por tanto, una migración incorporada a `main` puede modificar producción automáticamente durante el despliegue.

Revisar especialmente:

- `DROP`;
- cambios `NOT NULL`;
- renombres;
- conversiones de tipo;
- índices únicos;
- claves foráneas;
- backfills requeridos;
- compatibilidad entre versión anterior y nueva durante el cambio de release.

## Scripts destructivos o de backfill

Este repositorio incluye scripts que pueden modificar muchos registros.

Muchos tienen versión dry-run y versión apply.

Preferir siempre dry-run primero.

Ejemplos:

```bash
npm run migrate:users:dry
npm run migrate:meetings:dry
npm run cleanup:cancelled-instances:dry
npm run unificar:links-series:dry
npm run backfill:auto-cohosts:dry
npm run assign:meet-hosts:dry
npm run recalcular:estados-reuniones:dry
```

No ejecutar automáticamente variantes que escriben datos sin autorización explícita.

Antes de un backfill:

1. leer el script completo;
2. identificar tablas afectadas;
3. confirmar qué `DATABASE_URL` está activa;
4. comprobar si llama APIs externas;
5. ejecutar dry-run;
6. revisar cantidad y tipo de registros afectados;
7. solo entonces considerar `--apply`.

## Google Meet

Antes de modificar reuniones de Meet, distinguir:

- host;
- organizador;
- cohost;
- creador de la solicitud;
- docente;
- asistente técnico;
- cuenta de sala;
- credencial Google Workspace usada;
- espacio Meet;
- evento Calendar;
- membresías del espacio;
- estado local;
- estado real de Google.

No asumir que mostrar `cohost` en la interfaz significa que Google Meet tenga efectivamente configurado ese rol.

Cuando se cambien cohosts, comprobar tanto:

1. estado persistido en PostgreSQL;
2. estado real sincronizado en Google Meet.

## Hosts y cohosts

Las cuentas institucionales:

```text
sala01@flacso.edu.uy
sala02@flacso.edu.uy
...
sala10@flacso.edu.uy
```

son las organizadoras/hosts operativas de las reuniones cuando corresponde.

No reemplazar al host por el docente simplemente porque el docente creó la solicitud.

Para las reuniones operativas:

- el docente de la solicitud debe quedar configurado como cohost;
- los asistentes técnicos asignados deben quedar configurados como cohosts;
- pueden utilizarse cuentas Google externas válidas;
- una cuenta no necesita pertenecer a `@flacso.edu.uy` para ser cohost si Google la reconoce correctamente.

Una invitación de Google Calendar no demuestra que la persona sea cohost en Meet.

Una fila en PostgreSQL tampoco demuestra que Google Meet haya aplicado el rol.

La verificación real debe contemplar las memberships del espacio Meet.

Antes de cambiar esta lógica revisar:

- creación de reuniones;
- sincronización con Google;
- actualización de memberships;
- verificación de cohosts;
- backfills;
- scripts existentes;
- tests.

Scripts relacionados existentes:

```bash
npm run actualizar:cohosts-serie
npm run resync:cohosts
npm run backfill:auto-cohosts:dry
npm run backfill:auto-cohosts:local
npm run backfill:auto-cohosts
npm run sync:existing-cohosts
```

No ejecutar variantes que sincronizan masivamente con Google sin autorización explícita.

## Google Meet Developer Preview

La administración de cohosts mediante `spaces.members` depende de capacidades de Google Meet que requieren configuración específica.

Para que funcione correctamente deben verificarse, como mínimo:

- scope `meetings.space.created`;
- Domain-wide Delegation;
- identidad correcta de la cuenta organizadora;
- permisos sobre el espacio;
- habilitación del proyecto en Google Workspace Developer Preview Program.

Si esta configuración falla, puede ocurrir que:

- Calendar invite correctamente a la persona;
- el evento exista;
- la aplicación muestre el correo esperado;
- pero Google Meet no la promueva realmente a `COHOST`.

No diagnosticar estos casos mirando únicamente PostgreSQL.

## Google Workspace

La credencial Principal es la autorizada para crear reuniones nuevas.

Las credenciales Legacy existen para operar sobre reuniones históricas cuando la credencial principal no tiene permisos suficientes.

No cambiar indiscriminadamente el mecanismo Principal/Legacy.

Antes de modificar esta integración revisar:

```text
docs/configuracion-google-workspace.md
```

El fallback Legacy debe limitarse a los casos de permisos históricos previstos por la arquitectura.

No utilizar Legacy como fallback genérico para:

- errores de red;
- errores de scopes generales;
- fallos de Calendar;
- errores 5xx;
- problemas de configuración local.

## Idempotencia e integración externa

Antes de modificar provisionamiento o reintentos revisar el flujo de `EventoProveedor`.

El `externalEventId` debe conservarse inmediatamente después de crear correctamente el evento de Calendar.

La creación del evento, el polling de conferencia y la configuración de Meet son pasos separados y reintentables.

Si existe `externalEventId`, un retry no debe realizar un nuevo POST para crear otro evento.

No provocar reuniones duplicadas como mecanismo de recuperación.

Distinguir:

- `estadoIntegracion`: resultado de la última sincronización;
- `operacionPendiente`: operación externa que todavía debe aplicarse.

Las operaciones pendientes pueden incluir, según la arquitectura vigente:

- `PROVISIONAR`;
- `REPROGRAMAR`;
- `CONFIGURAR_MEET`;
- `CANCELAR`.

Los retries deben ejecutar la operación persistida correspondiente.

No inferir arbitrariamente la operación a partir de un texto de error.

Respetar los mecanismos existentes de:

- locks;
- claims;
- retries;
- idempotencia;
- timeouts;
- cancelación lógica;
- protección contra workers obsoletos.

Las llamadas HTTP externas no deben introducir decisiones de negocio que pertenezcan al dominio.

## Correo

Las notificaciones usan preferentemente Gmail API.

SMTP es fallback.

Una falla de proveedor de correo no debe necesariamente romper el flujo interno si la arquitectura vigente contempla continuar con notificaciones internas.

No introducir credenciales SMTP en código.

No convertir SMTP en proveedor principal sin una decisión explícita.

## UI / UX

Para cambios visuales usar `frontend-design` cuando esté disponible.

Prioridades:

- mobile-first;
- diseño responsive;
- jerarquía visual clara;
- estados de loading;
- estados vacíos;
- mensajes de error útiles;
- accesibilidad;
- mantener consistencia visual;
- evitar dependencias innecesarias;
- respetar la UI ligera definida por el proyecto.

No modificar lógica de negocio como parte de un cambio puramente visual salvo que sea necesario.

Antes de introducir librerías de componentes o frameworks CSS, revisar:

```text
docs/ui-ligera.md
docs/arquitectura.md
```

## Tests

Ejecutar primero el test más específico relacionado con el cambio.

Suite completa:

```bash
npm test
```

Comprobación TypeScript:

```bash
npm run check
```

Validación del schema:

```bash
npm run validate:schema
```

Build:

```bash
npm run build
```

Antes de considerar un cambio terminado ejecutar, como mínimo, lo relevante de:

```bash
npm run check
npm test
npm run validate:schema
npm run build
```

No afirmar que una corrección funciona sin haber ejecutado las verificaciones correspondientes.

Cuando el cambio afecta Google Meet:

- probar reglas de dominio;
- probar adaptadores cuando sea posible;
- verificar errores y retries;
- comprobar que no se creen eventos duplicados;
- comprobar el estado real de Google si la prueba requiere integración externa.

## CI

El workflow principal es:

```text
CI · Sala Virtual
```

Se ejecuta en:

- pull requests;
- pushes a `main`.

Actualmente comprueba:

- instalación de dependencias;
- validación del schema;
- validación Prisma;
- TypeScript;
- tests;
- cobertura;
- auditoría de dependencias críticas;
- build de producción.

La cobertura exigida actualmente es de al menos 80 %.

Usar `gh-fix-ci` cuando fallen GitHub Actions.

No modificar tests solamente para conseguir un CI verde si el comportamiento probado sigue siendo requerido.

## Git, main y producción

Un `push` exitoso a `main` puede terminar automáticamente desplegado en producción.

Flujo actual:

```text
push a main
    ↓
CI · Sala Virtual
    ↓
CI exitoso
    ↓
Deploy · EC2
    ↓
producción
```

No hacer push o merge a `main` únicamente para guardar trabajo.

No asumir que `main` es una rama segura de experimentación.

Antes de llevar un cambio a `main`:

1. revisar diff;
2. revisar migraciones;
3. ejecutar verificaciones;
4. evaluar efectos sobre producción;
5. comprobar que no haya scripts o cambios de configuración peligrosos.

## Despliegue EC2

Producción utiliza EC2.

Rutas principales:

```text
/srv/apps/salavirtual-flacso/source
/srv/apps/salavirtual-flacso/current
/srv/apps/salavirtual-flacso/releases
/srv/apps/salavirtual-flacso/shared/.env.production
```

Servicio:

```text
salavirtual.service
```

Puerto interno:

```text
127.0.0.1:3101
```

Healthcheck:

```text
http://127.0.0.1:3101/api/health
```

El despliegue actual:

1. obtiene el SHA aprobado;
2. actualiza el checkout de `main`;
3. instala dependencias;
4. ejecuta build;
5. prepara un release inmutable;
6. ejecuta `prisma migrate deploy`;
7. cambia el symlink `current`;
8. reinicia `salavirtual.service`;
9. ejecuta healthcheck;
10. hace rollback al release anterior si el healthcheck falla.

No modificar manualmente archivos dentro de un release activo como solución permanente.

Los cambios deben venir del repositorio y del flujo de despliegue salvo emergencia explícita.

## Diagnóstico en producción

Para comprobar el servicio:

```bash
sudo systemctl status salavirtual.service --no-pager
```

Healthcheck:

```bash
curl -fsS http://127.0.0.1:3101/api/health
```

Logs:

```bash
sudo journalctl -u salavirtual.service -n 100 --no-pager
```

Para seguimiento en vivo:

```bash
sudo journalctl -u salavirtual.service -f
```

Antes de afirmar que producción funciona correctamente, comprobar como mínimo:

- servicio activo;
- healthcheck;
- base accesible;
- ausencia de errores críticos recientes;
- funcionalidad afectada por el cambio.

## Debugging

Ante un bug:

1. reproducir el problema;
2. identificar el flujo real;
3. revisar estado local;
4. revisar estado externo;
5. inspeccionar logs;
6. encontrar la causa raíz;
7. crear o actualizar un test cuando corresponda;
8. implementar el cambio mínimo;
9. ejecutar tests específicos;
10. ejecutar `npm run check`;
11. ejecutar `npm run validate:schema` si afecta datos;
12. ejecutar build si afecta runtime o UI.

Para problemas de Google Meet, no limitar el diagnóstico a PostgreSQL.

Verificar también, según corresponda:

- evento Calendar;
- espacio Meet;
- organizer;
- host sala;
- memberships;
- rol real `COHOST`;
- scopes;
- Developer Preview;
- credencial Principal;
- credenciales Legacy;
- operación pendiente;
- error de integración;
- payload de última sincronización.

## Pull Requests

Usar `gh-address-comments` cuando existan comentarios de revisión pendientes.

Antes de cerrar un PR o considerarlo terminado:

- resolver comentarios;
- comprobar CI;
- revisar migraciones;
- revisar cambios que puedan disparar deploy;
- evitar merges si hay dudas sobre producción.

## Planificación

Para cambios grandes que afecten varios módulos, utilizar las skills de planificación de Superpowers.

Un plan debe identificar:

- flujo actual;
- flujo deseado;
- modelos afectados;
- APIs externas;
- cambios Prisma;
- migraciones;
- scripts/backfills;
- tests;
- riesgos;
- rollout;
- rollback;
- despliegue.

Para bugs complejos utilizar un flujo de debugging sistemático antes de modificar código.

## Regla principal

Las instrucciones explícitas del usuario tienen prioridad sobre esta skill.
