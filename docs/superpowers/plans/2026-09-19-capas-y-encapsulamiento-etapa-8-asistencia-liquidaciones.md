# Plan Ejecutable - Etapa 8: Asistencia y Liquidaciones

> **Convención:** Seguimiento estricto del patrón _Expandir -> Migrar -> Contraer_. Cero regresiones en la suite de pruebas (`npm test`), verificación estricta de límites arquitectónicos (`test/architecture-boundaries.test.ts`), pureza funcional en dominio (`test/functional-architecture.test.ts`), comprobación estática de tipos (`npm run check`), validación de esquemas (`npm run validate:schema`) y build de producción (`npm run build`).

## Objetivo

Separar limpiamente los dominios entre:

1. `asistencia` (`src/modules/asistencia/`): Disponibilidad semanal, agenda abierta, postulaciones, asignaciones (reserva transaccional, desvinculación, sugerencias), reporte de duración e incidentes, historial de asistencia, dashboard de asistencia, y calendario del asistente.
2. `liquidaciones` (`src/modules/liquidaciones/`): Tarifas vigentes por modalidad, horas computadas para liquidación, cálculo de montos y totales, reportes mensuales por correo, cierres de liquidación y planilla de pagos en Excel (`exceljs`).

Ambos módulos estructurados en sus 5 capas completas (`domain`, `ports`, `application`, `infrastructure`, `presentation.ts`, `api.ts`), con bootstrap `server-only` (`src/bootstrap/liquidaciones.server.ts` y extensión de `src/bootstrap/asistencia.server.ts`), manteniendo fachadas 100% retrocompatibles en la raíz de `src/modules/asistencia/`.

---

## Tareas

### Tarea 1: Dominio de Liquidaciones (`src/modules/liquidaciones/domain/`)

- Crear `src/modules/liquidaciones/domain/liquidaciones.types.ts`:
  - `MontoMoneda`, `TarifaVigente`, `ModalidadAsistencia`, `PeriodoMes`, `PeriodoReporteMensual`, `FilaPlanillaPago`, `ResumenAsistencia`, `AsistenteResumenBase`, `AsignacionResumenAdministracion`, `FilaResumenAsistente`, `TotalesResumen`, `CorreoReporteMensual`.
- Crear `src/modules/liquidaciones/domain/calculo-horas.domain.ts`:
  - Funciones puras: `calcularMinutos`, `calcularMonto`, `rangoMesUtc3`, `claveMesUtc3`, `resolverPeriodoMes`, `periodoMesAnteriorUtc3`, `formatearDuracion`, `formatearHorasDecimales`, `etiquetaMes`, `minutosTotales`.
- Crear `src/modules/liquidaciones/domain/resumen-liquidaciones.domain.ts`:
  - Funciones puras: `resumirAsignacionesPorAsistente`, `resumirTotales`, `resumirAsistencias`, `resumirMontos`.
- Crear `src/modules/liquidaciones/domain/reporte-mensual.domain.ts`:
  - Función pura: `construirCorreoReporteMensual`.
- Crear `src/modules/liquidaciones/domain/index.ts`.
- Crear pruebas unitarias en `test/liquidaciones-domain.test.ts`.

### Tarea 2: Puertos de Liquidaciones (`src/modules/liquidaciones/ports/`)

- Crear `src/modules/liquidaciones/ports/tarifas-repository.port.ts`:
  - Contrato `TarifasRepositoryPort` (`obtenerTarifaVigente`).
- Crear `src/modules/liquidaciones/ports/liquidaciones-repository.port.ts`:
  - Contrato `LiquidacionesRepositoryPort` (`obtenerFilasPlanillaPagos`, `obtenerResumenAsistentes`, `obtenerAsistentesParaReporteMensual`).
- Crear `src/modules/liquidaciones/ports/planilla-pagos-exporter.port.ts`:
  - Contrato `PlanillaPagosExporterPort` (`generarPlanillaPagosExcel`).
- Crear `src/modules/liquidaciones/ports/index.ts`.

### Tarea 3: Aplicación de Liquidaciones (`src/modules/liquidaciones/application/`)

- Crear `src/modules/liquidaciones/application/consultar-tarifa-vigente.use-case.ts`.
- Crear `src/modules/liquidaciones/application/generar-planilla-pagos.use-case.ts`.
- Crear `src/modules/liquidaciones/application/consultar-resumen-asistentes.use-case.ts`.
- Crear `src/modules/liquidaciones/application/enviar-reportes-mensuales.use-case.ts`.
- Crear `src/modules/liquidaciones/application/index.ts`.
- Crear pruebas unitarias en `test/liquidaciones-application.test.ts`.

### Tarea 4: Infraestructura de Liquidaciones (`src/modules/liquidaciones/infrastructure/`)

- Crear `src/modules/liquidaciones/infrastructure/prisma/prisma-tarifas-repository.adapter.ts`.
- Crear `src/modules/liquidaciones/infrastructure/prisma/prisma-liquidaciones-repository.adapter.ts`.
- Crear `src/modules/liquidaciones/infrastructure/excel/exceljs-planilla-pagos.adapter.ts`.
- Crear `src/modules/liquidaciones/infrastructure/index.ts`.
- Crear pruebas unitarias en `test/liquidaciones-infrastructure.test.ts`.

### Tarea 5: API, Presentación y Bootstrap de Liquidaciones

