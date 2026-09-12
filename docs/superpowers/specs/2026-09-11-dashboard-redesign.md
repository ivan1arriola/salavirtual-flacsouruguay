# Rediseño Arquitectónico, UI y UX del Dashboard Principal (/)

- **Ruta principal**: `/` (`app/(gestion)/page.tsx`)
- **Fecha**: 11 de setiembre de 2026
- **Estado**: Especificación de Diseño (Design Spec)

---

## 1. Objetivo

Transformar el panel principal de FLACSO Uruguay (`http://localhost:3000/`) en un dashboard ágil, intuitivo y adaptado específicamente tanto a la persona que inicia sesión como a su rol (`ADMINISTRACION`, `DOCENTE`, `ASISTENTE_TECNICO`).

El nuevo diseño elimina la sobrecarga cognitiva y el caos visual actual:
1. Prioriza la **"regla de los 5 segundos"**: un docente o asistente técnico que entra a la plataforma justo antes de su clase debe encontrar de inmediato el botón para unirse a Google Meet, el enlace para compartir con los estudiantes y el estado de confirmación de cohosts.
2. Establece un **triage operativo ordenado** para la Administración: lo urgente (salas sin asistente hoy, fallas de sincronización Meet, incidencias) se resuelve con acciones de 1 clic en la parte superior, mientras que las métricas secundarias y la supervisión general no bloquean la atención.
3. Desacopla la arquitectura de código eliminando el archivo monolítico de 600 líneas actual en favor de un despachador limpio en `app/(gestion)/page.tsx` apoyado en adaptadores especializados y un módulo de dominio funcional puro (`dashboard.domain.ts`).

---

## 2. Problemas Observados en la Implementación Actual

1. **Monolito en `page.tsx` y consultas indiscriminadas**:
   - Para el rol de administración, `page.tsx` ejecuta en paralelo hasta 14 consultas complejas a la base de datos (conteo de solicitudes, reuniones de hoy, semana, grabaciones pendientes de 30 días, incidencias abiertas, duplicados mediante algoritmo de similitud de cadenas, etc.).
   - Todo el marcado, formateo y validación de cohosts se encuentra mezclado en el mismo archivo.
2. **Falta de foco y saturación visual en Administración**:
   - El dashboard muestra métricas globales, tarjetas de atención y hasta 8 tarjetas de reuniones gigantes con información técnica extensa (cuentas organizadoras de servicio, advertencias de inicio de sesión, listados de emails cohosts sin jerarquizar).
   - Un administrador que entra a resolver un problema puntual debe scrollear extensamente entre tablas y cards de gran tamaño.
3. **Experiencia insuficiente para el Docente**:
   - La vista de docente (`TeacherDashboard`) muestra únicamente 3 tarjetas de conteo y una tabla densa con correos técnicos de Google.
   - Carece de una tarjeta Hero que le dé la bienvenida por su nombre, le anuncie si tiene clase hoy con cuenta regresiva, le permita entrar a Meet en un clic o copiar el enlace para sus alumnos, o ver las grabaciones recientes de sus materias.
4. **Desconexión en el flujo del Asistente Técnico**:
   - Aunque tiene un bloque de próxima reunión, debe abandonar el dashboard y navegar a `/agenda-abierta` para saber qué salas necesitan soporte técnico hoy.
   - Tampoco tiene visibilidad inmediata de si sus permisos de cohost en Google Meet ya están confirmados para admitir alumnos y grabar.

---

## 3. Arquitectura de Componentes y Desacoplamiento

