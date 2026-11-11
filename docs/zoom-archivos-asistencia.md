# Archivos y asistencia de Zoom: operación

Resumen operativo de la conservación de archivos de Zoom en Drive y de la asistencia de Zoom. El diseño y las
decisiones están en `docs/superpowers/plans/2026-11-07-zoom-archivos-asistencia.md`.

## Qué hace

- **Inventario:** un worker descubre las grabaciones de cada anfitrión de Zoom (activo o no) y registra cada archivo
  descargable de cada ocurrencia (identificada por su UUID, no por el ID numérico de la reunión).
- **Conservación:** copia cada archivo a Drive con subida reanudable, con un tope de bytes por ventana de 24 h. Un
  archivo solo pasa a `CONSERVADO` cuando Drive confirma el tamaño completo.
- **Asistencia:** lee el reporte de participantes de cada ocurrencia, lo guarda en base de datos y calcula minutos
  y porcentaje sobre el horario programado. No hay umbral ni veredicto de cumplimiento.

## Permisos de la app de Zoom (Server-to-Server OAuth)

Sin los scopes necesarios Zoom responde **HTTP 400 con código 4711**, no 403. El barrido lo informa como
`SOLICITUD_RECHAZADA:400:z4711`.

| Función | Scope | Estado |
|---|---|---|
| Listar grabaciones de un anfitrión | `cloud_recording:read:list_user_recordings:admin` | Verificado en producción |
| Listar archivos de una ocurrencia | `cloud_recording:read:list_recording_files:admin` | Verificado en producción |
| Participantes históricos (asistencia) | scope de reportes de reuniones | **Sin verificar**: confirmar el nombre contra la documentación de Zoom |
| Resúmenes de reunión | scope de resúmenes (`meeting_summary`) | **Sin verificar** |

Un `404` con código Zoom `1001` en un anfitrión indica que ese usuario ya no existe en la cuenta. No impide el
barrido de los demás, pero se cuenta como error del anfitrión.

## Configuración

Las variables se leen con prefijo `ZOOM_ARCHIVOS_`. Un valor inválido impide arrancar el worker.

| Variable | Defecto | Significado |
|---|---|---|
| `TOPE_GB` | 80 | Bytes máximos transferidos en una ventana móvil de 24 h |
| `RESERVA_RECIENTE_GB` | 20 | Parte del tope reservada para grabaciones recientes (no puede superar el tope) |
| `BLOQUE_MIB` | 8 | Tamaño de bloque de subida (múltiplo de 256 KiB) |
| `CONCURRENCIA` | 1 | Archivos en paralelo (con más de 1 puede haber carpetas duplicadas por ocurrencia) |
| `CORTE_DIAS` | 90 | Edad desde la cual una ocurrencia deja de reinventariarse |
| `LEASE_MS`, `MARGEN_LEASE_MS`, `HEARTBEAT_MS` | 300000, 60000, 30000 | Reclamo de trabajos |
| `DRIVE_HISTORICO_ID` | vacío | Carpeta de administración para archivos sin encuentro vinculado |

Las credenciales de Zoom y Google siguen en el mecanismo de configuración existente; nada de esto se imprime.

## Operación

El worker es un bundle Node (`zoom-archivos-worker.cjs`) dentro de cada release, ejecutado por la unidad
systemd `salavirtual-zoom-archivos`. **La unidad no se habilita sola**: `deploy.sh` solo la reinicia si un
administrador la habilitó. Para una ejecución puntual: `zoom-archivos-worker.cjs --once` (un ciclo de
mantenimiento y vaciado de la cola; los archivos que el barrido descubre durante ese ciclo se procesan en la
ejecución siguiente).

Estados de un archivo: `PENDIENTE` (incluye `TOPE_DIARIO`, que no consume intentos), `ERROR_REINTENTABLE`,
`REQUIERE_REVISION` y `CONSERVADO`. Un archivo `CONSERVADO` nunca se reinicia por reinventario.

## Prueba real del 2026-11-09

Con tope de 2 GB y una carpeta de Drive de prueba:

1. Sin scopes: 23 anfitriones con `400:z4711`.
2. Con scopes: 2 ocurrencias y 35 archivos (4,3 GB); 14 anfitriones con `404:z1001`.
3. Primera transferencia: los 35 fallaron porque la librería de Google devuelve los encabezados como `Headers` y el
   cliente esperaba un objeto plano (no se encontraba `Location`). Corregido en el cliente de subida reanudable.
4. Segunda transferencia: 20 archivos conservados (2.048 MiB, justo el tope), 15 en `TOPE_DIARIO`, 20 identificadores
   de Drive distintos (sin duplicados).

## Activación controlada

1. Release verificado con el worker deshabilitado y migraciones aditivas revisadas.
2. Confirmar scopes de Zoom y permisos de escritura en la carpeta destino de Drive.
3. Ejecutar `--once` con tope bajo y revisar en Drive que los archivos se abren y no hay duplicados.
4. Habilitar la unidad systemd con el tope definitivo y vigilar memoria y bytes por ventana.
5. Antes de recuperar histórico: dry-run, revisar cantidad y fechas, y solo entonces encolar.

