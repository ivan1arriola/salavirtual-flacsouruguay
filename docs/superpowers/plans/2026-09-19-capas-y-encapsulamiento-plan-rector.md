# Capas y Encapsulamiento del Monolito Modular - Plan Rector

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement each stage task-by-task. Cada etapa cuenta con su propio plan ejecutable detallado.

**Goal:** Establecer la hoja de ruta integral para migrar Sala Virtual FLACSO a un monolito modular con cinco capas explícitas por módulo (`presentation`, `application`, `domain`, `ports`, `infrastructure`) a lo largo de 12 etapas incrementales y verificables, preservando el 100% de la funcionalidad observable, el esquema de datos y los contratos HTTP.

**Architecture:** Monolito modular desacoplado mediante arquitectura hexagonal/limpia en TypeScript. Cada módulo encapsula su dominio y expone únicamente `api.ts` y `presentation.ts`. La composición de dependencias se centraliza en `src/bootstrap/*.server.ts` con protección `server-only`. Las integraciones externas (Google Meet, Calendar, Drive, Gmail, Prisma) se aíslan tras puertos en lenguaje de negocio.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Prisma 6, PostgreSQL, Vitest, Google Workspace APIs (Calendar, Meet, Drive, Gmail).

**Spec:** `docs/superpowers/specs/2026-09-19-capas-y-encapsulamiento-design.md`

## Invariantes y Restricciones Globales

1. **Sin big-bang ni roturas de contratos:** No se cambian tablas, relaciones, URLs públicas, payloads HTTP ni reglas operativas durante la refactorización.
2. **Patrón Expandir -> Migrar -> Contraer:** Toda migración crea primero la nueva interfaz con tests, migra consumidores gradualmente, mantiene fachadas temporales donde existan consumidores legacy y contrae cuando las referencias queden en cero.
3. **Pureza estricta de Dominio:** `domain` permanece compuesto de datos `readonly` y funciones puras, sin `async`, sin red, sin Prisma, sin reloj ni azar descontrolados, sin Next.js/React.
4. **Desacoplamiento de Aplicación:** `application` no importa Prisma, Next.js, React ni SDKs de terceros; solo `domain` y `ports`.
5. **Aislamiento de Infraestructura:** `infrastructure` implementa `ports`. Los clientes técnicos de Google (`src/integrations/google/`) gestionan transporte y autenticación sin conocer reglas de negocio de FLACSO.
6. **Next.js 16 delgado:** `app/` solo contiene Server/Client Components mínimos y Route Handlers delgados que delegan a `bootstrap` y a los módulos correspondientes.
7. **Reglas de CI y Cobertura:** Todo commit y PR debe pasar `npm run check`, `npm test` (cobertura >= 80%), `npm run validate:schema` y `npm run build`.

---

## Mapa de Etapas

| Etapa | Nombre | Foco / Entregables | Plan Ejecutable |
| :--- | :--- | :--- | :--- |
| **1** | **Base de Arquitectura y Estructura Piloto** | Arnés `test/architecture-boundaries.test.ts`, armonización de `test/functional-architecture.test.ts`, convención de capas y módulo piloto `auditoria`. | `docs/superpowers/plans/2026-09-19-capas-y-encapsulamiento-etapa-1.md` |
| **2** | **Identity y Aislamiento de Auth.js** | Módulo `identity`, desacoplar `auth.ts` del acceso a base y aislar la reconciliación del calendario del asistente fuera del camino crítico del login. | `docs/superpowers/plans/2026-09-XX-capas-etapa-2-identity.md` |
| **3** | **Clientes Técnicos Google** | Extracción de `src/integrations/google/` (auth, calendar, meet) sin alterar la lógica de `MeetProvider` ni reglas de cohosts. | `docs/superpowers/plans/2026-09-XX-capas-etapa-3-google-clients.md` |
| **4** | **Módulo Conferencias y Casos de Uso** | Crear módulo `conferencias`, puerto `ConferenceProvider`, casos de uso de aprovisionamiento, cohosts y sincronización con idempotencia. | `docs/superpowers/plans/2026-09-XX-capas-etapa-4-conferencias.md` |
| **5** | **Calendario del Asistente** | Capas de calendario del asistente (`domain`, `ports`, `application`, `infrastructure`), puerto de sincronización y aislamiento de errores. | `docs/superpowers/plans/2026-09-XX-capas-etapa-5-calendario-asistente.md` |
| **6** | **Notificaciones y Transportes** | Módulo `notificaciones` con intención tipada, desacople de plantillas respecto a transportes (Gmail/SMTP) y tolerancia a fallos. | `docs/superpowers/plans/2026-09-XX-capas-etapa-6-notificaciones.md` |
| **7** | **Archivos, Grabaciones y Drive** | Módulo `archivos`, puertos para Drive y Meet Artifacts, casos de uso de indexación y sincronización de grabaciones. | `docs/superpowers/plans/2026-09-XX-capas-etapa-7-archivos.md` |
| **8** | **Asistencia y Liquidaciones** | Separación limpia de dominios entre `asistencia` (disponibilidad, postulaciones, asignaciones) y `liquidaciones` (tarifas, horas, reportes). | `docs/superpowers/plans/2026-09-XX-capas-etapa-8-asistencia-liquidaciones.md` |
| **9** | **Presentación Delgada y Bootstrap de UI** | Migración de componentes de `reuniones` y `asistencia` a `presentation/`, reducción de páginas en `app/` a controladores delgados. | `docs/superpowers/plans/2026-09-XX-capas-etapa-9-presentacion.md` |
| **10** | **Scripts y Tareas Programadas** | Migración de scripts CLI y endpoints cron para invocar casos de uso centralizados de `application`, preservando dry-run y seguridad. | `docs/superpowers/plans/2026-09-XX-capas-etapa-10-scripts-jobs.md` |
| **11** | **Repositorios Estratégicos y Composición** | Consolidación de repositorios Prisma donde existen agregados y locks transaccionales; formalización de raíces en `src/bootstrap/`. | `docs/superpowers/plans/2026-09-XX-capas-etapa-11-repositorios-bootstrap.md` |
| **12** | **Contracción y Cierre de Arquitectura** | Eliminación de fachadas temporales, validación del 100% de módulos con `test/architecture-boundaries.test.ts` en CI y documentación final. | `docs/superpowers/plans/2026-09-XX-capas-etapa-12-contraccion-final.md` |

---

## Criterios de Transición entre Etapas

Para dar por concluida una etapa y habilitar la siguiente:
1. Todos los tests específicos de la etapa y la suite completa (`npm test`) deben estar en verde.
2. `npm run check` no debe emitir ningún error de TypeScript.
3. `test/architecture-boundaries.test.ts` debe validar positivamente las reglas para los módulos migrados hasta la etapa.
4. Las fachadas temporales deben documentar explícitamente sus dependencias restantes.
5. El árbol de trabajo debe quedar limpio con commits descriptivos que permitan reversión atómica de la etapa si fuera necesario.

