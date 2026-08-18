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
https://www.googleapis.com/auth/gmail.send
```

Las diez cuentas `salaNN` deben tener Google Calendar y Google Meet habilitados
y una edicion de Workspace que permita crear reuniones Meet.

Despues de modificar la delegacion puede haber un tiempo de propagacion en
Google Workspace. En el gestor, `Configuracion > Google Workspace > Validacion
de scopes` permite comprobar cada scope individualmente usando una cuenta host
activa, de la misma forma en que se ejecuta la provision real de reuniones.

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
host seleccionada.

## Resultado

Al crear una reunion, el gestor:

1. Registra la solicitud y sus instancias en PostgreSQL.
2. Crea un evento independiente en el calendario de la sala host.
3. Solicita a Google un Meet nuevo para ese evento.
4. Guarda el ID externo, codigo Meet y enlace de acceso.
5. Configura el espacio Meet con los scopes especificos de Meet.
6. Conserva un error reintentable si Google rechaza la operacion.

Google puede responder con la conferencia en estado pendiente. El adaptador
vuelve a consultar el evento durante unos segundos antes de marcar un error.
