# Configuración de Google Workspace

## Cuentas host

El gestor usa diez cuentas licenciadas, desde `sala01@flacso.edu.uy` hasta
`sala10@flacso.edu.uy` (además de las cuentas históricas registradas como `salameet1@flacso.edu.uy`). Están registradas como `CuentaProveedor` del proveedor
`GOOGLE_MEET`; no se almacenan sus contraseñas.

Cada reunión se crea en el calendario principal de la sala seleccionada. La
cuenta de servicio actúa en nombre de esa sala mediante delegación de dominio (`Domain-wide delegation`).

## Google Cloud

1. Crear o elegir un proyecto de Google Cloud de FLACSO.
2. Habilitar Google Calendar API, Google Meet REST API, Google Drive API, Google Sheets API, Admin SDK API y Gmail API.
3. Crear una cuenta de servicio.
4. Activar `Domain-wide delegation` para esa cuenta.
5. Crear y descargar una clave JSON. Debe custodiarse como secreto hasta cargarla en Sala Virtual.
6. Copiar el `OAuth 2 Client ID` numérico de la cuenta de servicio.

## Google Admin

Una persona con permisos de superadministración debe abrir:

`Seguridad > Control de acceso y datos > Controles de API > Delegación de todo el dominio`

Agregar el Client ID numérico de la cuenta de servicio y autorizar todos estos scopes:

```text
https://www.googleapis.com/auth/calendar.events,
https://www.googleapis.com/auth/drive,
https://www.googleapis.com/auth/meetings.space.settings,
https://www.googleapis.com/auth/meetings.space.readonly,
https://www.googleapis.com/auth/meetings.space.created,
https://www.googleapis.com/auth/gmail.send,
https://www.googleapis.com/auth/admin.reports.audit.readonly,
https://www.googleapis.com/auth/spreadsheets
```

Estos son los scopes que utiliza actualmente Sala Virtual:

- `calendar.events`: crear, modificar y cancelar los eventos de las salas y mantener sincronizados los calendarios de asistentes técnicos con cuenta Google vinculada.
- `drive`: localizar, mover, crear y reproducir archivos y carpetas de grabaciones y documentos.
- `meetings.space.settings`: leer y modificar la configuración de espacios Meet (`accessType`, `moderation`, `attendanceReportGenerationType`).
- `meetings.space.readonly`: consultar espacios, `conferenceRecords`, participantes en vivo, sesiones de participantes, grabaciones (`recordings`), transcripciones (`transcripts`) y notas.
- `meetings.space.created`: administrar los miembros de un espacio Meet y asignar o quitar cohosts mediante `spaces.members`.
- `gmail.send`: enviar notificaciones por Gmail API.
- `admin.reports.audit.readonly`: consultar eventos `call_ended` de Google Workspace Admin Reports API para atribuir correos electrónicos verificados a los participantes.
- `spreadsheets`: generar y actualizar las planillas de asistencia en Google Sheets.

La gestión de miembros/cohosts mediante `spaces.members` pertenece al Developer Preview
de Google Meet. Además de autorizar `meetings.space.created` en la delegación de todo el
dominio, el proyecto de Google Cloud usado por Sala Virtual debe estar habilitado en el
Google Workspace Developer Preview Program. Mientras ese acceso no esté activo, Calendar
puede invitar a la persona pero Google Meet no la promoverá a cohost.

`drive.meet.readonly` no sustituye a `drive`, porque la aplicación también necesita
operaciones de escritura y organización de archivos.

Las cuentas `salaNN` deben tener Google Calendar y Google Meet habilitados
y una edición de Workspace que permita crear reuniones Meet, grabar y transcribir.

Los asistentes técnicos no reciben una opción general para gestionar calendarios.
Cuando un usuario activo con rol `ASISTENTE_TECNICO` tiene una `CuentaGoogleFlacso`
realmente vinculada y verificada, Sala Virtual suplanta esa cuenta exclusivamente
para mantener sus asignaciones sincronizadas en `primary`. La aplicación publica o
actualiza el evento al asignar/reprogramar y lo elimina al reasignar o cancelar.
Los demás roles no participan de este flujo.