## Biblioteca de grabaciones

Los encuentros Zoom vinculados aparecen en `/grabaciones` junto a los de Meet, con su proveedor real:

- Cada tarjeta lista **todos** los archivos del inventario de la ocurrencia (video, audios, chat,
  transcripciones, resumen y otros). Solo los conservados enlazan a Drive; los demás muestran su
  estado (pendiente, copiando, error con código).
- Si el encuentro tiene asistencia Zoom persistida, la tarjeta enlaza a la ficha de asistencia.
- Los filtros existentes cuentan también a Zoom: «Solo grabaciones» exige un MP4, «Solo asistencias»
  acepta registros de asistencia Zoom y «Notas y transcripciones» incluye transcripciones y resúmenes.
- El alcance no cambia: administración ve todo, docentes sus programas y asistentes sus asignaciones.
  El inventario sin encuentro vinculado sigue siendo solo de administración (panel aparte).

## Recuperación histórica

Periodo explícito (no hereda los últimos días) y solo anfitriones configurados.

1. Simular: `npm run zoom:archivos:historico:dry -- --desde 2026-01-01 --hasta 2026-10-31 [--anfitrion <id>]`.
   Solo lee de Zoom: no escribe en la base ni transfiere. Informa ocurrencias, primera y última fecha halladas
   y errores por anfitrión. Zoom puede conservar menos que el periodo pedido.
2. Revisar cantidad y fechas; recién entonces `npm run zoom:archivos:historico -- --desde ... --hasta ...` (encola).
3. El worker continúa el barrido página a página (cursor guardado después de persistir la página). Un anfitrión
   inexistente (`404:z1001`) se omite; scope faltante (`z4711`) deja el barrido en `REQUIERE_REVISION`.
4. Progreso: `GET /api/v1/archivos/zoom/recuperaciones/{id}` (solo administración). Alta: `POST
   /api/v1/archivos/zoom/recuperaciones` (simula salvo `dryRun:false`).
5. Vínculo manual de una ocurrencia con un encuentro Zoom: `POST /api/v1/archivos/zoom/ocurrencias/{id}/vincular`
   con `{ "eventoId" }`; reutiliza el archivo ya conservado, sin nueva transferencia.

Comportamiento de la recuperación histórica y del worker:

- **Papelera de Zoom:** cada ventana recorre primero las activas y luego la papelera (cursor propio, la fuente se
  persiste en la posición del barrido). El barrido reciente también consulta la papelera. El dry-run informa por
  separado lo hallado en ella. Si Zoom no ofrece el inventario de una grabación eliminada (404), queda registrada
  como omisión `PAPELERA_INVENTARIO_NO_ENCONTRADO:n` y el barrido termina en `REQUIERE_REVISION`, sin bloquear el resto.
- **Anfitrión omitido** (`404:z1001`): queda registrado y el barrido termina en `REQUIERE_REVISION`, nunca como completo.
- **Inventario 404 de una ocurrencia activa:** no avanza el cursor; se reintenta con límite y luego exige revisión.
- **Vínculo manual:** la respuesta informa que el worker moverá la carpeta. Cada ciclo, el worker lleva la carpeta de
  cada ocurrencia ya vinculada a la raíz de grabaciones vinculadas (`AAAA/MM`), **conservando los IDs de Drive**
  (se mueve la carpeta, no se copian archivos); es idempotente y sin raíz configurada no mueve nada.
- **Vínculo automático:** solo si UN único encuentro Zoom coincide con el UUID exacto de la ocurrencia; todo lo demás
  queda pendiente de vínculo manual. Hoy ningún flujo completa `EventoProveedor.zoomMeetingUuid`, así que en la
  práctica no se vincula nada solo hasta que se complete ese dato.
- **Asistencia pendiente:** el worker sincroniza la asistencia de las ocurrencias que aún no la tienen (la primera
  vez hasta 30 días atrás y ya terminadas; los reintentos de `NO_DISPONIBLE`/`ERROR`, solo 3 días, cada 15 minutos).
- **Rol HOST:** la sesión cuyo `userId` coincide con el anfitrión de la ocurrencia se guarda como HOST. Los
  co-anfitriones no se infieren (quedan sin rol).
- El estado global de Zoom del endpoint de sincronización solo se devuelve a administración (y al cron con secreto).
- **Desvincular no devuelve la carpeta** a la raíz histórica: los archivos conservan el acceso del último encuentro.

Verificación pendiente en entorno real (no se puede probar sin credenciales): scopes de participantes históricos y
resúmenes, asistencia contra Zoom y Google reales, y que Zoom ofrezca (o no) el inventario de grabaciones en papelera.

## Rollback

Deshabilitar y detener la unidad. Se conservan inventario, archivos y tablas. No se borra nada en Drive ni en Zoom.
Al reactivar, el worker recupera los reclamos vencidos y consulta el progreso real de Drive antes de subir.

## Pendiente de verificar

- Scopes de participantes históricos y de resúmenes.
- Asistencia contra Zoom y Google reales (sincronización, conciliación, planilla de Drive).
- Rol host/cohost comprobado (hoy cuentan como estudiantes en el resumen).
- Disparador automático de la sincronización de asistencia.
