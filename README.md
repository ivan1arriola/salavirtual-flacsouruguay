# Sala Virtual FLACSO

**Sala Virtual FLACSO** es la plataforma operativa de FLACSO Uruguay para gestionar reuniones académicas realizadas mediante Google Meet.

Centraliza el ciclo completo de las reuniones: solicitudes, agenda, asistencia técnica, grabaciones, historial y liquidaciones.

## Estado del proyecto

Este repositorio contiene la **aplicación vigente** para la gestión de reuniones de FLACSO Uruguay.

Todo cambio relacionado con el producto, la interfaz, el modelo de datos o los flujos actuales de reuniones debe implementarse en este proyecto.

La plataforma reemplaza a los proyectos anteriores:

* `../flacso-zoom-plataforma-web`
* `../flacso-zoom-sincronizador-desktop`

Google Meet es el proveedor operativo principal.

Zoom permanece integrado únicamente como **proveedor histórico**, para conservar y consultar reuniones, grabaciones, costos y otros registros generados por los sistemas anteriores.

El dominio de la aplicación está diseñado para no depender directamente de un proveedor concreto de videoconferencia.

## Objetivos de arquitectura

La plataforma busca mantener una arquitectura simple, mantenible y preparada para evolucionar.

Sus principales objetivos son:

* Mantener un modelo de datos normalizado en **3NF**.
* Separar claramente entidades institucionales, solicitudes, eventos, proveedores, grabaciones y liquidaciones.
* Mantener el núcleo de negocio independiente de Google Meet y Zoom.
* Utilizar Google Meet como proveedor operativo principal.
* Conservar Zoom para consulta, trazabilidad e importación de información histórica.
* Permitir migraciones incrementales desde los sistemas anteriores sin interrumpir la operación.
* Centralizar la configuración de integraciones institucionales desde la propia aplicación.

## Stack

La aplicación utiliza:

* **Next.js App Router**
* **TypeScript**
* **Prisma**
* **PostgreSQL**
* **Auth.js**
* **Google Workspace APIs**

## Google Workspace

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

Las notificaciones por correo utilizan prioritariamente la **Gmail API**, mediante la credencial Principal de Google Workspace y la cuenta configurada para delegación en la aplicación.

SMTP se mantiene únicamente como mecanismo de respaldo.

Si no existe ningún proveedor de correo configurado:

* las notificaciones internas continúan funcionando;
* el envío de correo electrónico se omite;
* el flujo principal de la aplicación no falla.

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

## Documentación

La documentación técnica y funcional se encuentra en `docs/`.

* [Arquitectura](docs/arquitectura.md)
* [Modelo de datos 3NF](docs/modelo-3nf.md)
* [Migración desde FLACSO Zoom](docs/migracion-desde-flacso-zoom.md)
* [Despliegue en EC2](docs/despliegue-ec2.md)
* [Configuración de Google Workspace](docs/configuracion-google-workspace.md)
* [Reportes mensuales de asistencia técnica](docs/reportes-mensuales-asistencia.md)
* [UI ligera](docs/ui-ligera.md)
