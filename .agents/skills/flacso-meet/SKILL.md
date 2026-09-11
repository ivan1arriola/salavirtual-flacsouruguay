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

Desarrollo:

```bash
npm run dev
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

Las credenciales de Google Workspace gestionadas por la aplicación se almacenan cifradas en PostgreSQL. No moverlas arbitrariamente a variables `GOOGLE_*`.

## Base de datos

La aplicación usa Prisma + PostgreSQL.

Antes de modificar modelos:

1. revisar `prisma/schema.prisma`;
2. localizar usos del modelo;
3. revisar tests;
4. determinar si se requiere migración;
5. revisar posibles datos existentes.

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

No ejecutar automáticamente las variantes que escriben datos sin autorización explícita.

## Google Meet

Antes de modificar reuniones de Meet, distinguir:

- host;
- cohost;
- creador de la solicitud;
- docente;
- asistente técnico;
- cuenta de sala;
- credencial Google Workspace usada;
- espacio Meet;
- membresías del espacio.

No asumir que mostrar "cohost" en la interfaz significa que Google Meet tenga efectivamente configurado ese rol.

Cuando se cambien cohosts, comprobar tanto:

1. estado persistido en PostgreSQL;
2. estado real sincronizado en Google Meet.

## Hosts

Las cuentas institucionales de sala, como:

```text
sala01@flacso.edu.uy
sala02@flacso.edu.uy
...
```

actúan como hosts operativos cuando corresponde.

No reemplazar al host por el docente simplemente porque el docente creó la solicitud.

Los docentes que crean reuniones deben quedar correctamente representados como cohosts cuando la lógica del producto lo requiera.

Los asistentes técnicos asignados también pueden requerir cohost.

Antes de cambiar esta lógica revisar:

- creación de reuniones;
- sincronización con Google;
- actualización de memberships;
- backfills;
- scripts existentes de cohosts;
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

No ejecutar las variantes que sincronizan masivamente con Google sin autorización explícita.

## Google Workspace

La credencial Principal es la autorizada para crear nuevas reuniones.

Las credenciales Legacy existen para operar sobre reuniones históricas cuando la credencial principal no tiene permisos suficientes.

No cambiar indiscriminadamente el mecanismo Principal/Legacy.

Antes de modificar esta integración revisar:

```text
docs/configuracion-google-workspace.md
```

El fallback Legacy debe limitarse a casos de permisos que realmente lo requieran.

## Correo

Las notificaciones usan preferentemente Gmail API.

SMTP es fallback.

Una falla de proveedor de correo no debe necesariamente romper el flujo interno si la arquitectura vigente contempla continuar con notificaciones internas.

No introducir credenciales SMTP en código.

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
- mantener consistencia visual.

No modificar lógica de negocio como parte de un cambio visual salvo que sea necesario.

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

## Debugging

Ante un bug:

1. reproducir el problema;
2. identificar el flujo real;
3. revisar estado local y estado externo;
4. inspeccionar logs;
5. encontrar la causa raíz;
6. crear o actualizar un test cuando corresponda;
7. implementar el cambio mínimo;
8. ejecutar tests;
9. ejecutar `npm run check`;
10. ejecutar build si afecta runtime o UI.

Para problemas de Google Meet, no limitar el diagnóstico a PostgreSQL: verificar también la llamada o sincronización con Google.

## CI

Usar `gh-fix-ci` cuando fallen GitHub Actions.

No modificar tests solamente para conseguir un CI verde si el comportamiento probado sigue siendo requerido.

## Pull Requests

Usar `gh-address-comments` cuando existan comentarios de revisión pendientes.

## Planificación

Para cambios grandes que afecten varios módulos, utilizar las skills de planificación de Superpowers.

Un plan debe identificar:

- flujo actual;
- flujo deseado;
- modelos afectados;
- APIs externas;
- cambios Prisma;
- scripts/backfills;
- tests;
- riesgos;
- despliegue.

## Regla principal

Las instrucciones explícitas del usuario tienen prioridad sobre esta skill.
