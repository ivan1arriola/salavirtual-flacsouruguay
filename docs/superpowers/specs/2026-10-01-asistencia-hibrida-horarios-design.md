# Horarios exactos de asistencia técnica en reuniones híbridas

## Objetivo

Separar semánticamente el horario de la actividad/reunión del horario de trabajo presencial del asistente técnico, permitiendo excepciones por encuentro puntual sin duplicar reuniones ni horas.

## Modelo funcional

- `SolicitudSala` conserva los valores base de una serie: modalidad, requisito de asistencia y, cuando existe un horario común, `inicioAsistenciaTecnicaAt` y `finAsistenciaTecnicaAt`.
- `InstanciaSala` conserva los valores efectivos de un encuentro: `modalidadOverride`, `inicioAsistenciaTecnicaAt` y `finAsistenciaTecnicaAt`.
- Si no existe una configuración puntual de horario, el encuentro usa el horario base de la serie.
- El horario de asistencia es un intervalo independiente y puede contener al horario de la actividad o extenderse de forma distinta.
- La modalidad efectiva puede ser virtual o híbrida. La asistencia técnica requiere un intervalo válido cuando corresponde.

## Calendario y cómputo

- La reunión virtual conserva el intervalo de la actividad.
- La cobertura presencial se representa con segmentos relacionados de preparación y cierre cuando el intervalo técnico se extiende antes o después de la actividad.
- El Meet no se duplica como evento de cobertura.
- Para una asistencia presencial o híbrida, las horas trabajadas y el pago se calculan siempre con el intervalo técnico completo: desde la hora en que el asistente debe presentarse hasta la hora en que debe retirarse.
- El horario de la actividad/Meet se muestra y se reporta por separado; no recorta ni sustituye el intervalo usado para liquidar.
- La liquidación, disponibilidad, agenda, dashboard y APIs deben usar modalidad y horario efectivos del encuentro.

## Administración

Desde el detalle de una serie, Administración puede para un encuentro puntual:

- cambiar la modalidad a virtual o híbrida;
- activar o desactivar la asistencia técnica;
- editar asistente y hora exacta de llegada/salida cuando el flujo lo permita;
- restablecer los valores de la serie.

Las acciones puntuales deben indicar que guardan solo ese encuentro y mostrar cuando existe una configuración personalizada. Al restablecer, se eliminan los overrides y se vuelve a la configuración de la serie.

## Compatibilidad y seguridad de datos

- Los encuentros existentes mantienen su modalidad y funcionamiento actual.
- Las nuevas columnas son anulables o tienen valores compatibles con los datos históricos.
- La migración SQL debe ser explícita, repetible de forma segura y no modificar datos históricos fuera de los campos nuevos.
- Las autorizaciones actuales de Administración y asistencia técnica se conservan.
- No se crean entidades paralelas para preparación/cierre: son representaciones de Calendar del mismo encuentro.

## Verificación requerida

- pruebas de dominio para modalidad y horarios efectivos;
- pruebas de creación, edición, restablecimiento y eliminación de segmentos de Calendar;
- pruebas de disponibilidad, agenda, liquidación y contratos móviles;
- validación de esquema y migración;
- chequeo TypeScript, tests completos y build;
- revisión de estado Git, fast-forward de `main`, push y evidencia separada de CI/despliegue.