```
app/(gestion)/
  page.tsx                                   # Despachador delgado: autentica y renderiza según session.user.role

src/modules/dashboard/
  types.ts                                   # DTOs fuertemente tipados (libres de BigInt, aptos para RSC/Client boundary)
  dashboard.domain.ts                        # Lógica funcional pura (recibe ahora: Date; clasifica estados y prioridades)
  admin-dashboard.adapter.ts                 # Queries Prisma especializadas para Administración (triage + hoy + métricas)
  teacher-dashboard.adapter.ts               # Queries Prisma especializadas para Docente (clase inmediata + agenda + grabaciones)
  assistant-dashboard.adapter.ts             # Queries Prisma especializadas para Asistente (cobertura próxima + vacantes abiertas + horas)

src/components/dashboard/
  dashboard-header.tsx                       # Cabecera humana compartida: Saludo ("Hola, [Nombre]"), rol y fecha Montevideo
  live-meeting-hero.tsx                      # Tarjeta Hero de "Clase Inmediata / En vivo": cuenta regresiva, botón Meet, copiar link
  admin/
    admin-dashboard.tsx                      # Orquestador del panel de administración
    admin-triage-section.tsx                 # Grilla de atención urgente (acciones de 1 clic)
    admin-today-timeline.tsx                 # Cronología de salas de hoy (estado en vivo, asistente, cohosts)
    admin-metrics-bar.tsx                    # Métricas compactas secundarias
  teacher/
    teacher-dashboard.tsx                    # Orquestador del panel docente
    teacher-upcoming-list.tsx                # Agenda simplificada de próximas clases
    teacher-recent-recordings.tsx            # Acceso directo a grabaciones sincronizadas
  assistant/
    assistant-dashboard.tsx                  # Orquestador del panel de asistente técnico
    assistant-open-opportunities.tsx         # Tarjetas de salas que buscan cobertura para postularse en 1 clic
    assistant-hours-summary.tsx              # Resumen mensual de horas virtuales e híbridas
```

---

## 4. Diseño de la Experiencia por Rol

### 4.1. Rol Administración (`ADMINISTRACION`)
- **Cabecera (`<DashboardHeader />`)**:
  - Saludo: *"Hola, [Nombre]"* · Rol Administrador · Fecha actual en Montevideo (`America/Montevideo`).
  - Accesos directos: Botón primario `+ Nueva reunión` (`/reuniones/nueva`) y secundario `Gestionar asistencia` (`/asistencia-tecnica`).
- **Bloque 1: Triage de Atención Urgente (`<AdminTriageSection />`)**:
  - Solo se muestra de forma prominente si existen excepciones que resolver hoy:
    - *Sin asistencia técnica*: reunión próxima sin cubrir con selector/asignación rápida en 1 clic (`AdminQuickAssignAction`).
    - *Falla de Google Meet*: error de sincronización de sala con botón de reintento en 1 clic (`AdminRetryMeetAction`).
    - *Grabaciones pendientes*: sincronización de archivos con botón directo (`AdminSyncRecordingsAction`).
    - *Incidencias abiertas*: listado crítico con enlace a la ficha de resolución.
    - *Posibles duplicados*: alerta concisa con enlace a `/reuniones/duplicados`.
  - Si no hay alertas operativas: banner minimalista verde con mensaje *"Todo bajo control: No hay excepciones operativas pendientes para hoy"*.
- **Bloque 2: Timeline de Salas de Hoy (`<AdminTodayTimeline />`)**:
  - Cronología clara de las clases del día:
    - Indicador de estado: *"En vivo ahora"*, *"En 45 min"*, *"Finalizada"*.
    - Materia/Título, Programa y Docente a cargo.
    - Asistente asignado (con avatar o badge de advertencia si aún está vacante).
    - Botón para unirse a Meet y botón para copiar link.
    - Estado de cohosts en badge conciso (*Verificado* / *Pendiente*).
- **Bloque 3: Métricas y Enlaces Rápidos (`<AdminMetricsBar />`)**:
  - Contadores compactos en barra horizontal inferior (Solicitudes activas, reuniones de la semana, etc.) sin robar protagonismo visual a la operación en tiempo real.

### 4.2. Rol Docente (`DOCENTE`)
- **Cabecera (`<DashboardHeader />`)**:
  - Saludo: *"Hola, [Nombre]"* · Docente · Fecha actual · Botón `+ Nueva reunión` y `Ver mi agenda`.
- **Bloque 1: Hero de Clase Inmediata (`<LiveMeetingHero />`)**:
  - Si tiene clase hoy o en curso:
    - Título del curso y programa.
    - Horario y cuenta regresiva dinámica: *"Empieza en 15 minutos"* o *"En vivo ahora"*.
    - Botón primario prominente: **"Entrar a Google Meet"**.
    - Botón secundario: **"Copiar link para estudiantes"** (con feedback visual de copiado).
    - Asistente técnico asignado (nombre y estado de cobertura).
    - Confirmación de cohost con su cuenta de Google.
  - Si no tiene clase hoy: tarjeta limpia informando *"No tenés clases programadas para hoy"* con un acceso a la agenda completa.
- **Bloque 2: Agenda de Próximas Sesiones (`<TeacherUpcomingList />`)**:
  - Lista simplificada de las próximas reuniones asociadas a sus programas académicos (fecha, hora, título, modalidad virtual/híbrida).
