# Capas y encapsulamiento del monolito modular

- **Fecha:** 19 de setiembre de 2026
- **Estado:** Especificación de diseño para revisión
- **Aplicación:** Sala Virtual FLACSO

## 1. Objetivo

Sala Virtual adoptará un monolito modular con cinco capas explícitas por módulo:

```text
presentación -> aplicación -> dominio
                     |
                     v
                  puertos <- infraestructura
```

La separación debe permitir que el equipo cambie una interfaz, una regla de negocio o un proveedor externo sin trasladar ese cambio a las demás capas. La refactorización conservará el comportamiento observable, el modelo de datos y los contratos HTTP durante las primeras etapas.

El trabajo reforzará las fronteras que el repositorio ya aplica mediante archivos `*.domain.ts`, `*.service.ts` y `*.adapter.ts`. El equipo migrará un flujo funcional por vez y mantendrá fachadas temporales para los consumidores que todavía usen la ubicación anterior.

## 2. Alcance

La arquitectura objetivo cubre:

- páginas, componentes, Route Handlers y acciones de servidor;
- casos de uso de reuniones, conferencias, asistencia y usuarios;
- acceso a PostgreSQL mediante Prisma;
- integraciones con Google Calendar, Meet, Drive y Gmail;
- notificaciones internas, correo y futuros canales;
- scripts, tareas periódicas y procesos de reparación;
- pruebas automáticas de dependencias entre capas y módulos.

La primera ronda no cambiará tablas, relaciones, URL públicas, payloads HTTP ni reglas operativas. Una etapa posterior podrá incorporar una bandeja de operaciones persistente si el equipo aprueba su migración y despliegue.

## 3. Fuera de alcance

Este programa no introduce:

- microservicios;
- un framework de inyección de dependencias;
- repositorios genéricos;
- un bus externo como Kafka o RabbitMQ;
- una reescritura simultánea del repositorio;
- cambios de interfaz sin una necesidad funcional asociada;
- cambios automáticos en producción o migraciones ejecutadas desde el entorno local.

## 4. Módulos funcionales

La arquitectura usará estos límites de negocio:

| Módulo           | Responsabilidad                                              | Código actual relacionado                                                |
| ---------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `identity`       | autenticación, usuarios, roles y cuentas Google              | `auth.ts`, `src/lib/auth`, `src/modules/usuarios`                        |
| `programas`      | programas, docentes y permisos académicos                    | `src/modules/programas`, partes de `usuarios` y `reuniones`              |
| `reuniones`      | solicitudes, series, encuentros e instancias                 | `src/modules/solicitudes`, `src/modules/reuniones`                       |
| `conferencias`   | aprovisionamiento y estado del proveedor de videoconferencia | `src/modules/meet/provider.ts`, provisionamiento y operaciones de `meet` |
| `asistencia`     | disponibilidad, postulaciones, asignaciones y reportes       | `src/modules/asistencia`, `src/modules/asistencias`                      |
| `archivos`       | grabaciones, transcripciones, notas y artefactos             | adaptadores y servicios de artefactos dentro de `src/modules/meet`       |
| `notificaciones` | intención de notificación, destinatarios y canales           | `src/modules/notificaciones` y envío de correo disperso                  |
| `liquidaciones`  | tarifas, horas, cierres y pagos                              | partes de `src/modules/asistencia`                                       |
| `configuracion`  | configuración administrativa e integraciones                 | `src/modules/configuracion`                                              |
| `auditoria`      | registro transversal de acciones                             | escrituras a `Auditoria` dispersas                                       |

`dashboard`, `mobile-admin`, `migracion`, `historico` e `historico-zoom` seguirán como módulos de consulta o compatibilidad mientras el equipo identifica sus dependencias. El programa no los forzará dentro de un dominio que no represente su función.

## 5. Estructura por módulo

Cada módulo migrado usará esta estructura:

```text
src/modules/<modulo>/
├── presentation/
│   ├── components/
│   ├── http/
│   ├── presenters/
│   ├── schemas/
│   └── view-models/
├── application/
├── domain/
├── ports/
├── infrastructure/
├── api.ts
└── presentation.ts
```