Después de modificar la delegación puede haber un tiempo de propagación en
Google Workspace. En el gestor, `Configuración > Google Workspace > Permisos de Google (Validar cuentas)`
comprueba cada scope individualmente en todas las cuentas sala
configuradas y también en la cuenta delegada general. La interfaz identifica
exactamente qué cuenta y qué scope requieren atención.

## Configuración del gestor

Las cuentas de servicio ya no se configuran mediante variables de entorno. Administración
las gestiona desde **Configuración > Google Workspace**. Las claves privadas se cifran con
`CONFIG_ENCRYPTION_KEY` antes de persistirse en PostgreSQL y nunca se devuelven por la API.

Existen dos clases operativas:

- **Principal** (`ConfiguracionGoogleWorkspace.id = principal`): es la única credencial que puede crear reuniones nuevas y también se usa para Gmail API, Drive y las operaciones normales de Meet.
- **Legacy** (`id` con prefijo `legacy:`): solo se usa como compatibilidad para espacios Meet históricos creados por proyectos/cuentas de servicio anteriores.

Al cambiar el email de la Principal desde la UI es obligatorio cargar también la nueva clave
privada. La credencial Principal anterior se archiva automáticamente como Legacy antes de
completar la rotación. Una Legacy puede probarse, editarse, reactivarse guardándola de nuevo
o desactivarse desde la misma pantalla.

La cuenta delegada general (`serviceAccountSubject`) y la carpeta de Drive siguen siendo
configuración general. Para crear o modificar reuniones, el gestor suplanta dinámicamente a
la cuenta host `salaNN` seleccionada. Para sincronizar asignaciones de asistencia, suplanta
dinámicamente a la cuenta Google vinculada del asistente técnico.

## Compatibilidad con Meets históricos y mensajes localizados

Para reuniones existentes, Sala Virtual intenta primero la credencial Principal. Cuando
Google responde con un error `403` de permisos sobre el miembro o espacio compatible con un espacio
creado por otra aplicación/proyecto —ya sea en inglés (`403 Permission denied on resource Member`)
o localizado al español por el idioma de la cuenta organizadora (`No tenés permisos para modificar el rol de este miembro.`)—,
se prueban automáticamente las credenciales Legacy activas manteniendo siempre como `subject` a la cuenta organizadora (`salaNN`).

Este fallback no se aplica durante la creación de una reunión nueva y tampoco se activa para
errores genéricos de scopes (`insufficient authentication scopes`), Calendar, red o servidor (`5xx`).
De ese modo la cuenta antigua mantiene acceso a espacios históricos sin volver a convertirse en credencial operativa.

Cuando ya no existan reuniones que dependan de una credencial Legacy, Administración puede
desactivarla. No es necesario conservar `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`
ni `GOOGLE_SERVICE_ACCOUNT_SUBJECT` en el entorno del runtime.

## Verificación y promoción de cohosts (`spaces.members`)

Las cuentas `sala01@flacso.edu.uy` ... `sala10@flacso.edu.uy` son las
organizadoras. El docente de la solicitud y los asistentes asignados deben
recibir el rol `COHOST` en el espacio Meet, incluidas sus cuentas Gmail o de
otras instituciones cuando sean cuentas Google válidas.

Una invitación Calendar, una fila local o una respuesta `409 ALREADY_EXISTS` no
confirman ese rol:

1. Cuando Google Calendar invita a un correo en el evento, Google Meet suele crear automáticamente su entrada en `spaces/{space}/members` con `role: "ROLE_UNSPECIFIED"`.
2. Al recibir `409 ALREADY_EXISTS` en `POST /v2/spaces/{space}/members`, el adaptador inspecciona la lista completa de miembros paginada (`listarMiembrosMeetHttp`).
3. Si el miembro figura con un rol distinto de `COHOST`, intenta promoverlo in-place (`PATCH`) y, si la API v2 de Google Meet rechaza la modificación in-place con `403` (`No tenés permisos para modificar el rol de este miembro.`) o `400`/`405`, elimina la membresía básica (`DELETE`) y la recrea con `POST` y `role: "COHOST"`.
4. Si una reunión tiene múltiples cohosts y uno de ellos falla por permisos de miembro, el adaptador procesa primero al resto de los cohosts válidos antes de propagar el error para activar el fallback Legacy o dejar registrado el pendiente en la cola.