- **Bloque 3: Grabaciones Recientes (`<TeacherRecentRecordings />`)**:
  - Tarjeta con acceso a las últimas grabaciones procesadas de sus cursos en `/grabaciones` para compartirlas rápidamente con los alumnos.

### 4.3. Rol Asistente Técnico (`ASISTENTE_TECNICO`)
- **Cabecera (`<DashboardHeader />`)**:
  - Saludo: *"Hola, [Nombre]"* · Asistente Técnico · Resumen rápido de horas del mes.
- **Bloque 1: Próxima Cobertura Asignada (`<LiveMeetingHero />`)**:
  - Reunión asignada más próxima con cuenta regresiva, botón para entrar a Meet y badge de verificación de permisos de cohost en Google Meet (para asegurar que puede admitir participantes y grabar).
- **Bloque 2: Oportunidades Abiertas (`<AssistantOpenOpportunities />`)**:
  - 2 o 3 reuniones próximas que requieren asistencia técnica y no tienen cobertura, con botón para postularse en 1 clic (*"Postularme"*) directamente desde el dashboard.
- **Bloque 3: Horas y Postulaciones (`<AssistantHoursSummary />`)**:
  - Tarjetas con horas virtuales e híbridas computadas del mes actual y del mes anterior, junto al conteo de postulaciones activas.

---

## 5. Reglas de Dominio y Funciones Puras

Toda la lógica de cálculo temporal y de clasificación se centraliza en `src/modules/dashboard/dashboard.domain.ts`:

1. `determinarEstadoTemporal(inicio: Date, fin: Date, ahora: Date): 'EN_VIVO' | 'PROXIMA_HOY' | 'FUTURA' | 'FINALIZADA'`
   - Una reunión se considera `'EN_VIVO'` si `ahora >= inicio - 15min` y `ahora <= fin`.
   - Se considera `'PROXIMA_HOY'` si es en el mismo día montevideano y `inicio > ahora`.
2. `calcularMinutosHastaInicio(inicio: Date, ahora: Date): number`
3. `priorizarAlertasTriage(alertas: TriageAlertItem[]): TriageAlertItem[]`
   - Ordena por severidad: emergencias de hoy (sin asistente dentro de las próximas 4 horas) > errores de integración Meet > grabaciones pendientes > duplicados.
4. **Restricción de Arquitectura Funcional**:
   - `dashboard.domain.ts` **no debe invocar** `new Date()` ni `Date.now()`. Recibe `ahora: Date` por parámetro, asegurando determinismo y cumplimiento de `test/functional-architecture.test.ts`.

---

## 6. Seguridad, Serialización y Rendimiento

- **Límites de Serialización en Next.js**:
  - Ningún DTO que viaje de Server Components a Client Components contendrá `bigint` (se transforman a `number` o `string` en los adaptadores).
- **Consultas Acotadas**:
  - Se eliminan las 14 consultas indiscriminadas en el render inicial.
  - La vista docente solo consulta instancias donde el docente está asignado en su programa (`take: 5`).
  - La vista de asistente solo consulta sus asignaciones activas (`take: 5`) y oportunidades abiertas (`take: 3`).
  - La vista administrativa carga las alertas críticas de hoy y un timeline acotado (`take: 6`).

---

## 7. Plan de Testing y Verificación

1. **Pruebas Unitarias de Dominio (`test/dashboard-domain.test.ts`)**:
   - Prueba pura de estados temporales con fechas fijas inyectadas.
   - Prueba del cálculo de cuenta regresiva y formateo.
   - Prueba del ordenamiento de prioridades de triage.
2. **Pruebas de Arquitectura Funcional (`test/functional-architecture.test.ts`)**:
   - Valida que `dashboard.domain.ts` no contiene llamadas prohibidas a `new Date()` o `Date.now()`.
3. **Pruebas de Integración y Renderizado (`test/dashboard-views.test.ts`)**:
   - Comprobación de que `page.tsx` despacha al componente correcto según el rol de la sesión.
   - Validación del render del Hero de docente con botones activos de Meet y copia de enlace.
4. **Verificación de Tipos y Construcción**:
   - `npm run check` (0 errores de TypeScript).
   - `npx vitest run` (100% de tests pasando).
   - `npm run build` (Turbopack exitoso en 47+ rutas).
