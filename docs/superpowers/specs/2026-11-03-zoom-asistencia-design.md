# Asistencia en Zoom (sub-proyecto 2a)

## Contexto

Parte del reemplazo integral de Meet por Zoom. Orden de sub-proyectos: 1 cierre de migración en producción, 2a asistencia, 2b grabaciones, 2c dashboards y agenda, 2d control en vivo, 3 limpieza de Meet. Este spec cubre solo 2a. Se apoya en `2026-11-02-zoom-primary-migration-design.md`.

## Estado actual del código

Hay dos flujos de asistencia de Meet:

1. **En vivo** (`src/modules/reuniones/reunion-operativa.service.ts`): consulta los participantes activos de Meet durante la reunión y los guarda en `RegistroAsistenciaMeet`; el operador también edita ese registro.
2. **Posterior** (`src/modules/archivos/application/sincronizar-artefactos.use-case.ts`): al terminar la reunión arma una planilla de Google Sheets, la sube a Drive como `LISTA_ASISTENCIA` y la registra como `ArchivoReunion`. De ahí salen las descargas y la vista de asistencia.

`ArtifactProviderPort` mezcla asistencia con carpetas de Drive, grabaciones y credenciales de Workspace, por lo que no sirve como costura para Zoom tal cual.

## Objetivo

Los encuentros cuyo proveedor activo es Zoom producen, al terminar, el mismo registro de asistencia y la misma planilla en Drive que hoy producen los de Meet, con conciliación de identidades. Los registros y planillas de Meet no cambian.

## Decisiones

- **Alcance:** solo asistencia posterior. La asistencia en vivo de Zoom queda en 2d.
- **Identidad:** el participante se identifica por el nombre mostrado en Zoom. Zoom no entrega un correo confiable de quien entra como invitado.
- **Conciliación:** el docente/host de la reunión y administración vinculan cada nombre a un invitado o lo marcan como externo. Lo no vinculado queda `SIN_IDENTIFICAR` y no cuenta para normativa.
- **Costura:** un puerto de asistencia propio, separado de `ArtifactProviderPort`. Zoom lo implementa; Google conserva su camino actual.
- **Sincronización:** polling. Los webhooks se evalúan en 2b.

## Comportamiento

1. **Puerto de asistencia.** `src/modules/archivos/ports/` incorpora un puerto que, dada una instancia, devuelve las sesiones de sus participantes ya terminadas. La sincronización elige la implementación por el evento activo de la instancia con el selector compartido (`seleccionarEventoProveedorActivo`), sin comparar contra `GOOGLE_MEET`.
2. **Origen Zoom.** `src/integrations/zoom/` incorpora un cliente de reportes que consulta los participantes de reuniones pasadas (`/past_meetings/{id}/participants`) con el token Server-to-Server existente, con paginación. Un adaptador lo expone como el puerto de asistencia.
3. **Sesiones.** Una persona que entra varias veces se agrupa por nombre normalizado (más el ID de usuario Zoom si existe). Los minutos se suman y `numeroConexiones` cuenta las entradas.
4. **Datos.** `RegistroAsistenciaMeet` se conserva como registro de asistencia de ambos proveedores y agrega `proveedor` (por defecto `GOOGLE_MEET`), `estadoConciliacion` (`CONCILIADO`, `SUGERIDO`, `SIN_IDENTIFICAR`) e `invitadoReunionId` opcional. Los registros existentes quedan `CONCILIADO`. La clave del participante Zoom respeta `@@unique([instanciaSalaId, claveParticipante])`.
5. **Planilla.** Para Zoom, la planilla de Drive se genera desde `RegistroAsistenciaMeet` y se registra como `LISTA_ASISTENCIA`, con el estado de conciliación como columna nueva. La vista de asistencia y las descargas la leen igual que a las de Meet.
6. **Conciliación.** Desde el detalle de la reunión, el docente/host vincula cada nombre a un invitado o lo marca externo; administración puede corregir cualquier reunión. Cada vínculo genera una entrada en `Auditoria`. Un vínculo confirmado se recuerda dentro de la serie: la próxima vez el mismo nombre aparece como `SUGERIDO`, nunca como confirmado. Al conciliar se regenera la planilla.
7. **Cálculo.** Minutos y porcentaje se calculan como hoy, sobre el tiempo programado. `cumpleNormativa` es verdadero solo con estado `CONCILIADO`. Los `SIN_IDENTIFICAR` se muestran aparte.
8. **Sincronización.** Se dispara por la sincronización actual cuando el evento activo es Zoom. Si Zoom aún no publicó el reporte, el estado queda `SIN_REGISTRO_FINALIZADO` y se reintenta. Una falla de Zoom queda como error de sincronización reintentable y nunca borra ni pisa registros ya conciliados.

## Pruebas

- Agrupamiento de sesiones, normalización de nombres y cálculo de `cumpleNormativa`.
- Cliente de reportes con respuestas Zoom simuladas: paginación y reporte vacío.
- Una nueva sincronización no pisa vínculos confirmados.
- Los registros y planillas de Meet quedan intactos tras la migración de esquema.
- La sincronización de un evento activo en Zoom no exige credenciales de Meet ni código Meet.

## Fuera de alcance

- Asistencia en vivo de Zoom (2d).
- Webhooks de Zoom (2b).
- Renombrar `RegistroAsistenciaMeet` (sub-proyecto 3).
- Grabaciones, dashboards y control en vivo.

## Supuesto por verificar antes de implementar

La app Server-to-Server de Zoom tiene habilitado el scope de reportes de participantes (`report:read:admin` o `meeting:read:list_past_participants`) y el plan de Zoom permite consultarlos por API.
