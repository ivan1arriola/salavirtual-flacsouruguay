# Configuracion de Google Workspace

## Cuentas host

El gestor usa diez cuentas licenciadas, desde `sala01@flacso.edu.uy` hasta
`sala10@flacso.edu.uy`. Estan registradas como `CuentaProveedor` del proveedor
`GOOGLE_MEET`; no se almacenan sus contrasenas.

Cada reunion se crea en el calendario principal de la sala seleccionada. La
cuenta de servicio actua en nombre de esa sala mediante delegacion de dominio.

## Google Cloud

1. Crear o elegir un proyecto de Google Cloud de FLACSO.
2. Habilitar Google Calendar API, Google Meet REST API, Google Drive API y Gmail API.
3. Crear una cuenta de servicio.
4. Activar `Domain-wide delegation` para esa cuenta.
5. Crear y descargar una clave JSON. Debe custodiarse como secreto hasta cargarla en Sala Virtual.
6. Copiar el `OAuth 2 Client ID` numerico de la cuenta de servicio.

## Google Admin

Una persona con permisos de superadministracion debe abrir:

`Seguridad > Control de acceso y datos > Controles de API > Delegacion de todo el dominio`

Agregar el Client ID numerico de la cuenta de servicio y autorizar todos estos scopes:

```text
https://www.googleapis.com/auth/calendar.events,
https://www.googleapis.com/auth/drive,
https://www.googleapis.com/auth/meetings.space.settings,
https://www.googleapis.com/auth/meetings.space.readonly,
https://www.googleapis.com/auth/meetings.space.created,
https://www.googleapis.com/auth/gmail.send
```

Estos son los scopes que utiliza actualmente Sala Virtual:

- `calendar.events`: crear, modificar y cancelar los eventos de las salas y mantener sincronizados los calendarios de asistentes tecnicos con cuenta Google vinculada.
- `drive`: localizar, mover, crear y reproducir archivos y carpetas de grabaciones y documentos.
- `meetings.space.settings`: leer y modificar la configuracion de Meets creados desde Calendar, incluidos ajustes y cohosts.
- `meetings.space.readonly`: consultar espacios, conference records, participantes, grabaciones, transcripciones y notas.
- `meetings.space.created`: administrar los miembros de un espacio Meet y asignar o quitar cohosts mediante `spaces.members`.
- `gmail.send`: enviar notificaciones por Gmail API.

La gestion de miembros/cohosts mediante `spaces.members` pertenece al Developer Preview
de Google Meet. Ademas de autorizar `meetings.space.created` en la delegacion de todo el
dominio, el proyecto de Google Cloud usado por Sala Virtual debe estar habilitado en el
Google Workspace Developer Preview Program. Mientras ese acceso no este activo, Calendar
puede invitar a la persona pero Google Meet no la promovera a cohost.

`drive.meet.readonly` no sustituye a `drive`, porque la aplicacion tambien necesita
operaciones de escritura y organizacion de archivos.

Las diez cuentas `salaNN` deben tener Google Calendar y Google Meet habilitados
y una edicion de Workspace que permita crear reuniones Meet.

Los asistentes tecnicos no reciben una opcion general para gestionar calendarios.
Cuando un usuario activo con rol `ASISTENTE_TECNICO` tiene una `CuentaGoogleFlacso`
realmente vinculada y verificada, Sala Virtual suplanta esa cuenta exclusivamente
para mantener sus asignaciones sincronizadas en `primary`. La aplicacion publica o
actualiza el evento al asignar/reprogramar y lo elimina al reasignar o cancelar.
Los demas roles no participan de este flujo.

Despues de modificar la delegacion puede haber un tiempo de propagacion en
Google Workspace. En el gestor, `Configuracion > Google Workspace > Validacion
de scopes` comprueba cada scope individualmente en todas las cuentas sala
configuradas y tambien en la cuenta delegada general. La interfaz identifica
exactamente que cuenta y que scope requieren atencion.

## Configuracion del gestor

Las cuentas de servicio ya no se configuran mediante variables de entorno. Administracion
las gestiona desde **Configuracion > Google Workspace**. Las claves privadas se cifran con
`CONFIG_ENCRYPTION_KEY` antes de persistirse en PostgreSQL y nunca se devuelven por la API.

Existen dos clases operativas:

- **Principal** (`ConfiguracionGoogleWorkspace.id = principal`): es la unica credencial que puede crear reuniones nuevas y tambien se usa para Gmail API, Drive y las operaciones normales de Meet.
- **Legacy** (`id` con prefijo `legacy:`): solo se usa como compatibilidad para espacios Meet historicos creados por proyectos/cuentas de servicio anteriores.

Al cambiar el email de la Principal desde la UI es obligatorio cargar tambien la nueva clave
privada. La credencial Principal anterior se archiva automaticamente como Legacy antes de
completar la rotacion. Una Legacy puede probarse, editarse, reactivarse guardandola de nuevo
o desactivarse desde la misma pantalla.