- Crear `src/modules/liquidaciones/presentation.ts`.
- Crear `src/modules/liquidaciones/api.ts`.
- Crear `src/bootstrap/liquidaciones.server.ts`.
- Crear pruebas unitarias en `test/liquidaciones-bootstrap.test.ts`.

### Tarea 6: Dominio de Asistencia (`src/modules/asistencia/domain/`)

- Crear `src/modules/asistencia/domain/asistencia.types.ts`:
  - Tipos `PeriodoAsistencia`, `RegistroAsistenciaPersonal`, `RegistroHistorialAsistenciaPersonal`, `AsignacionExistente`, `ConflictoAsistenciaResultado`, `AssignmentCandidate`, etc.
- Crear `src/modules/asistencia/domain/asistencia.domain.ts`:
  - Esquemas Zod y funciones puras de reglas (`postulacionAsistenciaSchema`, `asignacionAsistenciaSchema`, `desvinculacionAsistenciaSchema`, `notificacionAsistenciaSchema`, `disponibilidadSemanalSchema`, `reporteDuracionSchema`, `puedeGestionarPostulacion`, `puedeAsignarAsistencia`, `SEPARACION_MINIMA_ASISTENCIAS_MINUTOS`, `cumpleSeparacionMinimaAsistencias`, `estadoInteresParaAccion`, `esAsistenciaCompletada`).
- Crear `src/modules/asistencia/domain/agenda-abierta.domain.ts`:
  - `evaluarConflictoAsistencia`, `parseDateParts`.
- Crear `src/modules/asistencia/domain/dashboard-asistente.domain.ts`:
  - `claveMesAnteriorUtc3`, `formatTiempoRestante`, `contarPostulacionesAbiertas`.
- Crear `src/modules/asistencia/domain/asignacion-sugerencias.domain.ts`:
  - Versión puramente funcional (inmutable) de `buildAssignmentSuggestions` y `evaluarDisponibilidad`.
- Actualizar `src/modules/asistencia/domain/index.ts`.
- Crear pruebas unitarias en `test/asistencia-domain-complete.test.ts`.

### Tarea 7: Puertos de Asistencia (`src/modules/asistencia/ports/`)

- Crear `src/modules/asistencia/ports/asistencia-repository.port.ts`:
  - Contrato `AsistenciaRepositoryPort` para postulaciones, bloqueo/reserva, asignaciones, desvinculaciones, reportes de duración, disponibilidad, asistencias personales, historial y slugs.
- Actualizar `src/modules/asistencia/ports/index.ts`.

### Tarea 8: Aplicación de Asistencia (`src/modules/asistencia/application/`)

- Crear use cases:
  - `actualizar-postulacion.use-case.ts`
  - `asignar-asistente.use-case.ts`
  - `desvincular-asistente.use-case.ts`
  - `reportar-duracion.use-case.ts`
  - `actualizar-disponibilidad.use-case.ts`
  - `renotificar-asistentes.use-case.ts`
  - `consultar-asistencias.use-case.ts`
  - `sincronizar-cohosts-asistencia.use-case.ts`
- Actualizar `src/modules/asistencia/application/index.ts`.
- Crear pruebas unitarias en `test/asistencia-application.test.ts`.

### Tarea 9: Infraestructura de Asistencia (`src/modules/asistencia/infrastructure/`)

- Crear `src/modules/asistencia/infrastructure/prisma/prisma-asistencia-repository.adapter.ts`.
- Actualizar `src/modules/asistencia/infrastructure/index.ts`.
- Crear pruebas unitarias en `test/asistencia-infrastructure.test.ts`.

### Tarea 10: Presentación, API y Bootstrap de Asistencia

- Crear `src/modules/asistencia/presentation.ts`.
- Actualizar `src/modules/asistencia/api.ts`.
- Extender `src/bootstrap/asistencia.server.ts`.

### Tarea 11: Fachadas Retrocompatibles en `src/modules/asistencia/`

- Adaptar los archivos en raíz de `src/modules/asistencia/` para delegar limpiamente hacia los dominios, puertos, casos de uso y adaptadores de `asistencia` y `liquidaciones`:
  - `asistencia.domain.ts`
  - `agenda-abierta.domain.ts`
  - `dashboard-asistente.domain.ts`
  - `resumen-personal.domain.ts`
  - `resumen-administracion.domain.ts`
  - `reporte-mensual.domain.ts`
  - `tarifas.adapter.ts`
  - `planilla-pagos.adapter.ts`
  - `planilla-pagos.xlsx.ts`
  - `reporte-mensual.service.ts`
  - `resumen-administracion.adapter.ts`
  - `asistencia.service.ts`
  - `desvinculacion-asistencia.service.ts`
  - `reporte-duracion.service.ts`
  - `reserva-asistencia.service.ts`
  - `reserva-asistentes.adapter.ts`
  - `asignacion-sugerencias.service.ts`
  - `asistente-slug.adapter.ts`
  - `historial-asistente.adapter.ts`
  - `dashboard-asistente.adapter.ts`
  - `resumen-personal.adapter.ts`
- Actualizar `src/modules/asistencias/types.ts`.

### Tarea 12: Verificación Integral

- Ejecutar pruebas de arquitectura y pureza funcional:
  - `npx vitest run test/architecture-boundaries.test.ts`
  - `npx vitest run test/functional-architecture.test.ts`
- Ejecutar todas las pruebas unitarias y de integración:
  - `npm test`
- Ejecutar verificación estática:
  - `npm run check`
- Validar esquema Prisma:
  - `npm run validate:schema`
- Compilar para producción:
  - `npm run build`
