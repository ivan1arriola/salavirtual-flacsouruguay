# Asistencia en Zoom (sub-proyecto 2a)

## Contexto

Parte del reemplazo integral de Meet por Zoom. Orden de sub-proyectos: 1 cierre de migración en producción, 2a asistencia, 2b grabaciones, 2c dashboards y agenda, 2d control en vivo, 3 limpieza de Meet. Este spec cubre solo 2a. Se apoya en `2026-11-02-zoom-primary-migration-design.md`.

## Objetivo

Los encuentros cuyo proveedor activo es Zoom registran la asistencia de participantes con el mismo modelo, cálculos, informes y descargas que hoy usan los encuentros de Meet. Los registros de Meet no cambian.

## Decisiones

- **Identidad:** el participante se identifica por el nombre mostrado en Zoom. Zoom no entrega un correo confiable de quien entra como invitado.
- **Conciliación:** el docente/host de la reunión y administración vinculan cada nombre a un invitado o lo marcan como externo. Lo no vinculado queda `SIN_IDENTIFICAR` y no cuenta para normativa.
- **Enfoque:** proveedor Zoom detrás del puerto `ArtifactProviderPort` existente, con sincronización por polling. Los webhooks se evalúan en 2b.

## Comportamiento

1. **Origen de datos.** `src/integrations/zoom/` incorpora un cliente de reportes que consulta los participantes de reuniones pasadas con el token Server-to-Server existente, con paginación. Un adaptador implementa `ArtifactProviderPort` y entrega los participantes en el formato que consume `archivos`. El proveedor se elige por el evento activo de la instancia, mediante el selector compartido.
2. **Sesiones.** Una persona que entra varias veces se agrupa por nombre normalizado (más el ID de usuario Zoom si existe). Los minutos se suman y `numeroConexiones` cuenta las entradas.
3. **Datos.** `RegistroAsistenciaMeet` se conserva y agrega `proveedor` (por defecto `GOOGLE_MEET`), `estadoConciliacion` (`CONCILIADO`, `SUGERIDO`, `SIN_IDENTIFICAR`) e `invitadoReunionId` opcional. Los registros existentes quedan `CONCILIADO`. La clave del participante Zoom respeta `@@unique([instanciaSalaId, claveParticipante])`.
4. **Conciliación.** Desde el detalle de la reunión, el docente/host vincula cada nombre a un invitado o lo marca externo; administración puede corregir cualquier reunión. Cada vínculo genera una entrada en `Auditoria`. Un vínculo confirmado se recuerda dentro de la serie: la próxima vez el mismo nombre aparece como `SUGERIDO`, nunca como confirmado.
5. **Cálculo.** Minutos y porcentaje se calculan como hoy, sobre el tiempo programado. `cumpleNormativa` es verdadero solo con estado `CONCILIADO`. Los `SIN_IDENTIFICAR` se muestran aparte. Las exportaciones y descargas agregan el estado de conciliación como columna.
6. **Sincronización.** Se dispara por la sincronización actual cuando el evento activo es Zoom. Si Zoom aún no publicó el reporte, el estado queda `SIN_REGISTRO_FINALIZADO` y se reintenta. Una falla de Zoom queda como error de sincronización reintentable y nunca borra ni pisa registros ya conciliados.

## Pruebas

- Agrupamiento de sesiones, normalización de nombres y cálculo de `cumpleNormativa`.
- Adaptador con respuestas Zoom simuladas: paginación y reporte vacío.
- Una nueva sincronización no pisa vínculos confirmados.
- Los registros de Meet quedan intactos tras la migración de esquema.

## Fuera de alcance

- Webhooks de Zoom (2b).
- Renombrar `RegistroAsistenciaMeet` (sub-proyecto 3).
- Grabaciones, dashboards y control en vivo.

## Supuesto por verificar antes de implementar

La app Server-to-Server de Zoom tiene habilitado el scope de reportes de participantes (`report:read:admin` o `meeting:read:list_past_participants`) y el plan de Zoom permite consultarlos por API.