El equipo creará solo las carpetas que un flujo necesite. Un módulo sin componentes visuales puede omitir `presentation/components`; uno sin proveedor externo puede omitir la parte correspondiente de `infrastructure`.

### 5.1. Presentación

`presentation` contiene adaptadores orientados a personas o HTTP:

- componentes React específicos del módulo;
- controladores para Route Handlers y acciones de servidor;
- esquemas que validan la forma de una solicitud;
- presenters que convierten resultados de aplicación en respuestas HTTP o view models;
- mensajes y estados de interfaz.

La capa puede importar contratos de `application` y utilidades compartidas de presentación. No puede importar Prisma, clientes Google, variables de entorno ni archivos de `infrastructure`.

La validación de formato pertenece a presentación. Las reglas como permisos, conflictos horarios, estados permitidos y transiciones pertenecen a dominio o aplicación.

### 5.2. Aplicación

`application` implementa casos de uso. Cada caso de uso:

- recibe una entrada tipada y dependencias explícitas;
- coordina reglas de dominio y puertos;
- define el límite de transacción cuando corresponde;
- devuelve un resultado tipado y ajeno a HTTP, React o Prisma;
- distingue el cambio local confirmado de una operación externa pendiente.

La capa puede importar `domain` y `ports`. No puede importar Next.js, React, Prisma, `google-auth-library`, Nodemailer ni `process.env`.

### 5.3. Dominio

`domain` contiene tipos, reglas, planes y decisiones puras. Mantendrá el enfoque funcional vigente:

- datos `readonly`;
- funciones puras;
- reloj, identificadores y azar recibidos como argumentos;
- resultados discriminados para decisiones que puedan fallar;
- ausencia de red, base de datos, framework, consola o estado global mutable.

Un dominio no importa otro módulo por una ruta interna. Si necesita una capacidad externa, `application` la representa mediante un puerto o consume la API pública del otro módulo.

### 5.4. Puertos

`ports` define las capacidades externas que requieren los casos de uso. Los contratos usarán lenguaje del negocio:

```ts
export type ConferenceProvider = Readonly<{
  provisionar(input: ProvisionarConferenciaInput): Promise<ConferenciaProvisionada>;
  reprogramar(input: ReprogramarConferenciaInput): Promise<ConferenciaConfirmada>;
  cancelar(input: CancelarConferenciaInput): Promise<void>;
  actualizarCohosts(input: ActualizarCohostsInput): Promise<EstadoCohosts>;
}>;
```

Los puertos no expondrán tipos de Prisma, respuestas HTTP de Google ni objetos de Next.js. El programa evitará contratos CRUD genéricos como `BaseRepository<T>`.

### 5.5. Infraestructura

`infrastructure` implementa puertos mediante Prisma, Google y los transportes de notificación. Puede importar bibliotecas externas, `ports` y tipos estables de `domain` o `application`. No decide permisos, estados de negocio ni políticas de asignación.

Los adaptadores Prisma traducen registros a modelos o DTOs de aplicación. Los adaptadores Google traducen errores y respuestas del proveedor a resultados definidos por los puertos.

## 6. Dependencias permitidas

| Origen           | Puede importar                                                 | No puede importar                                     |
| ---------------- | -------------------------------------------------------------- | ----------------------------------------------------- |
| `presentation`   | `application`, API pública del módulo, presentación compartida | `infrastructure`, Prisma, Google, entorno             |
| `application`    | `domain`, `ports`, APIs públicas de otros módulos              | Next.js, React, Prisma, SDK de proveedores            |
| `domain`         | archivos del mismo dominio y tipos puros compartidos           | otras capas, otros módulos internos, efectos externos |
| `ports`          | tipos puros de `domain` o contratos propios                    | implementaciones, frameworks, variables de entorno    |
| `infrastructure` | `ports`, `domain`, `application`, bibliotecas externas         | `presentation`, reglas de UI                          |
| `bootstrap`      | todas las capas necesarias para componer un flujo              | reglas de negocio nuevas                              |

