# Sala Virtual FLACSO

**Sala Virtual FLACSO** es la plataforma operativa de FLACSO Uruguay para gestionar reuniones académicas realizadas mediante Google Meet.

Centraliza el ciclo completo de las reuniones: solicitudes, agenda, monitoreo, grabaciones, historial y liquidaciones.

## Estado del proyecto

Este repositorio contiene la **aplicación vigente** para la gestión de reuniones de FLACSO Uruguay.

Todo cambio relacionado con el producto, la interfaz, el modelo de datos o los flujos actuales de reuniones debe implementarse en este proyecto.

La plataforma reemplaza a los proyectos anteriores:

- `../flacso-zoom-plataforma-web`
- `../flacso-zoom-sincronizador-desktop`

Google Meet es el proveedor operativo principal.

Zoom permanece integrado únicamente como **proveedor histórico**, para conservar y consultar reuniones, grabaciones, costos y otros registros generados por los sistemas anteriores.

El dominio de la aplicación está diseñado para no depender directamente de un proveedor concreto de videoconferencia.

La sincronización recupera grabaciones y planillas de asistencia desde Google Meet. Los informes parciales se generan luego de 24 horas cuando hubo sesiones de participantes; si no hay datos de asistencia, se evita crear una planilla vacía. Al actualizar cohosts, Sala Virtual retira solo los que gestionaba y conserva miembros añadidos directamente en Google Meet.

## Objetivos de arquitectura

La plataforma busca mantener una arquitectura simple, mantenible y preparada para evolucionar.

Sus principales objetivos son:

- Mantener un modelo de datos normalizado en **3NF**.
- Separar claramente entidades institucionales, solicitudes, eventos, proveedores, grabaciones y liquidaciones.
- Mantener el núcleo de negocio independiente de Google Meet y Zoom.
- Utilizar Google Meet como proveedor operativo principal.
- Conservar Zoom para consulta, trazabilidad e importación de información histórica.
- Permitir migraciones incrementales desde los sistemas anteriores sin interrumpir la operación.
- Centralizar la configuración de integraciones institucionales desde la propia aplicación.

## Stack

La aplicación utiliza:

- **Next.js App Router**
- **TypeScript**
- **Prisma**
- **PostgreSQL**
- **Auth.js**
- **Google Workspace APIs**

## Estilos de interfaz

Los tokens compartidos de interfaz se definen en `app/brand.css`. Incluyen colores institucionales, tipografía, espaciado, bordes, radios, foco y estados semánticos (`success`, `warning`, `danger` y `neutral`). Los componentes deben consumir estos tokens para conservar contraste y consistencia.

La consolidación de estilos es incremental: antes de retirar reglas existentes hay que comprobar sus usos en las pantallas actuales. Los nuevos cambios deben evitar añadir hojas globales correctivas que dupliquen reglas de componentes.

## Navegación

La navegación autenticada muestra opciones según el rol y conserva una barra inferior móvil con cuatro accesos principales y un menú **Más**. En Administración, el menú lateral agrupa trabajo diario, equipo de monitoreo, recursos y sistema; los recursos contienen grabaciones y Personas y programas. Docentes y asistentes de monitoreo mantienen sus recorridos específicos. La interfaz solo controla visibilidad: las páginas y acciones conservan sus políticas de autorización del servidor.

## Google Workspace

La administración centralizada de **Personas y programas** vive en `/usuarios`, con vistas separadas para cada tarea. `/configuracion?seccion=programas` se conserva como enlace de compatibilidad y redirige a la vista de Programas. Los programas representan las unidades académicas en la interfaz; los campos históricos de unidad académica se conservan en los datos y una edición desde la nueva pantalla no los modifica.

La integración con Google Workspace se configura desde:

**Configuración > Google Workspace**

Las cuentas de servicio y sus credenciales se administran desde la interfaz de la aplicación.

Las claves privadas se almacenan cifradas en PostgreSQL mediante:

```env
CONFIG_ENCRYPTION_KEY
```

Por lo tanto, las credenciales de Google Workspace no se configuran mediante variables de entorno `GOOGLE_*`.

### Credencial Principal

La credencial marcada como **Principal** es la única autorizada para crear nuevas reuniones de Google Meet.

Es la integración utilizada por los flujos operativos actuales de Sala Virtual.

### Credenciales Legacy

También pueden registrarse credenciales **Legacy**.

Estas credenciales existen exclusivamente para administrar reuniones históricas creadas por proyectos o cuentas de servicio anteriores.

La aplicación intenta utilizar una credencial Legacy únicamente cuando la credencial Principal recibe el error específico de permisos relacionado con `Member` al operar sobre un espacio de Meet existente.

No se utilizan credenciales Legacy para crear reuniones nuevas.

## Correo transaccional

Amazon SES puede configurarse como proveedor principal desde:

**Configuración > Correo**

La interfaz guarda la región de AWS, el correo remitente verificado, Reply-To opcional y el estado de activación. En EC2, el AWS SDK obtiene credenciales temporales del rol IAM asociado a la instancia; no se guardan access keys de AWS en la aplicación ni en PostgreSQL.

Cuando Amazon SES está activo, se usa para notificaciones, invitaciones y pruebas de correo. Si está desactivado o no configurado, se mantiene el flujo anterior: Gmail API mediante la credencial Principal de Google Workspace y luego SMTP como respaldo cuando Gmail no está configurado. Si SES falla después de intentar el envío, no se cambia a otro proveedor para evitar correos duplicados.

Para habilitar SES se requiere un rol IAM en EC2 con permiso `ses:SendEmail` limitado a la identidad verificada. El remitente debe estar verificado en la misma región configurada en Sala Virtual. En sandbox, los destinatarios también deben estar verificados. La prueba de la aplicación confirma que el proveedor aceptó el mensaje, no su entrega final al buzón.

Si ningún proveedor está configurado:

- las notificaciones internas continúan funcionando;
- el envío de correo electrónico se omite;
- el flujo principal de la aplicación no falla.

### Configuración SMTP de respaldo

```env
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
```

`SMTP_SECURE=true` debe utilizarse normalmente cuando SMTP funciona mediante el puerto `465`.

## Configuración inicial

Se recomienda utilizar Node.js 24.

```bash
nvm install 24
nvm use 24

npm install

cp .env.example .env

npm run db:generate
npm run db:push

npm run dev
```

Después del primer acceso a la aplicación, completar la configuración institucional desde:

**Configuración > Google Workspace**

## Verificaciones de calidad

Ejecutá `npm ci` y luego `npm run lint`, `npm run format:check`, `npm run deadcode` y `npm run architecture`.
`npm run format` aplica el formato de Prettier.

`eslint-suppressions.json` registra infracciones previas por archivo y regla. Cuando corrijas una infracción
registrada, actualizá el archivo con `npm run lint -- --prune-suppressions`.

## Documentación

La documentación técnica y funcional se encuentra en `docs/`.

- [Arquitectura](docs/arquitectura.md)
- [Modelo de datos 3NF](docs/modelo-3nf.md)
- [Migración desde FLACSO Zoom](docs/migracion-desde-flacso-zoom.md)
- [Despliegue en EC2](docs/despliegue-ec2.md)
- [Configuración de Google Workspace](docs/configuracion-google-workspace.md)
- [Configuración de Amazon SES](docs/configuracion-amazon-ses.md)
- [Reportes mensuales de asistencia técnica](docs/reportes-mensuales-asistencia.md)
- [UI ligera](docs/ui-ligera.md)
