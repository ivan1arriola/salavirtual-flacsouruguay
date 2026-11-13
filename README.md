# Sala Virtual FLACSO

Plataforma interna de FLACSO Uruguay para organizar clases y reuniones virtuales o híbridas, coordinar su monitoreo y consultar asistencia, grabaciones y archivos. La aplicación está disponible en [salavirtual.flacso.edu.uy](https://salavirtual.flacso.edu.uy).

## Qué permite hacer

- Crear una reunión o serie de encuentros para un programa académico, con fechas, invitados, cuenta anfitriona y necesidades de grabación o asistencia técnica.
- Gestionar reuniones de **Zoom y Google Meet**. Cada encuentro conserva el proveedor y enlace activos; Zoom también tiene cuentas anfitrionas y grupos configurables.
- Consultar agenda, monitoreo e incidencias.
- Ver grabaciones, transcripciones y otros archivos. Un worker independiente inventaría los archivos de Zoom y puede conservarlos en Google Drive.
- Consultar asistencia posterior a la clase y conciliar la identidad de los participantes de Zoom.
- Administrar personas, programas, notificaciones y liquidaciones según el rol.

### Acceso por rol

| Rol               | Recorrido principal                                                                                                                                                                                         |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Docente           | **Mis clases** (próximas, en curso y anteriores), nueva reunión, programas, grabaciones y asistencia de sus programas. La lista de conectados en Zoom depende del acceso de la cuenta al Dashboard de Zoom. |
| Asistente técnico | Mi agenda, agenda abierta, monitoreos asignados, consola operativa e historial.                                                                                                                             |
| Administración    | Agenda y series, monitoreo, grabaciones, personas y programas, centro de operaciones y configuración.                                                                                                       |

La navegación se adapta al rol y a pantallas móviles. Los permisos también se comprueban en el servidor.

## Tecnologías y estructura

- Node.js **24.x**, Next.js **16** con App Router, React **19** y TypeScript.
- PostgreSQL con Prisma **6**; autenticación con Auth.js.
- Zoom Server-to-Server OAuth, Google Workspace (Calendar, Meet, Drive y Gmail) y Amazon SES.
- `app/`: páginas y rutas API; `src/modules/`: reglas y casos de uso; `src/integrations/`: clientes externos; `src/bootstrap/`: composición; `prisma/`: esquema y migraciones; `infra/ec2/`: servicios y despliegue.

El modelo separa solicitudes (`SolicitudSala`), encuentros (`InstanciaSala`) y eventos del proveedor (`EventoProveedor`). Los invitados programados y la asistencia registrada son datos distintos.

## Desarrollo local

Necesitás Node.js 24, npm y una base PostgreSQL de desarrollo. Usá una base descartable: la inicialización del esquema no está destinada a producción.

```bash
npm ci
cp .env.example .env
# Completar DATABASE_URL, AUTH_SECRET, CONFIG_ENCRYPTION_KEY y APP_BASE_URL.
npm run db:generate
npm run db:push
npm run dev:next
```

Abrí [localhost:3000](http://localhost:3000). `npm run dev` utiliza el script de desarrollo con túnel; `dev:next` inicia Next.js directamente. `CONFIG_ENCRYPTION_KEY` debe contener 64 caracteres hexadecimales. No agregues secretos al repositorio.

Google Workspace, Zoom y Amazon SES se administran desde **Configuración**. Zoom también admite `ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID` y `ZOOM_CLIENT_SECRET` como respaldo cuando aún no hay configuración guardada. Las claves privadas institucionales se almacenan cifradas en PostgreSQL. [`.env.example`](.env.example) enumera las variables disponibles, incluidas algunas opcionales o de migración.

### Comandos frecuentes

| Comando                   | Uso                                       |
| ------------------------- | ----------------------------------------- |
| `npm run check`           | Tipos de TypeScript.                      |
| `npm test`                | Pruebas con Vitest.                       |
| `npm run lint`            | ESLint sin advertencias.                  |
| `npm run format:check`    | Formato con Prettier.                     |
| `npm run deadcode`        | Knip: código y dependencias sin uso.      |
| `npm run architecture`    | Dependency Cruiser: fronteras de módulos. |
| `npm run validate:schema` | Reglas adicionales del esquema.           |
| `npm run build`           | Genera Prisma y compila para producción.  |

`npm run format` aplica el formato. `eslint-suppressions.json` conserva excepciones anteriores; al resolver una, ejecutá `npm run lint -- --prune-suppressions`.

## CI y despliegue

**CI · Sala Virtual** se ejecuta en los PR y pushes a `main`. Comprueba scripts Bash, esquema Prisma, TypeScript, ESLint, Prettier, Knip, Dependency Cruiser, pruebas, cobertura, auditoría de dependencias, build y PostgreSQL integrado. El gate final requiere que todas las verificaciones aprueben.

Un CI exitoso de un **push a `main`** habilita **Deploy · EC2**. El despliegue usa OIDC para credenciales temporales de AWS y SSM para ejecutar el release en EC2. Un CI de PR no despliega. La aplicación y el worker de archivos Zoom son servicios separados; el worker solo se reinicia si su unidad fue habilitada.

Para recuperar grabaciones históricas de Zoom, comenzá con un dry run de un período explícito:

```bash
npm run zoom:archivos:historico:dry -- --desde 2026-11-01 --hasta 2026-11-30
```

Los archivos disponibles dependen de la retención y permisos de Zoom. El procedimiento y los límites de transferencia se describen en [Archivos y asistencia de Zoom](docs/zoom-archivos-asistencia.md).

## Documentación

- [Arquitectura y módulos](docs/arquitectura.md)
- [Modelo de datos](docs/modelo-3nf.md)
- [Google Workspace](docs/configuracion-google-workspace.md)
- [Cuentas Zoom por grupo](docs/configuracion-zoom-grupo.md)
- [Archivos y asistencia de Zoom](docs/zoom-archivos-asistencia.md)
- [Correo con Amazon SES](docs/configuracion-amazon-ses.md)
- [Instructivo para docentes](docs/instructivo-docentes.md)
- [Instructivo para asistentes](docs/instructivo-asistentes.md)
- [Infraestructura EC2](infra/ec2/)