Los módulos se comunican mediante `api.ts`. La capa de presentación expone sus componentes permitidos mediante `presentation.ts`; este archivo no reexporta código de servidor hacia un Client Component.

## 7. Next.js y la capa de presentación

Next.js 16 exige que `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx` y `route.ts` permanezcan dentro de `app/`. Esos archivos conservarán la configuración de ruta, resolverán `params` y delegarán el trabajo al módulo correspondiente.

Ejemplo de Route Handler:

```ts
import { crearReunionesHttp } from "@/src/bootstrap/reuniones.server";

export const POST = crearReunionesHttp().post;
```

Ejemplo de página:

```tsx
import { cargarAgendaPage } from "@/src/bootstrap/reuniones.server";
import { AgendaPageView } from "@/src/modules/reuniones/presentation";

export default async function Page() {
  const model = await cargarAgendaPage();
  return <AgendaPageView model={model} />;
}
```

Los componentes serán Server Components salvo que necesiten estado, eventos o APIs del navegador. Un archivo con `"use client"` solo importará componentes y contratos aptos para el cliente.

La presentación compartida vivirá en:

```text
src/presentation/
├── components/
├── layouts/
├── formatting/
└── styles/
```

Ese directorio contiene piezas visuales reutilizables. Los componentes que expresen reuniones, asistencia o grabaciones pertenecen a la presentación de su módulo.

## 8. Composición de dependencias

`src/bootstrap/*.server.ts` actuará como raíz de composición. Cada archivo construirá casos de uso con implementaciones concretas:

```text
app/route.ts
    |
    v
bootstrap/reuniones.server.ts
    |-- presentation/http
    |-- application/crear-reunion
    |-- infrastructure/prisma
    |-- infrastructure/google
    `-- infrastructure/notificaciones