La cuenta delegada general (`serviceAccountSubject`) y la carpeta de Drive siguen siendo
configuracion general. Para crear o modificar reuniones, el gestor suplanta dinamicamente a
la cuenta host `salaNN` seleccionada. Para sincronizar asignaciones de asistencia, suplanta
dinamicamente a la cuenta Google vinculada del asistente tecnico.

## Asistencia en Google Sheets

Las listas de asistencia nuevas se generan como Google Sheets, con pesta√±as
`Asistencia`, `Host y cohosts` y `Datos brutos`.
La columna porcentual usa un degradado rojo (0 %) a verde (100 %) y el umbral 5/6.
Las conexiones de auditor√≠a se atribuyen a una direcci√≥n solamente cuando
Reports devuelve `identifier_type=email_address`; los registros Meet sin
identificador verificable se conservan en `Datos brutos`.

Requisitos del proyecto de Google Cloud:
- Habilitar **Google Sheets API** y **Admin SDK API**.
- A√±adir a delegaci√≥n de dominio, sin quitar los scopes existentes:
  `https://www.googleapis.com/auth/spreadsheets`
  y `https://www.googleapis.com/auth/admin.reports.audit.readonly`.
- Definir la variable privada `GOOGLE_REPORTS_ADMIN_EMAIL` con un administrador
  que tenga permisos para consultar auditor√≠a Meet.
- La cuenta de servicio Principal existente debe poder escribir en Drive y
  actuar como la cuenta organizadora `salaNN`.

**Limitaciones**: los informes Meet no dan directamente email de todos los
participantes; registros an√≥nimos no deben asignarse por coincidencia de nombre.
El d√≠a completo de auditor√≠a puede incluir m√∫ltiples instancias que compartan
enlace; validar por `conference_id` antes de considerar el documento definitivo.
No se reemplaza autom√°ticamente un documento ya sincronizado a menos que
vuelva a seleccionarse esa reuni√≥n en el flujo de sincronizaci√≥n.

## Compatibilidad con Meets historicos

Para reuniones existentes, Sala Virtual intenta primero la credencial Principal. Solo cuando
Google responde con el `403 Permission denied on resource Member` compatible con un espacio
creado por otra aplicacion/proyecto, se prueban las credenciales Legacy activas.

Este fallback no se aplica durante la creacion de una reunion nueva y tampoco se activa para
errores genericos de scopes, Calendar, red o servidor. De ese modo la cuenta antigua puede
mantener acceso a espacios historicos sin volver a convertirse en credencial operativa.

Cuando ya no existan reuniones que dependan de una credencial Legacy, Administracion puede
desactivarla. No es necesario conservar `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`
ni `GOOGLE_SERVICE_ACCOUNT_SUBJECT` en el entorno del runtime.

## Sincronizacion de calendarios de asistentes

La sincronizacion principal es reactiva: se ejecuta al asignar o reasignar un
asistente, al reprogramar o cancelar encuentros, al cancelar una serie y al
vincular una cuenta Google de un asistente con reuniones futuras.

Si Google Calendar o la infraestructura de sincronizacion falla despues de que el
cambio local fue guardado, la operacion local no se revierte ni se reporta como
fallida. La API devuelve el cambio guardado y marca la sincronizacion como
pendiente para un reintento posterior.

Como red de seguridad existe una sincronizacion periodica protegida con `CRON_SECRET`
que vuelve a reconciliar reuniones futuras con asignaciones. La sincronizacion inmediata
no depende de esa tarea periodica.

## Resultado

Al crear una reunion, el gestor:

1. Registra la solicitud y sus instancias en PostgreSQL.
2. Crea un evento independiente en el calendario de la sala host.
3. Solicita a Google un Meet nuevo usando exclusivamente la credencial Principal.
4. Guarda el ID externo, codigo Meet y enlace de acceso.
5. Configura el espacio Meet con los scopes especificos de Meet.
6. Si existe un asistente tecnico asignado con Google vinculado, publica el encuentro en su calendario principal.
7. Conserva un error reintentable si Google rechaza la operacion.

Google puede responder con la conferencia en estado pendiente. El adaptador
vuelve a consultar el evento durante unos segundos antes de marcar un error.

## Verificaci√≥n y reparaci√≥n de cohosts

Las cuentas `sala01@flacso.edu.uy` ... `sala10@flacso.edu.uy` son las
organizadoras. El docente de la solicitud y los asistentes asignados deben
recibir el rol `COHOST` en el espacio Meet, incluidas sus cuentas Gmail o de
otras instituciones cuando sean cuentas Google v√°lidas.

Una invitaci√≥n Calendar, una fila local o una respuesta `ALREADY_EXISTS` no
confirman ese rol. El adaptador lee los miembros del espacio (todas las p√°ginas)
y comprueba `COHOST`, adem√°s de verificar que la administraci√≥n de anfitriones
est√© activada. Si un miembro existe con otro rol, se recrea con `COHOST` porque
la API de miembros no ofrece una operaci√≥n de actualizaci√≥n.

