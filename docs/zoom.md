# Zoom como proveedor operativo

Zoom convive con Google Meet. Cada reunión (serie) se crea con un único
proveedor, elegido en el formulario de **Nueva reunión**. La opción aparece
solo cuando Zoom está activo y hay al menos una sala Zoom activa con licencia.

## Qué hace Sala Virtual con Zoom

| Función | Meet | Zoom |
| --- | --- | --- |
| Crear, reprogramar y cancelar | Evento de Calendar + espacio Meet | Reunión programada (`type 2`) por encuentro |
| Cohosts | Rol COHOST del espacio | *Alternative hosts*: solo usuarios de la cuenta Zoom. El resto queda "pendiente" y se promueve dentro de la reunión |
| Grabación | La inicia un host | `auto_recording: cloud` si la solicitud la requiere; luego se copia a la carpeta de Drive de la reunión |
| Transcripción | Google Docs | Archivo `.vtt` de Zoom copiado a Drive |
| Planilla de asistencia | Meet + Reports API | Reporte de participantes de Zoom, misma planilla y misma regla de 5/6 (83,33 %) |
| Consola en vivo | Meet API | Dashboard API de Zoom (plan Business o superior); sin ella, los datos aparecen al cerrar la reunión |
| Recordatorios 24 h | Verifica cohosts en Meet | Usa los anfitriones alternativos aplicados |

Drive y Sheets siguen siendo el destino de los archivos: se escriben con la
cuenta de servicio de Google Workspace y la identidad administrativa
(`serviceAccountSubject`), porque el host de Zoom puede no ser un usuario de
Workspace.

## Crear la app en Zoom

1. Con una cuenta administradora de Zoom, entrar a
   [marketplace.zoom.us](https://marketplace.zoom.us) → *Develop* → *Build App*
   → **Server-to-Server OAuth**.
2. Copiar **Account ID**, **Client ID** y **Client Secret**.
3. En *Scopes*, agregar:
   - `meeting:write:meeting:admin`, `meeting:read:meeting:admin`,
     `meeting:update:meeting:admin`, `meeting:delete:meeting:admin`
   - `meeting:read:past_meeting:admin`, `meeting:read:list_past_instances:admin`
   - `user:read:list_users:admin`, `user:read:user:admin`
   - `report:read:list_meeting_participants:admin` (requiere plan Pro o superior)
   - `cloud_recording:read:list_recording_files:admin`
   - Opcional: `dashboard:read:list_meeting_participants:admin` para ver
     participantes en vivo (plan Business o superior).
4. Activar la app.

## Configurar Sala Virtual

1. **Configuración → Zoom**: pegar Account ID, Client ID y Client Secret y
   marcar "Permitir elegir Zoom al crear reuniones".
2. **Probar conexión e importar salas**: crea una sala por cada usuario con
   licencia de la cuenta Zoom. Las salas nuevas quedan inactivas.
3. Activar las salas que se van a usar y ajustar su prioridad.
4. Aplicar la migración `20261027120000_zoom_proveedor_operativo` antes de
   desplegar (`npx prisma migrate deploy`).

## Límites conocidos

- Cada encuentro de una serie es una reunión Zoom distinta (enlace propio).
- Los cohosts que no son usuarios de la cuenta Zoom no se pueden asignar por
  API; quedan marcados como pendientes en la consola y en los recordatorios.
- El "tipo de acceso" (OPEN/TRUSTED/RESTRICTED) es propio de Meet y no se
  ofrece para Zoom.
- Las grabaciones se descargan de la nube de Zoom y se suben a Drive; no se
  borran de Zoom (eso queda a la política de retención de la cuenta).