```

Los archivos de bootstrap pueden importar `db`, configuración cifrada y adaptadores concretos. No contienen consultas, validaciones ni decisiones del negocio.

El sufijo `.server.ts` y la protección `server-only` evitarán que React incluya credenciales o Prisma en el grafo cliente.

## 9. Integraciones Google

Los clientes técnicos compartidos quedarán fuera de los dominios:

```text
src/integrations/google/
├── auth/
├── calendar/
├── meet/
├── drive/
└── gmail/
```

Estos clientes administran autenticación, scopes, URLs, paginación, timeouts y respuestas HTTP. No conocen roles FLACSO, asignaciones de asistentes, programas ni permisos académicos.

`conferencias/infrastructure/google` coordinará Calendar y Meet para implementar `ConferenceProvider`. `archivos/infrastructure/google` combinará Meet y Drive para implementar `ArtifactProvider`. `asistencia/infrastructure/google` publicará eventos personales mediante un puerto de calendario.

La refactorización preservará:

- la credencial Principal para reuniones nuevas;
- el fallback Legacy limitado a permisos de reuniones históricas;
- el guardado temprano de `externalEventId`;
- los claims, leases, timeouts y operaciones pendientes;
- la verificación real de cohosts mediante memberships;
- la prohibición de duplicar eventos durante reintentos.

## 10. Autenticación y calendario del asistente

`auth.ts` quedará como adaptador de Auth.js. Resolverá credenciales, construirá la sesión y traducirá errores de acceso. No importará Prisma, cifrado ni adaptadores Calendar.

La vinculación de una cuenta Google producirá un resultado de aplicación que puede solicitar `ReconciliarCalendarioAsistente`. Durante la primera etapa, un despachador interno conservará el comportamiento vigente y aislará los errores de Calendar. El flujo periódico existente seguirá reconciliando reuniones futuras.

El equipo retirará cualquier operación de red del camino crítico del login después de contar con una entrega durable. Si esa garantía requiere una bandeja persistente, el equipo preparará una especificación de migración, rollout y rollback antes de modificar Prisma.

## 11. Repositorios y transacciones

El programa creará repositorios donde un agregado o caso de uso necesite una frontera estable. Cada contrato expresará operaciones del negocio, por ejemplo `obtenerSerieParaReprogramar` o `guardarProvisionConfirmada`.

Las operaciones que dependen de bloqueos, transacciones o actualizaciones atómicas pueden conservar una implementación Prisma especializada. El caso de uso define la intención; el adaptador garantiza la atomicidad sin filtrar tipos Prisma hacia arriba.

La migración no envolverá cada tabla en un repositorio ni ocultará consultas de lectura que ya funcionan como adaptadores de proyección.

## 12. Notificaciones

Los módulos solicitarán una notificación mediante una intención tipada:

```ts
type NotificationRequest = Readonly<{
  type: NotificationType;
  recipient: NotificationRecipient;
  content: NotificationContent;
  href?: string;
  metadata?: Readonly<Record<string, string>>;
}>;
```

`notificaciones/application` decidirá destinatarios y canales según reglas y preferencias. Los adaptadores de Gmail, SMTP y futuros canales implementarán puertos separados. Las plantillas no conocerán el transporte.

Una falla de correo respetará la semántica vigente: el caso de uso local no fallará cuando el sistema admita registrar o reintentar la notificación.

## 13. Scripts y jobs

Los scripts se limitarán a:

1. interpretar argumentos;
2. construir dependencias mediante bootstrap;
3. invocar un caso de uso;
4. presentar el resultado y definir el código de salida.

Las rutas cron y los timers de systemd seguirán la misma regla. La lógica de sincronización, reparación o backfill vivirá en `application` y podrá ejecutarse desde HTTP o CLI sin duplicación.

Los scripts que puedan escribir datos mantendrán dry-run, confirmación explícita y verificación de la base activa.

## 14. Estrategia incremental

El programa se dividirá en planes ejecutables independientes:

| Etapa | Entrega                                                                         |
| ----- | ------------------------------------------------------------------------------- |
| 1     | mapa de dependencias, convenciones, pruebas de arquitectura y estructura piloto |
| 2     | `identity` y separación de Auth.js respecto del calendario del asistente        |
| 3     | clientes técnicos Google Auth, Calendar y Meet sin cambiar `MeetProvider`       |
| 4     | módulo `conferencias`, puerto estable y caso de uso de cohosts                  |
| 5     | calendario del asistente con sus capas, puerto y adaptador Google               |
| 6     | notificaciones, plantillas y transportes encapsulados                           |
| 7     | `archivos` con puertos para Meet y Drive                                        |
| 8     | separación interna de asistencia y liquidaciones                                |
| 9     | presentación de reuniones y asistencia; rutas `app/` delgadas                   |
| 10    | conversión de scripts y cron en adaptadores de casos de uso                     |
| 11    | repositorios estratégicos y composición centralizada restante                   |
| 12    | eliminación de fachadas legacy y reglas completas de CI                         |

Cada etapa usará el patrón expandir, migrar y contraer:

1. agregar la nueva API y pruebas de caracterización;
2. mover una implementación sin cambiar el contrato externo;
3. migrar consumidores;
4. conservar una fachada temporal si quedan consumidores;
5. eliminar la fachada cuando las búsquedas y pruebas confirmen que no tiene usos.

## 15. Pruebas y controles automáticos

La suite incorporará `test/architecture-boundaries.test.ts`. La prueba inspeccionará imports y fallará ante estas dependencias:

- `domain` hacia Next.js, React, Prisma, Google, entorno u otras capas;
- `application` hacia presentación, infraestructura o SDK externos;
- `presentation` hacia infraestructura;
- imports entre rutas internas de módulos distintos;
- `integrations/google` hacia reglas de negocio;
- componentes cliente hacia archivos `.server.ts`.

`test/functional-architecture.test.ts` seguirá protegiendo pureza, reloj, mutación y efectos. Las nuevas reglas comenzarán sobre carpetas migradas para evitar cientos de excepciones permanentes. Cada etapa ampliará el conjunto protegido.

Cada entrega ejecutará, como mínimo:

```bash
npm run check
npm test
npm run validate:schema
npm run build
```

Las etapas de presentación incluirán revisión funcional y visual en `http://localhost:8000`. Las etapas Google incluirán pruebas de idempotencia, errores, reintentos y ausencia de eventos duplicados. Una prueba externa solo contará como verificación de cohosts cuando consulte memberships reales.

