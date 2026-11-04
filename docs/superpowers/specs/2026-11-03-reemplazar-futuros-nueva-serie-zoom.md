# Reemplazar el tramo futuro de una serie por una nueva serie Zoom

## Regla institucional

Cuando una serie tenga encuentros de proveedores diferentes (Meet/Zoom) o varios IDs de Zoom, la opción **Reemplazar encuentros futuros** construirá una nueva `SolicitudSala` con un nuevo `serieReunionId`, que contendrá **solo los encuentros todavía no iniciados** y tendrá **una única `ReunionProveedor` de Zoom compartida**.

- Se conserva la serie original como registro histórico. Los encuentros ya iniciados, realizados, cancelados y sus grabaciones, reportes, listas de asistencia y liquidaciones no se modifican.
- Todos los encuentros futuros `PROGRAMADA` con `inicioProgramadoAt > now`, sean Meet o Zoom, se incluyen en la nueva serie.
- Una vez que **cada** encuentro nuevo tenga Zoom operativo y el mismo ID/enlace, estén actualizadas las citas de Calendar y se haya preparado la notificación de cambio, los encuentros originales futuros pasan a `CANCELADA` y se encolan sus cancelaciones externas.
- Si falta cualquiera de esas garantías, se conserva la serie original y se permite reintentar el mismo reemplazo sin duplicar reuniones.

## Secuencia obligatoria, con reanudación

1. **Vista previa:** planificar con `planificarReemplazoSerieZoom`, verificar roles (solo Administración para este tipo de migración), fecha, capacidad Zoom, registro de asistencia, asignaciones y liquidaciones. Mostrar tabla de IDs originales y fechas, título de la nueva serie y destinatarios.
2. **Reserva:** crear una operación persistente con clave idempotente sobre la serie original; bloquear la serie mediante `pg_advisory_xact_lock`. Revalidar los futuros bajo bloqueo, comprobar no solapamiento y reservar una cuenta Zoom apta para **todos** los horarios. La reserva debe ignorar *solo* los originales que serán reemplazados, no otros encuentros.
3. **Copia:** crear `SolicitudSala` nueva con ID/clave de serie diferentes, y nuevas `InstanciaSala` para todas las fechas. Copiar descripción, modalidad, docente/programa, asistentes asignados (verificar la capacidad), cohosts, invitados y necesidades de grabación/monitoreo. Mantener referencias `origenInstanciaId -> nuevaInstanciaId` en una tabla de migración auditable. No copiar grabaciones, asistencias realizadas, recordatorios antiguos ni liquidaciones.
4. **Zoom:** crear `ReunionProveedor` compartida con todos los eventos apuntando a ella, independientemente de `ZOOM_REUNION_COMPARTIDA` de runtime. Provisionar y **verificar en Zoom** que todos tengan la misma cuenta, el mismo `externalEventId/codigoReunion` y el mismo `joinUrl`. No usar únicamente el estado de la cola.
5. **Calendar y avisos:** actualizar o cancelar los eventos de Calendar originales según corresponda, publicar las nuevas citas, coordinar invitaciones y notificar enlace nuevo con trazabilidad y reintentos idempotentes. No dejar enlaces anteriores activos como si fuesen el vigente.
6. **Corte:** solo cuando el paso 4 y la sincronización requerida del paso 5 estén verificados, marcar cancelados **solo** los originales futuros, crear `CANCELAR` para sus eventos externos y recalcular la solicitud vieja. Los históricos permanecen accesibles en la solicitud vieja.
7. **Finalización:** verificar que la cancelación externa esté completada y que no haya dos enlaces anunciados como vigentes. Hacer visible el destino de la serie nueva desde la anterior y viceversa. Si un proceso muere a mitad de camino, mostrar estado `PENDIENTE`/error y permitir retomar con la misma operación.

## Salvaguardas

- Nunca usar `cancelarSolicitudesAtomicas` directamente para este propósito: cancela también encuentros históricos.
- Nunca llamar a `crearReuniones` y luego cancelar sin una operación persistida con estado y mecanismo de reanudación: dos solicitudes HTTP concurrentes podrían duplicar la serie.
- Prohibido reutilizar el `serieReunionId` de la original, porque los listados las agruparían erróneamente.
- No cancelar ni borrar registros de grabaciones, asistencia, asignaciones históricas y evidencia.
- Si hay un encuentro en curso, se conserva en la serie vieja y no se interrumpe.
- Ante liquidación de un encuentro futuro, no realizar reemplazo automático.
- Los mensajes de éxito solo se muestran tras verificar el corte; un HTTP 202 indica que el trabajo sigue pendiente.
- Añadir tests de integración PostgreSQL/Zoom simulado para cortes intermedios, idempotencia, colisiones de sala, Fallo de Calendar, cron y reintentos antes de habilitar la operación real.

## Estado de este PR

Esta primera etapa incorpora **únicamente el planificador puro y sus pruebas**. Todavía no implementa la tabla de operación, la copia, el aprovisionamiento ni la cancelación: **no habilitar un botón que prometa realizar todo el procedimiento** hasta tener esa orquestación validada.
