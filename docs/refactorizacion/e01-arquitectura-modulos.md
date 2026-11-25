# E01.3 — Estructura de módulos, rutas y composición server

Línea base: `bfcbfc091277086b37a7ae499bc95e54fe441272`. Recuento estructural del árbol Git; no mide por sí solo acoplamiento de imports ni calidad de cada caso de uso.

## Estado actual de módulos

Hay 17 directorios en `src/modules`. Seis contienen las cuatro carpetas `domain`, `ports`, `application` e `infrastructure`: archivos, auditoria, conferencias, identity, liquidaciones y notificaciones. Asistencia contiene esas cuatro capas y presentation, pero conserva 28 archivos directamente en la raíz. Reuniones tiene presentation, pero no las otras cuatro capas y concentra 62 archivos en la raíz de un total de 89.

| Módulo | Estructura observada | Archivos en raíz / total |
| --- | --- | ---: |
| archivos | domain, ports, application, infrastructure | 2 / 84 |
| asistencia | domain, ports, application, infrastructure, presentation | 28 / 82 |
| auditoria | domain, ports, application, infrastructure | 1 / 6 |
| conferencias | domain, ports, application, infrastructure | 1 / 22 |
| configuracion | archivos planos | 18 / 18 |
| dashboard | archivos planos | 7 / 7 |
| historico | archivos planos | 2 / 2 |
| identity | domain, ports, application, infrastructure | 1 / 16 |
| liquidaciones | domain, ports, application, infrastructure | 2 / 20 |
| meet | compatibilidad/transición, archivos planos | 9 / 9 |
| migracion | archivos planos | 2 / 2 |
| mobile-admin | archivos planos | 2 / 2 |
| notificaciones | domain, ports, application, infrastructure | 4 / 21 |
| operaciones | archivos planos | 6 / 6 |
| programas | archivos planos | 2 / 2 |
| reuniones | presentation, archivos planos | 62 / 89 |
| usuarios | archivos planos | 25 / 25 |

El árbol confirma una arquitectura híbrida. La modularidad hexagonal está implementada en varios dominios, pero no es todavía la convención uniforme del repositorio. No conviene contar cada directorio como un módulo terminado: hay que revisar imports, dependencias y flujos reales.

## Concentración de responsabilidades

- `src/modules/reuniones/gestionar-encuentros.service.ts`: 909 líneas; concentra agregar, actualizar, eliminar encuentros y validación de gestión.
- `src/modules/asistencia/asistencia.service.ts`: 246 líneas en la línea base actual. La auditoría del 17 de octubre registraba 672 líneas; esa medición quedó desactualizada. La coexistencia con casos de uso de application debe revisarse operación por operación, no asumir duplicación completa.
- `src/bootstrap/ui/reuniones/reuniones-lista-meet-page.server.tsx`: 1.027 líneas.
- `src/bootstrap/ui/reuniones/reunion-operativa-page.server.tsx`: 741 líneas.
- `src/bootstrap/ui/reuniones/reunion-detail-page.server.tsx`: 641 líneas.
- `src/bootstrap/ui/reuniones/reuniones-lista-zoom-page.server.tsx`: 611 líneas.
- Hay 41 archivos bajo `src/bootstrap`; los más grandes se concentran en la composición de UI de reuniones y asistencia.

Estos archivos largos no son automáticamente defectos: una página de servidor puede componer una lectura compleja. El problema aparece si acumula consultas, reglas de negocio, autorización, integración externa y JSX en la misma unidad. E01 debe distinguir responsabilidades y dependencias antes de extraer código.

## Rutas de página y acceso a persistencia

El árbol contiene 42 archivos `page.tsx`. Una inspección de imports encontró 23 páginas que importan `@/src/lib/db` directamente. Esto no significa que las 23 ejecuten consultas Prisma propias: algunas pasan `db` a adaptadores o componen servicios; otras sí mezclan consulta, autorización y presentación.

Las rutas del grupo de gestión tampoco son uniformes: algunas son wrappers de dos líneas que delegan a `src/bootstrap/ui`; otras contienen entre 176 y 478 líneas, y algunas páginas de configuración, personas y perfil mezclan carga de datos con presentación. La simplificación no debe consistir en forzar todas a tener dos líneas, sino en fijar el límite:

- `app/`: routing, autenticación de entrada, parámetros y traducción de errores HTTP.
- `src/bootstrap/`: composición de dependencias, carga de modelos de lectura y ensamblaje de la pantalla cuando sea una operación de presentación.
- `src/modules/*/application`: casos de uso y orquestación de negocio.
- `src/modules/*/domain`: reglas puras, invariantes y tipos.
- `src/modules/*/ports`: contratos de persistencia y servicios externos.
- `src/modules/*/infrastructure`: adaptadores concretos Prisma, Google, Zoom y correo.
- `presentation/`: componentes de interfaz y contratos de presentación; no debe consultar DB ni decidir permisos.

Los tests de `presentation-layer-boundaries.test.ts` ya comprueban parte de esta separación para componentes de asistencia y reuniones. Es una base a ampliar, no una razón para reubicar todo de una vez.

## Contraste con diagnósticos anteriores

`docs/diagnostico-arquitectura-acoplamiento-y-coherencia.md` tiene fecha 17 de octubre y describe una arquitectura parcialmente hexagonal, 22 CSS globales y varias duplicaciones. La línea base actual muestra 30 imports CSS en el layout autenticado, seis módulos con las cuatro capas y otros módulos que siguen planos. Algunos números del documento anterior (como el tamaño de `asistencia.service.ts`) ya cambiaron. Usarlo como contexto histórico, no como inventario actual.

`docs/arquitectura.md` debe actualizarse después de aprobar la arquitectura objetivo; no mezclar una edición documental ahora con una decisión funcional todavía no aprobada.

## Dirección recomendada

1. No crear nuevos repositorios ni microservicios por esta auditoría.
2. Consolidar primero `reuniones` y `asistencia` como límites de dominio: contratos de aplicación, puertos e infraestructura donde exista complejidad real.
3. Terminar de separar lecturas de pantalla y mutaciones de negocio; los server components pueden orquestar consultas, pero no duplicar reglas de dominio.
4. Centralizar acceso a credenciales Google/Zoom y adaptadores de proveedor en sus módulos dueños, sin dispersar descifrado ni selección de cuentas.
5. Mantener `src/bootstrap` como composición, no convertirlo en una segunda capa de negocio.
6. Ampliar las pruebas de arquitectura para impedir imports de Prisma/SDK desde presentation y UI, ciclos entre módulos y accesos cruzados no aprobados.
7. Migrar módulo por módulo con paridad funcional y pruebas PostgreSQL; no renombrar carpetas masivamente.

## Tareas de auditoría pendientes

- Medir grafo de imports por módulo y dependencias cruzadas reales.
- Rastrear las 23 páginas con import de DB y clasificarlas: consulta propia, db inyectada, uso incidental o dependencia innecesaria.
- Comparar las operaciones de `asistencia.service.ts` con sus use cases para detectar duplicación efectiva.
- Descomponer `gestionar-encuentros.service.ts` por casos de uso sin romper transacciones, advisory locks ni consistencia de proveedor.
- Medir las dependencias de los cuatro grandes server components de reuniones y separar query model, reglas y renderizado.
- Revisar la propiedad de credenciales y cohosts descrita en la auditoría del 17 de octubre y revalidar qué hallazgos siguen presentes.
