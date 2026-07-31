# Configuracion de Google Workspace

## Cuentas host

El gestor usa diez cuentas licenciadas, desde `sala01@flacso.edu.uy` hasta
`sala10@flacso.edu.uy`. Estan registradas como `CuentaProveedor` del proveedor
`GOOGLE_MEET`; no se almacenan sus contrasenas.

Cada reunion se crea en el calendario principal de la sala seleccionada. La
cuenta de servicio actua en nombre de esa sala mediante delegacion de dominio.

## Google Cloud

1. Crear o elegir un proyecto de Google Cloud de FLACSO.
2. Habilitar Google Calendar API.
3. Crear una cuenta de servicio.
4. Activar `Domain-wide delegation` para esa cuenta.
5. Crear y descargar una clave JSON. Debe custodiarse como secreto.
6. Copiar el `OAuth 2 Client ID` de la cuenta de servicio.

## Google Admin

Una persona con permisos de superadministracion debe abrir:

`Seguridad > Control de acceso y datos > Controles de API > Delegacion de todo el dominio`

Agregar el Client ID de la cuenta de servicio y autorizar este scope:

```text
https://www.googleapis.com/auth/calendar.events
```

Las diez cuentas `salaNN` deben tener Google Calendar habilitado y una edicion
de Workspace que permita crear reuniones Meet.

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
5. Conserva un error reintentable si Google rechaza la operacion.

Google puede responder con la conferencia en estado pendiente. El adaptador
vuelve a consultar el evento durante unos segundos antes de marcar un error.