## 16. Compatibilidad, despliegue y rollback

Cada etapa debe poder desplegarse por separado y cumplir estas condiciones:

- mismo contrato HTTP o una compatibilidad documentada;
- ausencia de migraciones salvo aprobación específica;
- fachadas temporales para imports previos;
- cambio reversible mediante el commit de la etapa;
- CI completo antes de integrar a `main`;
- verificación separada de publicación, CI, despliegue y salud del servicio.

El equipo no moverá código y cambiará comportamiento en el mismo paso salvo que una prueba demuestre que ambos cambios forman una unidad indivisible. El despliegue conservará `prisma migrate deploy`, el healthcheck y el rollback de release vigentes.

## 17. Traspaso a otro agente

Otro agente ejecutará los planes derivados de esta especificación sin depender del historial de esta conversación. Cada plan debe incluir:

- objetivo, arquitectura y restricciones globales copiadas de esta especificación;
- rutas exactas de los archivos que crea, modifica y prueba;
- firmas completas de las interfaces que cada tarea consume y produce;
- pasos pequeños con prueba fallida, implementación mínima y prueba aprobada;
- comandos concretos y resultados esperados;
- pruebas de caracterización que preserven idempotencia, transacciones y contratos HTTP;
- un commit por entrega revisable;
- condiciones de rollback y controles previos a cualquier migración o despliegue;
- una lista de verificación que distinga validación local, publicación, CI, despliegue y producción.

El programa tendrá un plan rector que ordene las etapas y un plan ejecutable por etapa. El agente no debe intentar las doce etapas en un solo cambio ni crear carpetas vacías para anticipar trabajo futuro.

## 18. Criterios de aceptación

La refactorización se considerará completa cuando:

1. los módulos operativos usan `presentation`, `application`, `domain`, `ports` e `infrastructure` donde corresponda;
2. `app/` contiene archivos de convención y composición delgada, sin reglas de negocio ni consultas Prisma extensas;
3. los dominios y casos de uso no importan frameworks ni proveedores;
4. Prisma y Google quedan detrás de puertos en los flujos de escritura relevantes;
5. Calendar, Meet, Drive y Gmail tienen clientes técnicos separados;
6. Auth.js no ejecuta operaciones Google ajenas a autenticación en el camino crítico;
7. scripts, jobs y HTTP reutilizan los mismos casos de uso;
8. los módulos consumen APIs públicas y no rutas internas de otros módulos;
9. CI impide reintroducir dependencias prohibidas;
10. la suite, el build y las verificaciones funcionales conservan el comportamiento vigente.

## 19. Riesgos controlados

| Riesgo                                                   | Control                                                                     |
| -------------------------------------------------------- | --------------------------------------------------------------------------- |
| mover archivos rompe imports sin mejorar límites         | cada etapa debe eliminar una dependencia prohibida y agregar una prueba     |
| dos arquitecturas conviven sin fecha de salida           | cada fachada declara consumidores pendientes y la etapa que la elimina      |
| interfaces demasiado amplias ocultan reglas              | puertos orientados a casos de uso y revisión de tipos expuestos             |
| un barrel lleva código servidor al cliente               | entradas separadas `api.ts`, `presentation.ts` y bootstrap `.server.ts`     |
| separar Prisma rompe transacciones o locks               | adaptadores especializados conservan atomicidad y pruebas de concurrencia   |
| extraer Google altera fallbacks o retries                | pruebas de caracterización antes de mover cada operación                    |
| el login pierde la reconciliación de calendario          | mantener reconciliación vigente hasta contar con entrega durable verificada |
| una migración llega a producción con una refactorización | planes de datos separados y aprobación explícita antes de integrar          |