El detalle muestra «Cohosts verificados en Google» solamente cuando existe una
verificación guardada para el mismo espacio, organizador y correos solicitados,
sin errores ni operaciones pendientes.

En **Configuración → Google Workspace**, el panel único `PendingMeetOperationsManager` permite:

- **Sincronizar con Google** (lote completo) o **Reintentar** encuentro por encuentro.
- **Descartar** tareas de ajuste (`CONFIGURAR_MEET`) no bloqueantes en encuentros que ya cuentan con su enlace Meet operativo (`joinUrl`).
- Ejecutar **Verificación global de cohosts** (solo lectura, con soporte `Principal -> Legacy`) y **Reuniones existentes → Actualizar**.

## Consola Operativa en Tiempo Real y Control Remoto

Desde `/operacion/[instanciaId]`, Administración y el Asistente Técnico asignado pueden:

- Monitorear en vivo la **Política de grabación** (`Solicitud: Requerida / No requerida`) separada del **Estado real en vivo en Meet** (`En vivo: Grabando / Inactiva`), junto con el estado de **Transcripción en vivo**.
- Visualizar y editar el padrón de asistentes persistido en `RegistroAsistenciaMeet` (conectados ahora, desconectados, duración acumulada sin doble conteo de multisesión, origen del correo y rol).
- Modificar en tiempo real el tipo de acceso del espacio Meet (`OPEN`, `TRUSTED`, `RESTRICTED` mediante `PATCH /v2/spaces/{space}?updateMask=config.access_type` con fallback `Principal -> Legacy`), la lista de cohosts y los parámetros operativos del encuentro.

## Planillas de asistencia y Reports API

Las listas de asistencia nuevas se generan como Google Sheets, con pestañas
`Asistencia`, `Host y cohosts` y `Datos brutos`.
La columna porcentual usa un degradado rojo (0 %) a verde (100 %) y el umbral 5/6.
Las conexiones de auditoría se atribuyen a una dirección solamente cuando
Reports devuelve `identifier_type=email_address`; los registros Meet sin
identificador verificable se conservan en `Datos brutos`.

Configurar `GOOGLE_REPORTS_ADMIN_EMAIL` (o `serviceAccountSubject` con rol de administrador) con la dirección de un administrador autorizado a leer auditorías de Meet; la aplicación suplanta esa cuenta mediante la delegación existente.

La ruta de regeneración es `POST /api/v1/reuniones/instancias/{instanciaId}/asistencia/regenerar` y requiere una sesión activa de `ADMINISTRACION`. Actualiza el ID de la hoja registrada para la instancia.

## Reparación de planillas (octubre de 2026)

La inspección de hojas utiliza el mismo scope `https://www.googleapis.com/auth/spreadsheets`
que la creación y actualización, sin solicitar `spreadsheets.readonly` por separado.
Google Workspace compara los scopes exactos de la delegación de dominio; una
variante no autorizada puede provocar `unauthorized_client` antes de leer la hoja.

Una planilla se considera vacía cuando no tiene filas reales en `Asistencia`
ni en `Datos brutos` (los encabezados y el host configurado no cuentan como asistencia).
La opción **Reparar planillas vacías** muestra los fallos por encuentro y permite
reintentar solamente los IDs de los encuentros fallidos mediante
`POST /api/v1/asistencia/planillas-vacias` con
`{ "eventoProveedorIds": ["..."] }`. Los IDs se validan contra la lista
de planillas registradas y no permiten acceder a archivos arbitrarios.

Si persiste `unauthorized_client`, comprobar en Admin Console la delegación de todo
el dominio (Client ID numérico de la credencial Principal, scopes de Sheets,
Drive, Meet y Reports; cuenta `subject` existente y autorizada). El cambio de
código no puede conceder permisos desde la consola Google.
