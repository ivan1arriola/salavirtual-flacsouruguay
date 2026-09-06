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
5. Crear y descargar una clave JSON. Debe custodiarse como secreto.
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

Administracion guarda mediante `PUT /api/v1/configuracion/google-workspace`:

```json
{
  "serviceAccountEmail": "cuenta-servicio@proyecto.iam.gserviceaccount.com",
  "privateKey": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----",
  "serviceAccountSubject": "administracion@flacso.edu.uy",
  "driveDestinationId": "ID_DE_LA_CARPETA_DRIVE",
  "activa": true
}
```

`serviceAccountSubject` queda reservado para operaciones generales de Workspace
y Drive. Para crear reuniones, el gestor suplanta dinamicamente a la cuenta
host seleccionada. Para sincronizar asignaciones de asistencia, suplanta
dinamicamente a la cuenta Google vinculada del asistente tecnico.

## Sincronizacion de calendarios de asistentes

La sincronizacion principal es reactiva: se ejecuta al asignar o reasignar un
asistente, al reprogramar o cancelar encuentros, al cancelar una serie y al
vincular una cuenta Google de un asistente con reuniones futuras.

Si Google Calendar o la infraestructura de sincronizacion falla despues de que el
cambio local fue guardado, la operacion local no se revierte ni se reporta como
fallida. La API devuelve el cambio guardado y marca la sincronizacion como
pendiente para un reintento posterior.

Como red de seguridad, Vercel ejecuta diariamente:

`GET /api/v1/asistencia/sincronizar-calendarios`

El cron esta protegido con `CRON_SECRET` y vuelve a reconciliar reuniones futuras
con asignaciones. El proyecto usa el plan Hobby de Vercel, por lo que este cron de
recuperacion se mantiene en una ejecucion diaria; la sincronizacion inmediata no
depende de este cron.

## Resultado

Al crear una reunion, el gestor:

1. Registra la solicitud y sus instancias en PostgreSQL.
2. Crea un evento independiente en el calendario de la sala host.
3. Solicita a Google un Meet nuevo para ese evento.
4. Guarda el ID externo, codigo Meet y enlace de acceso.
5. Configura el espacio Meet con los scopes especificos de Meet.
6. Si existe un asistente tecnico asignado con Google vinculado, publica el encuentro en su calendario principal.
7. Conserva un error reintentable si Google rechaza la operacion.

Google puede responder con la conferencia en estado pendiente. El adaptador
vuelve a consultar el evento durante unos segundos antes de marcar un error.