El detalle muestra ¬´Cohosts verificados en Google¬ª solamente cuando existe una
verificaci√≥n guardada para el mismo espacio, organizador y correos solicitados,
sin errores ni operaciones pendientes. Es la √∫ltima verificaci√≥n realizada por
la aplicaci√≥n, no una consulta en tiempo real: cambios manuales posteriores en
Google se detectar√°n en la pr√≥xima sincronizaci√≥n. Los errores de permisos se
muestran aunque el enlace de la reuni√≥n ya funcione.

Despu√©s de desplegar, Administraci√≥n puede usar **Configuraci√≥n ‚Üí Google
Workspace ‚Üí Reuniones existentes ‚Üí Actualizar**. La reparaci√≥n completa los
cohosts del docente y asistentes, incluye las cuentas externas y verifica el
Meet que Calendar tiene vinculado. Usa las operaciones persistidas del sistema,
no reemplaza enlaces y no pisa cancelaciones o reprogramaciones en curso. Las
reuniones omitidas por otra operaci√≥n pendiente deben revisarse despu√©s de que
termine esa operaci√≥n. Los errores quedan disponibles para reintentar.

Si Google rechaza `spaces.members`, revisar la habilitaci√≥n del proyecto en
Developer Preview, los scopes delegados y la identidad/licencia de la cuenta
organizadora. No se considera exitosa una asignaci√≥n rechazada por Google.

## Planillas de asistencia y Reports API

Para identificar de forma verificable a participantes y publicar Google Sheets, el mismo proyecto de Google Cloud debe tener habilitadas **Google Sheets API**, **Google Drive API** y **Admin SDK API** (Reports API). La cuenta de servicio existente debe mantener la delegaciÛn de todo el dominio; no se debe crear ni cargar una credencial nueva para esta funciÛn.

Agregar al Client ID numÈrico ya autorizado estos scopes:

```text
https://www.googleapis.com/auth/admin.reports.audit.readonly
https://www.googleapis.com/auth/spreadsheets
```

Se conserva el scope Drive ya usado por la aplicaciÛn. La configuraciÛn cifrada de Workspace debe apuntar a la cuenta de servicio y la carpeta de destino existentes. Configurar `GOOGLE_REPORTS_ADMIN_EMAIL` con la direcciÛn de un administrador autorizado a leer auditorÌas de Meet; la aplicaciÛn suplanta esa cuenta mediante la delegaciÛn existente. La cuenta de servicio organizadora debe tener acceso de escritura a la carpeta del encuentro. Restringir el acceso a las hojas y carpetas seg˙n las mismas polÌticas de Drive aprobadas para datos acadÈmicos.

La b˙squeda usa eventos `call_ended` del Reports API, que pueden no incluir correo electrÛnico. Solo se asocia una direcciÛn cuando el tipo de identificador es `email_address`; otros identificadores se conservan sin atribuciÛn. Los cÛdigos Meet se comparan normalizados, conservando el original en los datos brutos. Los registros se filtran por su conferencia y el intervalo observado; no se infiere identidad a partir del nombre.

La ruta de regeneraciÛn es `POST /api/v1/reuniones/instancias/{instanciaId}/asistencia/regenerar` y requiere una sesiÛn activa de `ADMINISTRACION`. Actualiza el ID de la hoja registrada para la instancia.

### VerificaciÛn automatizada y limitaciones

Las pruebas locales cubren el c·lculo horario, paginaciÛn de Reports API, normalizaciÛn de cÛdigos, preservaciÛn de IDs en datos crudos, actualizaciÛn de hoja, paginaciÛn DB, filtros y alcance del actor. No sustituyen una validaciÛn en el Workspace institucional: la visibilidad real de correos depende de la polÌtica/ediciÛn de Workspace y de los datos que Reports API entregue; el acceso a la carpeta y los scopes delegados se deben verificar con la configuraciÛn institucional antes de habilitar la regeneraciÛn para usuarios.

## Resultados de verificaci√≥n de esta implementaci√≥n

Verificado localmente el 16/10/2026 en Node.js del repositorio:

- `npm run check`: correcto.
- `npm test -- --reporter=dot`: 160 archivos aprobados, 3 omitidos; 1.398 pruebas aprobadas, 12 omitidas.
- `npm run build`: correcto con `AUTH_SECRET`, `AUTH_TRUST_HOST` y `APP_BASE_URL` de relleno de compilaci√≥n definidos solo en el proceso local. Sin esas variables requeridas, Next falla al cargar la configuraci√≥n de Auth.js antes de completar la recopilaci√≥n de rutas.
- Las pruebas que requieren PostgreSQL configurado y validaci√≥n de Reports/Drive con el Workspace institucional no se ejecutaron en este entorno.

El resultado automatizado no verifica que Workspace exponga correos para cada participante ni que la cuenta institucional pueda mover hojas a todas las carpetas objetivo. Esa comprobaci√≥n sigue pendiente con la configuraci√≥n existente del centro.
