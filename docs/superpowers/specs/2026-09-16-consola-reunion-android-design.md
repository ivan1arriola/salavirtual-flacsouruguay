# Consola de reunión para Android — diseño

## Objetivo

Ampliar Sala Virtual FLACSO y AppFLACSOAndroid para que el asistente técnico tenga una consola operativa de reunión basada en el estado real de Google Meet, sin acceso directo de Android a Google Workspace ni PostgreSQL.

## Estados operativos

La reunión usa un estado derivado, separado del horario programado:

- `PROGRAMADA`: todavía no llegó la hora de inicio prevista.
- `ESPERANDO_INICIO`: llegó la hora prevista pero Google Meet todavía no confirmó una conferencia activa.
- `EN_CURSO`: Google Meet confirma que la conferencia comenzó realmente.
- `FINALIZADA`: existió una conferencia y ya terminó.
- `NO_INICIADA`: terminó la franja horaria prevista sin que Google Meet haya confirmado una conferencia.

La app nunca debe considerar una reunión `EN_CURSO` solo por horario.

## Arquitectura

`salavirtual-flacsouruguay` es la única capa que habla con Google Meet y PostgreSQL. Calcula el estado operativo, consulta participantes y artefactos de conferencia, y expone contratos móviles estables bajo `/api/v1/mobile/...`.

`AppFLACSOAndroid` actúa como cliente. Consume esos contratos, mantiene caché local del último estado válido y representa la reunión en cuatro modos de interfaz: próxima, esperando inicio, en curso y cerrada/no iniciada.

## Consola de reunión

El detalle de una reunión asignada debe mostrar:

- estado operativo;
- horario previsto;
- hora real de inicio y fin cuando existan;
- enlace Meet;
- sala/host;
- participantes activos y cantidad total observada;
- estado de grabación y enlace al artefacto cuando esté disponible;
- incidencias registradas;
- acción de cierre o confirmación de asistencia cuando corresponda.

Durante `EN_CURSO`, la pantalla debe priorizar estado, temporizador desde inicio real, cantidad de participantes, grabación y acciones operativas.

## Participantes

El backend normaliza la información de Google Meet. Android no necesita conocer estructuras de la API de Google. Debe recibir una lista con identificador estable de sesión, nombre visible cuando Google lo provea, hora de entrada, hora de salida cuando exista y bandera `active`.

Las múltiples entradas de una misma persona pueden conservarse como sesiones separadas en backend y resumirse para UI cuando sea útil.

## Grabaciones

El backend expone un estado normalizado:

- `NO_INICIADA`
- `GRABANDO`
- `PROCESANDO`
- `DISPONIBLE`
- `NO_DISPONIBLE`

Cuando exista artefacto disponible, la respuesta incluye el enlace autorizado correspondiente. La ausencia temporal de artefacto después de terminar una conferencia no debe marcarse como error; se representa como `PROCESANDO`.

## Incidencias

La primera versión admite categorías operativas rápidas:

- `DOCENTE_NO_INGRESA`
- `AUDIO`
- `GRABACION`
- `SALA_INCORRECTA`
- `OTRA`

Cada incidencia guarda reunión, asistente, categoría, nota opcional y timestamp. El registro se hace mediante API móvil autenticada.

## Cierre

Al terminar una conferencia, el backend conserva inicio real, fin real, participantes observados, estado/artefactos de grabación e incidencias. Android muestra un resumen y permite confirmar la asistencia técnica sin reescribir los datos provenientes de Meet.

Si termina el horario previsto sin conferencia confirmada, la reunión pasa a `NO_INICIADA`. Debe quedar disponible para revisión administrativa.

## Actualización

Mientras una reunión esté `ESPERANDO_INICIO` o `EN_CURSO`, Android refresca el estado periódicamente. El backend puede usar caché corta para evitar consultas innecesarias a Google.

Ante fallo de red o de Google, la app conserva el último dato válido y lo marca como no actualizado. Un fallo externo no debe degradar automáticamente una reunión activa a otro estado.

## Seguridad

- Android nunca recibe credenciales de servicio de Google.
- Android nunca conecta directamente a PostgreSQL.
- Todos los endpoints móviles requieren la sesión/token vigente y verifican que el actor pueda ver u operar la reunión.
- Los enlaces a artefactos solo se exponen cuando el actor tiene permiso.

## Alcance de esta iteración

Incluye estado operativo real, consola móvil, participantes, grabación, incidencias y cierre.

Quedan fuera de este bloque y se implementan después: sincronización con Google Calendar personal, Telegram, disponibilidad de asistentes y flujo completo de reemplazos.