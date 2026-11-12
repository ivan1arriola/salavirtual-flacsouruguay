# Conservación integral de archivos y asistencia Zoom — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Conservar en Google Drive todos los archivos descargables de Zoom de las cuentas anfitrionas configuradas, incluidos históricos sin encuentro asociado, y ofrecer asistencia persistente, conciliable y exportable en Sala Virtual.

**Architecture:** Inventario persistente por cuenta, UUID de ocurrencia y recurso; worker Node independiente del servidor web para transferencias reanudables. Zoom proporciona archivos y sesiones; Drive conserva originales y planillas; casos de uso y repositorios separados mantienen idempotencia, permisos y progreso. La integración Meet conserva su camino actual.

**Tech Stack:** Node.js 24, TypeScript, Next.js 16 App Router, Prisma 6/PostgreSQL, Zoom Server-to-Server OAuth, Google Drive/Sheets, Vitest, systemd/EC2.

**Spec:** `docs/superpowers/specs/2026-11-07-zoom-archivos-asistencia-design.md` (aprobado en la conversación).

## Global Constraints

- Conservar **todos los archivos descargables** y todas sus variantes; no filtrar por una lista cerrada de formatos ni elegir un único MP4.
- Copiar bytes originales: no convertir, recomprimir, combinar ni borrar automáticamente archivos de Zoom.
- Incluir histórico de anfitriones configurados aunque no exista encuentro local; su acceso inicial es exclusivo de administración.
- No atribuir recursos o asistencia de una serie por su ID numérico: identificar la ocurrencia por UUID; resolver ambigüedades sin inventar asociaciones.
- No cargar videos completos en memoria. Un archivo no está sujeto al timeout de una petición web ni al límite de ejecución de Apps Script.
- Inventario, transferencia y asistencia tienen progreso independiente. Drive caído no impide persistir asistencia.
- Reutilizar credenciales cifradas existentes. Nunca copiar valores del Apps Script ni persistir URLs de descarga autorizadas, tokens o secretos en logs/respuestas.
- No cambiar asignación de cuentas, seguridad de reuniones, horarios, Telegram ni notificaciones como parte de esta entrega.
- Migraciones aditivas versionadas; no ejecutar `db:push`, `migrate dev`, backfills ni escrituras contra producción durante desarrollo.
- Antes de modificar rutas/componentes, leer `AGENTS.md` y las guías relevantes instaladas en `node_modules/next/dist/docs/`.
- No modificar ni añadir al commit `docs/old_appscript_code.gs`. Usarlo solo como referencia de comportamiento.
- Crear rama/worktree aislado al iniciar implementación y conservar cambios ajenos. No hacer push a `main`: dispara despliegue.

## Review Focus

1. Zoom ignora `Range` y devuelve 200: nunca subir el cuerpo entero como si fuera un bloque desplazado (tarea 4).
2. Drive terminó una subida pero se perdió la respuesta o cayó el worker antes del commit local: reconciliar el mismo destino antes de crear otro (tareas 3–5).
3. Subtítulos/timeline sin ID, tamaño o estado, tipos nuevos y orden variable: inventariar sin descarte ni identidades basadas en índices (tareas 1–2).
4. Se reprograma un encuentro mientras se obtiene su reporte o hay homónimos: no atribuir sesiones a la fecha/persona equivocada (tareas 6–7).
5. Archivos aparecen semanas después, una cuenta sale del grupo o el histórico falla en una página: continuar seguimiento sin cerrar por el primer video ni perder el cursor (tareas 5 y 9).

## Entregas, orden y distribución

Un plan coordinado de 11 tareas agrupadas en bloques de revisión: inventario y persistencia (1–3), conservación con worker (4–5), asistencia (6–8), biblioteca e histórico/operación (9–11). Se despliega en **tres entregas independientes**: **A** inventario y copia con el worker (tareas 1–5, más el barrido por anfitrión y el comando de recuperación histórica con dry-run de la Task 9, y la activación necesaria de la Task 11; urgente por la retención de Zoom, y desplegable sin depender de B ni C); **B** biblioteca de todos los archivos y vínculo manual de ocurrencias (Task 10 sin la interfaz de conciliación, más la resolución y vínculo de la Task 9); **C** asistencia, conciliación (incluida su interfaz) y planillas (tareas 6–8), con el tramo de asistencia de la prueba integrada de la Task 11. Ninguna entrega importa código de una posterior. Cada entrega es revisable y desplegable sola; tras la tarea 5 se hace una prueba real con un encuentro controlado antes de continuar.

Se puede delegar a Claude el cliente Zoom y sus fixtures (2), y luego asistencia pura (6), después de fijar los contratos de 1 y 3. El implementador principal mantiene esquema, repositorios, worker, bootstrap e integración. Antigravity solo se utiliza si está disponible; no es dependencia del plan. Evitar agentes que editen los mismos archivos simultáneamente. Revisión independiente al cerrar cada entrega; no un agente nuevo por cada cambio pequeño para contener consumo de tokens.

## Contratos compartidos

Crear `src/modules/archivos/domain/zoom-archivos.types.ts` y exportarlo por los índices existentes:

```ts
type ReferenciaOcurrenciaZoom = Readonly<{
  cuentaZoomId: string;
  uuid: string;
  meetingId: string;
  anfitrionZoomId: string;
  inicioRealAt: Date;
  titulo: string;
}>;
type ArchivoOrigenZoom = Readonly<{
  claveOrigen: string;
  archivoZoomId: string | null;
  coleccion: string;
  tipoOriginal: string;
  variante: string | null;
  extension: string | null;
  inicioAt: Date | null;
  finAt: Date | null;
  tamanoBytes: bigint | null;
  estadoOrigen: string | null;
  descargable: boolean;
}>;
type EstadoArchivoZoom =
  | "DESCUBIERTO"
  | "PROCESANDO_ORIGEN"
  | "PENDIENTE"
  | "COPIANDO"
  | "CONSERVADO"
  | "ERROR_REINTENTABLE"
  | "REQUIERE_REVISION";
type ResultadoPagina<T> = Readonly<{ elementos: readonly T[]; siguiente: string | null }>;
type LeaseArchivoZoom = Readonly<{ archivoId: string; version: number; venceAt: Date }>;
```

`cuentaZoomId` identifica la cuenta de Zoom propietaria de las credenciales; no confundirla con el anfitrión (`CuentaProveedor`). El dominio recibe claves/hashes calculados mediante una función inyectada, sin importar HTTP, Prisma ni criptografía con efectos.

Las URLs autorizadas existen únicamente en el adaptador durante la transferencia. El inventario público no las contiene. `DescargaOrigenPort.abrir(archivoId, offset, signal)` devuelve stream, rango efectivo y tamaño descubierto; su implementación refresca el inventario y las credenciales en cada intento.

## Task 1: Identidad, clasificación e intervalos de inventario

**Files:** crear `src/modules/archivos/domain/zoom-archivos.types.ts`, `zoom-archivos.domain.ts`, `zoom-recuperacion.domain.ts`; modificar `domain/index.ts`; tests `test/zoom-archivos-domain.test.ts`, `test/zoom-recuperacion-domain.test.ts`.

**Interfaces:** producir `normalizarInventarioZoom(ocurrencia, respuesta, hash): ResultadoInventarioZoom`, `nombreArchivoZoom(ocurrencia, archivo): string`, `particionarPeriodoZoom(desde, hasta): readonly VentanaZoom[]`. `ResultadoInventarioZoom` contiene recursos válidos y observaciones no descartadas; `VentanaZoom` usa fechas inclusivas YYYY-MM-DD.

- [ ] Escribir tests fallidos: tipos desconocidos se conservan como `OTRO`; MP4 de galería y de pantalla son diferentes; todas las colecciones de archivos documentadas se recorren; metadatos opcionales no descartan recursos.
- [ ] Probar identidad: preferir ID dentro de cuenta/UUID; sin ID usar colección, tipo, variante, tiempos y extensión, **sin incluir `download_url` ni ninguna parte de su ruta** (el segmento opaco puede cambiar en cada consulta) **ni `recording_end`** (llega vacío mientras Zoom procesa); excluir además parámetros de autorización. Un elemento sin ID que aún está en procesamiento no crea un `ArchivoOrigenZoom` propio: se marca a nivel de la ocurrencia que hay procesamiento pendiente y se inventaría cuando pasa a `completed`. Prueba: el mismo archivo antes y después de completarse produce una sola fila. Cambios de orden/token no cambian identidad. Dos candidatos indistinguibles quedan `REQUIERE_REVISION` con multiplicidad observada, no se fusionan silenciosamente.
- [ ] Probar nombres con separadores de ruta y Unicode, ventanas de máximo 30 días inclusivos sin huecos, bisiestos y límites de año.
- [ ] Ejecutar `npx vitest run test/zoom-archivos-domain.test.ts test/zoom-recuperacion-domain.test.ts` → FAIL; implementar funciones puras → PASS.
- [ ] Commit acotado: `feat: definir inventario completo de archivos Zoom`.

## Task 2: Cliente Zoom completo, paginado y saneado

**Files:** crear `src/integrations/zoom/zoom-recordings.client.ts`, `zoom-download.client.ts`; modificar `zoom-reports.client.ts`, `zoom-instances.client.ts` solo para capacidades compartidas necesarias; tests `test/zoom-recordings-client.test.ts`, `test/zoom-download-client.test.ts`.

**Interfaces:** producir `listarGrabacionesAnfitrionZoomHttp(token, anfitrionId, ventana, cursor): Promise<ResultadoPagina<ReferenciaOcurrenciaZoom>>`, `obtenerInventarioOcurrenciaZoomHttp(token, uuid): Promise<InventarioZoomHttp | null>` y `abrirDescargaZoomHttp(token, url, offset, signal): Promise<DescargaZoomHttp>`. Los DTO HTTP completos son privados del adaptador; no se guardan como JSON indiscriminado.

- [ ] Añadir fixtures de respuesta reales saneados: `recording_files`, audios individuales y demás colecciones disponibles en la documentación actual. Probar dos páginas, cursor repetido, respuestas incompletas y límite de fechas rechazado sin marcar el barrido como completo.
- [ ] Probar UUID con `/`, ID numérico reutilizado, 404 distinto de inventario vacío, 401 con una renovación, 403 como capacidad pendiente y 429 respetando `Retry-After`. No introducir reintentos infinitos.
- [ ] Probar descarga: 206 valida `Content-Range` y cantidad real; 200 a offset > 0 se etiqueta `RANGE_IGNORADO`; tamaños desconocidos se miden por stream; HTML/error JSON no se acepta como archivo por un 200.
- [ ] Limitar redirecciones y validar HTTPS/origen de destino según hosts de descarga Zoom documentados/configurados. No reenviar Authorization indiscriminadamente a un host redirigido. Errores públicos contienen código y recurso interno, nunca URL firmada/cuerpo crudo.
- [ ] Ejecutar tests nuevos → FAIL; implementar con `fetch`, AbortSignal y token existente → PASS junto a tests Zoom actuales.
- [ ] Descarga con redirección: pedir `download_url` con `redirect: "manual"` y `Authorization` solo hacia hosts Zoom configurados; si responde 302, enviar el `GET` con `Range` al `Location` firmado **sin `Authorization`**, sin persistirlo ni registrarlo. Configurar los hosts de CDN regionales de Zoom, no solo `*.zoom.us`. Limitar los bytes descartables por intento cuando Zoom devuelve 200 con offset > 0: si el prefijo a descartar supera `ZOOM_ARCHIVOS_MAX_DESCARTE_GB`, marcar `REQUIERE_REVISION` en lugar de repetir descargas.
- [ ] Token: añadir invalidación/renovación forzada del token rechazado en `zoom-client.ts`, segura ante solicitudes concurrentes y sin bucle (un solo reintento). La prueba de 401 usa el caché real y demuestra que el segundo intento usa un token distinto.
- [ ] Resúmenes de AI Companion: no viajan en el listado de grabaciones sino en `GET /meetings/{meetingId}/meeting_summary` (scope propio). Decidido: se intenta conservarlos como archivo; si la app Server-to-Server no tiene el scope, queda como capacidad pendiente visible y nunca como inventario vacío.
- [ ] Participantes: incluir `status` (`in_meeting` / `in_waiting_room`) en el contrato HTTP y en el DTO; no descartarlo al normalizar. Consultar grabaciones activas y `trash=true` en recuperaciones; las ventanas de fecha se expanden ±1 día UTC y se filtran después por `inicioRealAt` en America/Montevideo.
- [ ] Commit: `feat: consultar y descargar todos los recursos Zoom`.

## Task 3: Inventario persistente, leases y repositorio

**Files:** modificar `prisma/schema.prisma`; crear migración `prisma/migrations/20261108000000_zoom_archivos_asistencia/migration.sql` (ajustar orden si ya existe); crear `src/modules/archivos/ports/zoom-archivo-repository.port.ts`, `infrastructure/prisma/prisma-zoom-archivo-repository.adapter.ts`; tests `test/zoom-archivo-repository.test.ts`, `test/zoom-archivo-schema.test.ts`.

**Datos exactos propuestos:**

| Modelo                     | Campos y restricciones principales                                                                                                                                                                                                                                                                                                                                     |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OcurrenciaArchivoZoom`    | id; cuentaZoomId; uuid; meetingId; anfitrionZoomId; cuentaProveedorId opcional; eventoProveedorId opcional (índice no único: varias ocurrencias por encuentro; cada ocurrencia pertenece a un solo encuentro); inicioRealAt; titulo; driveFolderId; inventariadoAt; proximoInventarioAt; estado/error de asistencia; timestamps. Unique(cuentaZoomId, uuid).           |
| `ArchivoOrigenZoom`        | id; ocurrenciaId; claveOrigen; archivoZoomId opcional; colección/tipo/variante/extensión; tiempos y tamaño opcionales; estado; error saneado; intentos; proximoIntentoAt; leaseVersion; leaseHasta; driveFileId único opcional; archivoReunionId único opcional; uploadSessionCifrada; bytesConfirmados; nombreDestino; timestamps. Unique(ocurrenciaId, claveOrigen). |
| `BarridoArchivoZoom`       | id; cuentaZoomId; anfitrionesSnapshot JSON validado; desde/hasta; anfitrionIndice; ventanaDesde/hasta; nextPageToken cifrado opcional; estado; contadores; leaseVersion/leaseHasta; solicitanteId; timestamps.                                                                                                                                                         |
| `ReservaTransferenciaZoom` | id; archivoOrigenId; bytesReservados (BigInt); prioridad (`RECIENTE` o `HISTORICO`); reservadoAt (marca exacta); ajustadoBytes opcional; liberadoAt opcional. Índice por reservadoAt. Sirve al tope de ventana móvil de 24 h de la Task 5.                                                                                                                             |

Índices por estado/proximoIntentoAt/leaseHasta y proximoInventarioAt. FK opcionales con `SET NULL`; impedir borrados en cascada de archivos de origen por borrar/desvincular un encuentro. Metadatos suficientes para reconstruir el archivo sin dependencia del título actual.

**Interfaces:** `ZoomArchivoRepositoryPort` produce `guardarInventario(ocurrencia, recursos)`, `reclamarArchivo(ahora, duracionMs): Promise<LeaseArchivoZoom | null>`, `guardarProgreso(lease, progreso): Promise<boolean>`, `confirmarConservado(lease, destino): Promise<boolean>`, `registrarFallo(lease, fallo): Promise<boolean>`, `vincularOcurrencia(ocurrenciaId, eventoId, actor): Promise<ResultadoVinculo>`. Todas las mutaciones de worker comparan versión vigente.

- [ ] Tests fallidos de upsert sin resetear conservados, dos claims simultáneos, lease vencido y rechazo de worker obsoleto; dos ocurrencias vinculables al mismo encuentro, una ocurrencia nunca en dos encuentros, desvínculo auditado y mismo Drive ID sin segunda copia.
- [ ] Probar conservación local atómica: estado y `ArchivoReunion` en una transacción cuando hay encuentro; sin encuentro basta el inventario con Drive confirmado. Vincular después crea referencias locales con `externalResourceName = zoom/{cuentaHash}/{uuidHash}/{claveOrigen}`, sin transferir de nuevo.
- [ ] Añadir schema y SQL aditivo revisado; generar Prisma con `npm run db:generate`; no conectar a la base real para migrar. Probar SQL en PostgreSQL desechable explícitamente configurado como test.
- [ ] Ejecutar tests de repositorio/schema y `npm run validate:schema` → PASS; revisar FK y defaults con datos Meet existentes.
- [ ] Commit: `feat: persistir inventario y trabajos reanudables Zoom`.

## Task 4: Almacenamiento Drive reanudable con memoria acotada

**Files:** crear `src/modules/archivos/ports/archivo-storage.port.ts`, `infrastructure/google/google-drive-archivo-storage.adapter.ts`, `src/integrations/google/drive/drive-resumable.client.ts`; extender exports Google; tests `test/drive-resumable-client.test.ts`, `test/zoom-transferencia-stream.test.ts`.

**Interfaces:** `ArchivoStoragePort` expone `asegurarCarpeta(clave, nombre)`, `iniciarSubida(destino, origenKey)`, `consultarSubida(sesion)`, `subirBloque(sesion, offset, bytes, total)`, `buscarConservado(origenKey)`, `verificarArchivo(id)`. Sesión de subida privada, cifrada con `cifrarConfiguracion` antes de persistir. `DestinoConservado` contiene id, nombre, tamaño confirmado, mime y webViewUrl.

- [ ] Tests fallidos de 308 con/sin Range, confirmación 200/201, finalización incierta, sesión vencida, destino vacío válido y tamaño esperado ausente o distinto. Una respuesta 308 de subida es progreso, nunca finalización.
- [ ] Usar ID Drive pregenerado persistido antes del POST para binarios y `appProperties.flacsoZoomOrigen` con hash estable; reconciliar por ID antes de recrear una sesión. Si aparecen múltiples recursos marcados, requerir revisión. Carpetas también llevan identidad de ocurrencia, no solo nombre.
- [ ] Buffer inicial configurable de 8 MiB, múltiplo de 256 KiB; último bloque puede ser menor. Backpressure; no `arrayBuffer()`/`Buffer.concat()` del archivo completo. Acumular tamaño/hash incremental para comprobar contra Drive cuando sea posible.
- [ ] Si Zoom ignora Range, abrir stream desde cero y descartar prefijo ya confirmado de forma acotada; nunca desplazar bytes incorrectos. Si cambia ETag/metadatos de origen, detener y revisar versión antes de continuar. Permitir transferencia de tamaño desconocido con cierre detectado al fin del stream.
- [ ] Probar reinicio en offset arbitrario confirmado por Drive, último ACK perdido y archivo mayor que la memoria de test mediante generador de stream, sin crear un fixture gigante.
- [ ] Ejecutar tests de storage/stream → FAIL, implementar → PASS. Confirmar que no se aplican permisos públicos por enlace del adaptador de planillas Meet a los binarios ni al archivo sin vincular.
- [ ] Identidad y destino: subir siempre con el `serviceAccountSubject` general de la configuración Workspace existente (sin depender de `emailOrganizador` ni de `anfitrionZoomId`), con `supportsAllDrives=true` en todas las llamadas. La carpeta de los encuentros vinculados hereda los permisos de las grabaciones de Meet; los históricos sin vincular van a una carpeta aparte solo de administración y, al vincular, se mueven con `files.update` (`addParents`/`removeParents`), sin copiar. Prueba de integración autorizada: creación, consulta y reanudación bajo esa identidad para un encuentro vinculado y para una grabación histórica sin sala local, y acceso real de un usuario autorizado y uno no autorizado. El healthcheck del worker exige `serviceAccountSubject` definido (es opcional en el esquema) y comprueba permiso de escritura sobre `driveDestinationId`; sin eso no arranca y lo informa. La carpeta de cuarentena del histórico sin vincular se crea **fuera** de la raíz legible por docentes (en un Drive compartido los permisos heredados no se pueden quitar de una subcarpeta). La transferencia de bloques no usa el `GoogleCuentaLease` corto de 120 s de Meet: tiene su propio control de concurrencia, y las operaciones de metadatos (carpetas, `files.get`) sí pueden usar el lease con reintento ante `GoogleCuentaOcupadaError`.
- [ ] Concurrencia con Drive: el `AbortSignal` de la transferencia aborta toda E/S local a `leaseHasta - margen` (por defecto 60 s) si el heartbeat no renovó el lease, para que ningún socket rezagado de un worker anterior escriba sobre la misma sesión cuando otro la reclame. Reconciliar siempre primero con `files.get(driveFileId)` y solo después con `files.list`. Serializar `asegurarCarpeta` por ocurrencia con bloqueo en base de datos y organizar carpetas por `YYYY/MM`.
- [ ] Final de stream: leer 1 byte por adelantado antes de emitir cada `PUT` para saber si el bloque es el último; manejar archivos de 0 bytes y tamaños múltiplos de 256 KiB. Comparar contra el tamaño real leído del stream; `file_size` de Zoom es solo referencia diagnóstica y una diferencia no rechaza una subida íntegra respecto al stream.
- [ ] Commit: `feat: copiar archivos Zoom a Drive con subidas reanudables`.

## Task 5: Orquestación y worker dedicado

**Files:** crear `src/modules/archivos/application/inventariar-zoom.use-case.ts`, `transferir-archivo-zoom.use-case.ts`, `procesar-cola-zoom.use-case.ts`; crear `src/bootstrap/zoom-archivos.server.ts`, `scripts/zoom-archivos-worker.ts`, `infra/ec2/salavirtual-zoom-archivos.service`; modificar `package.json`; tests `test/zoom-archivo-worker.test.ts`, `test/zoom-inventario-use-case.test.ts`.

**Interfaces:** `inventariarZoomUseCase(repo, origen, input): Promise<ResumenInventario>`; `transferirArchivoZoomUseCase(repo, origen, storage, lease, signal): Promise<ResultadoTransferencia>`; `procesarColaZoomUseCase(deps, { signal, concurrencia }): Promise<void>`. Inyectar reloj y estrategia de espera para tests. Añadir `npm run zoom:archivos:worker` y modo `--once`.

- [ ] Tests fallidos: caída después de upload/before DB, SIGTERM durante bloque, token renovado, Drive caído y dos workers; ningún trabajo reclamado se pierde ni un worker obsoleto confirma resultados.
- [ ] Worker systemd separado de Next, `Restart=on-failure`, usuario de servicio existente, entorno compartido y apagado ordenado. Concurrencia inicial 2 archivos, heartbeat 30 s, lease 5 min renovable, espera HTTP sin progreso 60 s; sin límite de duración total por archivo. Configurar memoria según EC2 al activar, sin descartar archivos por tamaño.
- [ ] Tope de transferencia: `ZOOM_ARCHIVOS_TOPE_GB` (80 por defecto) y `ZOOM_ARCHIVOS_RESERVA_RECIENTE_GB` (20 por defecto) sobre una **ventana móvil de 24 horas** con marcas de tiempo exactas, en `ReservaTransferenciaZoom` (Task 3). Antes de empezar un archivo se **reserva su tamaño completo en una sola transacción serializable** (suma de reservas con `reservadoAt` en las últimas 24 h, más la nueva, ≤ tope; los `HISTORICO` solo pueden usar tope menos la reserva reciente). Si no cabe, el archivo queda `PENDIENTE` con motivo `TOPE_DIARIO`, sin consumir intentos, y se registra la hora estimada de liberación. Con tamaño desconocido se reserva 50 GB. Al terminar o fallar un intento, la reserva se ajusta a los bytes realmente transferidos; reanudar desde un offset confirmado por Drive solo reserva lo que falta, y un reinicio desde cero tras caducar la sesión reserva de nuevo. Zoom limita cada archivo a 50 GB, así que ningún archivo se descarta por tamaño. El inventario y la asistencia no cuentan ni se detienen. Test: dos workers con 30 GB usados y dos archivos de 50 GB (solo uno cabe bajo el tope de 80 GB), ninguna ventana móvil supera 80 GB en un barrido simulado, el histórico no consume los 20 GB reservados, liberación al salir una reserva de la ventana, retransmisión tras sesión caducada, reserva de un archivo con tamaño desconocido y reserva ajustada tras un fallo.
- [ ] Relevo y rollback del worker: `deploy.sh`, `deploy-ec2.sh` y ambos rollbacks detienen/drenan `salavirtual-zoom-archivos.service` antes de `npm run build` y lo reinician tras cambiar `current` (y tras revertirlo), de modo que nunca corra código de un release rechazado. Unidad systemd con `TimeoutStopSec=90` (mayor que la espera HTTP de 60 s), `MemoryMax` y `CPUQuota` configurados, y concurrencia inicial 1 archivo (subible por configuración). Pruebas: SIGTERM, muerte forzada con recuperación de leases y verificación de que ningún worker del release rechazado sigue activo.
- [ ] Reinventario con corte: dejar de reinventariar una ocurrencia con más de `ZOOM_ARCHIVOS_CORTE_DIAS` (90 por defecto) cuando todos sus archivos están en estado terminal; reactivable manualmente.
- [ ] Backoff persistente con jitter: 1 min, 5 min, 15 min, 1 h y máximo 6 h entre reintentos; 429 respeta una espera mayor indicada por proveedor. Tras 10 fallos consecutivos marcar revisión visible, sin borrar el recurso; reintento manual autorizado reinicia elegibilidad.
- [ ] Reinventariar ocurrencias de menos de 48 h cada 10 min, hasta 30 días cada hora y anteriores diariamente. Una capacidad ausente no se convierte en inventario vacío exitoso. Archivos eliminados en origen no eliminan copias conservadas.
- [ ] Snapshot de anfitriones incluye salas configuradas activas e inactivas con integración Zoom: salir del grupo no borra inventario ni trabajos. El listado de miembros del grupo no es el único acceso al histórico ya conocido.
- [ ] Tests de fairness: inventario reciente, histórico y archivos con reintento reciben turnos; archivos pendientes no bloquean asistencia.
- [ ] Ejecutar tests worker/inventario → FAIL, implementar → PASS. Commit: `feat: ejecutar conservación Zoom en worker dedicado`.

## Task 6: Asistencia pura y persistencia de sesiones

**Files:** crear `src/modules/archivos/domain/asistencia-zoom.domain.ts`, `ports/asistencia-zoom.port.ts`, `infrastructure/zoom/zoom-asistencia-provider.adapter.ts`, `infrastructure/prisma/prisma-asistencia-zoom-repository.adapter.ts`; agregar migración aditiva de asistencia si no entró en tarea 3; tests `test/asistencia-zoom-domain.test.ts`, `test/asistencia-zoom-repository.test.ts`.

**Datos:** `RegistroAsistenciaMeet` **no se modifica** (rollback seguro y sin bloqueos de DDL sobre una tabla viva). Crear una tabla nueva `RegistroAsistenciaZoom` (ocurrenciaId o eventoProveedorId, nombre y correo observados, minutos y porcentaje consolidados, `estadoConciliacion`, `invitadoReunionId` opcional FK SET NULL, esExterno, versión para control de edición concurrente) y `SesionAsistenciaZoom` con ocurrenciaId, claveSesion estable única por ocurrencia, participanteId/userId opcionales, nombre/email originales, entrada/salida y rol observado opcional; no almacenar respuesta cruda con secretos.

**Interfaces:** `consolidarAsistenciaZoom(sesiones, { inicioAt, finAt }): readonly AsistenciaZoomConsolidada[]`; `AsistenciaZoomRepositoryPort.guardarSesionesYResumen(ocurrenciaId, eventoVersion, sesiones, resumen): Promise<ResultadoPersistenciaAsistencia>`.

- [ ] Tests: unión de [10:00–10:40,10:20–11:00] = 60 minutos; reconexiones sumadas sin solapamiento; intervalos recortados al horario; precisión decimal y porcentaje máximo 100; fechas inválidas no producen NaN.
- [ ] Dos nombres iguales con IDs distintos permanecen separados; sin identificador fiable conservar sesiones diferenciadas y sin conciliación automática. Correo proporcionado por Zoom se guarda como observado, no como identidad institucional confirmada.
- [ ] Sin umbral ni veredicto de cumplimiento en Zoom (el 5/6 de Meet es específico de una clase, no general). Probar que el resumen expone solo minutos y porcentaje sobre la ventana, y que hosts/cohosts con rol comprobado quedan excluidos del conteo de estudiantes; una sugerencia de vínculo nunca cuenta como identidad confirmada.
- [ ] Guardar sesiones idempotentemente sin borrar registros por 404 o lote parcial; conciliar y notas MANUAL sobreviven. Comparar evento/horario/UUID en escritura para detectar reprogramación concurrente. Meet queda intacto: ninguna consulta ni escritura de `RegistroAsistenciaMeet` cambia.
- [ ] Sala de espera: persistir `status` en `SesionAsistenciaZoom`, conservar `in_waiting_room` solo como traza y **excluirla del cálculo** de minutos y porcentaje. Pruebas: espera sin admisión (0 minutos), espera seguida de entrada y reconexiones. `user_id` nunca identifica a una persona (cambia con cada reconexión); sin `id` fiable las sesiones se conservan diferenciadas y se unen solo cuando se concilian al mismo invitado.
- [ ] Varias ocurrencias: la consolidación une los intervalos de todas las ocurrencias vinculadas al encuentro, recortados a su horario programado.
- [ ] Ejecutar tests de dominio y repositorio → FAIL; implementar → PASS y generar Prisma. Commit: `feat: persistir y consolidar asistencia de Zoom`.

## Task 7: Sincronización y conciliación autorizada

**Files:** crear `application/sincronizar-asistencia-zoom.use-case.ts`, `conciliar-asistencia-zoom.use-case.ts`, `src/bootstrap/zoom-asistencia.server.ts`; crear `app/api/v1/reuniones/instancias/[instanciaId]/asistencia/conciliar/route.ts` y `src/components/zoom-asistencia-conciliacion.tsx`; modificar `src/bootstrap/ui/reuniones/reunion-operativa-page.server.tsx`; tests `test/sincronizar-asistencia-zoom.test.ts`, `test/conciliar-asistencia-zoom-route.test.ts`, `test/zoom-asistencia-ui.test.ts`.

**Interfaces:** `sincronizarAsistenciaZoomUseCase(deps, ocurrenciaId): Promise<ResultadoAsistenciaZoom>`; `conciliarAsistenciaZoomUseCase(deps, actor, { registroId, invitadoReunionId, externo, version }): Promise<ResultadoConciliacionZoom>`. Respuestas discriminan OK, PENDIENTE, PROHIBIDO, CONFLICTO y ERROR; controladores mapean a 200/202, 403, 409 y error saneado.

- [ ] Probar reporte ausente vs vacío vs parcial; resolver UUID con clientes existentes; guardar primero en DB sin requerir Workspace. Separar estado de reporte y estado de planilla.
- [ ] Probar permisos: concilian solo administración y el docente titular de la serie (no cualquier docente del programa); el asistente técnico asignado y los demás docentes del programa solo leen; invitado de otro encuentro rechazado; control de versiones evita pisar edición simultánea. Auditoría con actor y cambio de vínculo, sin URLs/tokens.
- [ ] Recordar vínculos previos dentro de la misma serie como SUGERIDO solo cuando hay evidencia suficiente; nunca fusionar homónimos por coincidencia de nombre. Marca externa y quitar vínculo son operaciones explícitas.
- [ ] Cambiar ficha para leer registros persistidos y estado de sincronización; renderizar una página no ejecuta backfill ni escritura de asistencia.
- [ ] Prueba de regresión de la vía antigua de edición: `guardarRegistroAsistenciaOperativo` (`reunion-operativa.service.ts`) y la ruta `control-operativo` escriben solo en `RegistroAsistenciaMeet`. Probar que un asistente asignado no puede modificar correo, rol ni `esHostOCohost` de la asistencia de un encuentro Zoom desde `control-operativo` (la fila Zoom no es alcanzable por esa ruta) y que cualquier camino nuevo de edición de Zoom exige la autorización, versión y auditoría de la conciliación. Como la asistencia de Zoom vive en su propia tabla, la ficha y la exportación leen de la tabla según el proveedor activo del encuentro, y un rollback de código no puede mezclar filas de Zoom en las consultas de Meet.
- [ ] Resolución de ocurrencias: reemplazar el uso de `resolverUuidInstanciaZoomHttp` (devuelve `null` con más de una candidata) por una resolución que devuelva todas las ocurrencias candidatas del encuentro, con acciones auditadas de vincular y desvincular, y prueba de dos ejecuciones legítimas dentro de una misma clase.
- [ ] Ejecutar tests → FAIL, implementar → PASS. Commit: `feat: sincronizar y conciliar asistencia Zoom`.

## Task 8: Planilla, exportación y regeneración

**Files:** crear `application/generar-planilla-asistencia-zoom.use-case.ts`, `infrastructure/google/google-zoom-asistencia-sheets.adapter.ts`; modificar `src/bootstrap/archivos.server.ts`, rutas `asistencia/regenerar/route.ts`, `asistencia/exportar/[fuente]/route.ts` y página `app/(gestion)/reuniones/[solicitudId]/encuentros/[instanciaId]/asistencia/page.tsx`; tests `test/zoom-asistencia-planilla.test.ts`, `test/zoom-asistencia-export-route.test.ts`.

**Interfaces:** `generarPlanillaAsistenciaZoomUseCase(deps, ocurrenciaId): Promise<ResultadoPlanillaZoom>`. Fuente nueva `zoom` para exportación, manteniendo `meet` y `reports`; separar sesiones originales de resumen consolidado.

- [ ] Planilla con nombre, correo observado/confirmado diferenciados, entradas/salidas, minutos, porcentaje, conexiones, conciliación y rol comprobado. Sin registro final se muestra pendiente; no generar una lista vacía como prueba de cero asistentes.
- [ ] Probar actualización del mismo spreadsheet tras conciliar, errores Drive sin pérdida de asistencia, reintento independiente y escape de fórmulas CSV/Sheets de nombres/chat externos.
- [ ] Reutilizar cliente Sheets de bajo nivel, sin invocar lectura Meet ni su política de publicación por enlace. La planilla nueva se crea directamente dentro de la carpeta destino (no en la raíz para moverla después), con `supportsAllDrives=true` e `includeItemsFromAllDrives=true` en búsqueda, creación y movimiento; el cliente actual los omite y el `catch` oculta el error. Lectura y exportación de asistencia Zoom usan el `serviceAccountSubject` general, no el `emailOrganizador` del anfitrión. Acceso a la asistencia: como Zoom admite docentes y asistentes sin cuenta Google, **la exportación y la vista las sirve Sala Virtual tras validar la sesión y el alcance**; la planilla de Drive queda para administración. Se prueba con un usuario sin Workspace. Nunca `type: "anyone"` ni permisos de Drive por correo para docentes.
- [ ] Verificar sesión y alcance tanto en lectura como en regeneración y exportación; fuentes/IDs inválidos no filtran datos.
- [ ] Ejecutar tests nuevos y `test/attendance-raw-export-route.test.ts`, `test/regenerar-asistencia-route.test.ts` → PASS. Commit: `feat: ofrecer planillas y exportación de asistencia Zoom`.

## Task 9: Recuperación histórica y asociación posterior

**Files:** crear `application/recuperar-historico-zoom.use-case.ts`, `vincular-archivo-zoom.use-case.ts`, `src/bootstrap/zoom-historico.server.ts`, `scripts/recuperar-archivos-zoom.ts`; crear rutas `app/api/v1/archivos/zoom/recuperaciones/route.ts`, `[barridoId]/route.ts`, `ocurrencias/[ocurrenciaId]/vincular/route.ts`; tests `test/zoom-historico.test.ts`, `test/zoom-historico-routes.test.ts`.

**Interfaces:** `crearRecuperacionZoom(deps, actor, { anfitrionIds, desde, hasta, dryRun }): Promise<ResumenRecuperacion>`; `procesarPaginaRecuperacionZoom(deps, barridoId): Promise<ProgresoBarrido>`; `vincularOcurrenciaZoom(deps, actor, ocurrenciaId, eventoId): Promise<ResultadoVinculo>`.

- [ ] Periodo histórico explícito: no heredar siete días ni limitar a fechas de reuniones locales. UI solicita rango completo a recuperar; informe muestra límites reales del periodo y cualquier restricción que Zoom aplique. No prometer haber revisado fechas fuera del barrido.
- [ ] Guardar cursor después de persistir la página, no antes; repetir página tras caída es idempotente. Si expira cursor, reiniciar ventana con upserts. Paginación completa de cada anfitrión y ventanas de tarea 1.
- [ ] Tests: más de una página, más de un anfitrión, cuenta inactiva, error en segunda página y reinicio; una página vacía no detiene las ventanas siguientes. Sin encuentro se conserva en carpeta identificada por UUID para administración.
- [ ] Asociar automáticamente solo coincidencia inequívoca de UUID ya validado. El resto queda pendiente de vínculo. Asociación manual admite eventos `ZOOM` y `ZOOM_HISTORICO`, exige versión vigente y no reutiliza una ocurrencia ya vinculada a otro encuentro; permite varias ocurrencias por encuentro y una acción auditada de desvínculo. Al vincular, la carpeta de Drive de la ocurrencia se mueve de la cuarentena al contenedor de grabaciones vinculadas (mismo `fileId`, sin copiar) y hereda sus permisos; al desvincular vuelve a la cuarentena. No borrar originales de Zoom como efecto lateral.
- [ ] Script inicia con dry-run sin escrituras ni transferencias, admite `--desde`, `--hasta`, `--anfitrion` y `--apply` para encolar. Producción requiere revisión del dry-run antes de `--apply`. Añadir scripts npm `zoom:archivos:historico:dry` y `zoom:archivos:historico`.
- [ ] Ejecutar tests históricos/rutas → FAIL, implementar → PASS. Commit: `feat: recuperar histórico Zoom y vincular archivos conservados`.

## Task 10: Biblioteca completa y estado operativo

**Files:** modificar `src/modules/archivos/infrastructure/prisma/prisma-archivos-repository.adapter.ts`, `domain/grabaciones-filtro.domain.ts`, `domain/meet-artifacts.domain.ts`, `application/consultar-grabaciones.use-case.ts`, `src/components/recordings-library.tsx`, `src/bootstrap/ui/reuniones/reunion-zoom-historica.tsx`, `app/(gestion)/grabaciones/page.tsx`; crear `src/components/zoom-archivo-progreso.tsx`, `zoom-historico-control.tsx`; tests `test/zoom-archivos-library.test.ts`, `test/zoom-archivos-access.test.ts`. (La interfaz de conciliación `zoom-asistencia-conciliacion.tsx` y `test/zoom-asistencia-ui.test.ts` pertenecen a la Task 7, entrega C.)

**Interfaces:** extender modelos de consulta con proveedor, tipo/variante original, formato, estado, bytes y URL Drive opcional. Consulta del archivo sin vínculo va por inventario y exige administración; no forzar un `EventoProveedor` ficticio para poder mostrarlo.

- [ ] Tests: todas las variantes y `OTRO` aparecen en Todos; filtros incluyen categorías de audio/chat/otros sin perder compatibilidad con parámetros existentes. Enlaces solo para archivos conservados, progreso para pendientes y error por archivo; un video disponible no presenta el conjunto como completamente respaldado.
- [ ] Mostrar contadores de descubiertos/conservados/pendientes/revisión y fecha de último inventario; no mostrar suma total de bytes si parte de tamaños se desconoce sin aclararlo.
- [ ] Controles de recuperación histórica, vínculo y reintento autorizados; datos sin vínculo solo administración. Verificar alcance en servidor, no únicamente ocultando botones. No interpolar contenido de chat como HTML.
- [ ] Biblioteca completa: hoy `agruparArtefactosEnGrabaciones` solo expone el video principal y la planilla, la tarjeta muestra el sello fijo «Google Meet» y el filtro de sala solo admite `sala01..sala10`. Extender `RecordingItem` para listar todos los archivos de la ocurrencia (vistas MP4, audios, chat, subtítulos, línea de tiempo), mostrar el proveedor real y aceptar cuentas anfitrionas de Zoom en el filtro. Ocultar a no administradores el enlace «Carpeta general en Drive» (apuntaría a una raíz con histórico). Alinear la lectura: `ASISTENTE_TECNICO` asignado ve los archivos (como hoy en Meet); la conciliación se limita a administración y al docente responsable del encuentro, no a todo docente del programa.
- [ ] Añadir estados vacíos/carga/error, etiquetas accesibles y vista móvil. Conservar UI existente y evitar dependencias nuevas. Ejecutar revisión `react-best-practices` al terminar cambios TSX.
- [ ] Ejecutar tests nuevos, accesibilidad de biblioteca y alcance de grabaciones → PASS. Commit: `feat: mostrar archivos y asistencia Zoom en la biblioteca`.

## Task 11: Integración, operación y entrega

**Files:** modificar `src/bootstrap/archivos.server.ts` y ruta `app/api/v1/reuniones/sincronizar-archivos/route.ts` para encolar/disparar inventario Zoom sin transferir videos en HTTP; mantener resultado Meet compatible; crear `docs/zoom-archivos-asistencia.md`; ajustar despliegue solo para instalar worker y activar configuración de forma controlada; tests `test/zoom-archivos-integration.test.ts`, `test/zoom-archivos-route.test.ts`.

- [ ] Endpoint HTTP conserva autenticación sesión/CRON_SECRET. Para Zoom devuelve encolados/progreso; no esperar descarga. Error Zoom no evita procesar Meet ni viceversa. Estado del worker muestra heartbeat, cola, antigüedad del pendiente más viejo y fallos por capacidad.
- [ ] Documentar scopes vigentes: listado de grabaciones por anfitrión (incluida la papelera), archivos por ocurrencia, resúmenes (`meeting_summary`) y participantes históricos; validar los nombres contra documentación oficial al implementar. Consultar configuración existente sin imprimir secretos. Verificar permisos en Shared Drive/destino institucional y acceso de usuarios de app.
- [ ] Añadir configuración `ZOOM_ARCHIVOS_ENABLED=false` por defecto, concurrencia/bloque/intervalos; credenciales siguen en mecanismo existente. El instalador de servicio debe incluir artefactos compilados del worker en cada release: compilar un entrypoint Node dedicado, comprobar que no necesita `tsx` de dev en producción, alias TS ni importar `server-only` desde CLI. Compartir un composition root independiente del framework y un wrapper `.server.ts` para Next.
- [ ] Prueba integrada con servidores Zoom/Drive falsos y PostgreSQL de test: inventario → copia y caída/reanudación → DB → biblioteca; además reporte → persistencia → conciliación → planilla/exportación. Cubrir histórico sin vínculo y vínculo posterior sin nueva transferencia.
- [ ] Ejecutar `npm run check`, `npm test`, la cobertura por módulo que exige el workflow de CI (`archivos` incluido), `npm run validate:schema`, `npx prisma validate`, `npm run build`, `git diff --check`. Exigir salida satisfactoria; cualquier fallo previo se documenta y se distingue del cambio. Probar arranque del worker compilado en `--once` con dependencias falsas/entorno de test.
- [ ] Revisar rama completa: migraciones, permisos, manejo de URLs/tokens, stream grande, aislamiento de Meet y ausencia del Apps Script original o secretos en el diff. Revisión independiente antes de integrar.
- [ ] Commit final de documentación/integración. No hacer push/merge a main ni desplegar por guardar el trabajo.

## Activación controlada en EC2

1. Preparar release verificado con worker inicialmente deshabilitado y migraciones aditivas revisadas; preservar rollback y respaldos habituales de DB.
2. Desplegar por flujo del repositorio cuando corresponda; comprobar servicio web, healthcheck y versión de schema. Instalar unidad del worker usando usuario de servicio, EnvironmentFile y rutas de release correctas.
3. Revisar capacidad disponible y permisos con una ocurrencia controlada que tenga varios archivos, al menos un auxiliar. Activar worker y comprobar bytes/tamaños, enlaces Drive y ausencia de copias duplicadas al reejecutar.
4. Probar asistencia real del mismo encuentro, reconexiones, conciliación y exportación; comprobar que docentes/asistentes sin alcance no acceden y el histórico sin vínculo solo lo ve administración.
5. Habilitar inventario incremental de todos los anfitriones configurados. Ejecutar dry-run histórico del periodo seleccionado, revisar cantidad estimada/fechas/cuentas y luego encolar recuperación. La conservación está completada únicamente cuando el inventario de ese periodo está cubierto y cada archivo descargable tiene destino confirmado; pendientes/revisión permanecen visibles.
6. Registrar métricas de uso de memoria, bytes transferidos en la ventana de 24 h frente al tope de 80 GB y latencias; ajustar concurrencia/bloques al servidor sin descartar tipos ni tamaños de archivo.

## Rollback

Deshabilitar worker (`ZOOM_ARCHIVOS_ENABLED=false` y detener su unidad), mantener archivos e inventario, volver al release previo si la web falla. No borrar carpetas Drive, sesiones originales ni tablas nuevas; el release anterior debe tolerar la migración aditiva. Al reactivar, recuperar leases vencidos y consultar progreso real de Drive antes de subir. El rollback no elimina originales Zoom ni copia confirmada.

## Criterios finales de aceptación

- Todos los recursos descargables descubiertos tienen copia válida fuera de Zoom, o un estado pendiente/revisión con motivo verificable; ningún tipo es descartado silenciosamente.
- Variantes, audios y auxiliares se conservan por separado y son accesibles desde la biblioteca con permisos correctos.
- Reinicios y fallos parciales no producen duplicados ni marcan copias incompletas como conservadas.
- Histórico sin encuentro puede copiarse y vincularse después sin descargar de nuevo.
- Asistencia persiste aunque falle Drive, no mezcla fechas/personas y conserva correcciones manuales.
- Meet pasa sus regresiones; schema, tipos, suite y build pasan; worker funciona desde el release de producción sin depender del proceso Next.
- La documentación distingue implementación, despliegue y recuperación histórica realmente ejecutada.

## Referencias y revisión del plan

- API Zoom: https://developers.zoom.us/docs/api/meetings/
- Subidas Drive: https://developers.google.com/workspace/drive/api/guides/manage-uploads
- Referencia local: `docs/old_appscript_code.gs`, funciones de respaldo/rangos en líneas 16–242 y listado de grabaciones en 2545–2555. No trasladar credenciales, triggers, ventana fija de siete días, tamaño fijo de 50 MB ni deduplicación por nombre.
- Autorrevisión: requisitos del diseño cubiertos por tareas 1–11; los cinco modos de fallo de Review Focus tienen pruebas asignadas. Las interfaces compartidas y estados se definen antes de delegar implementación. Este documento no afirma que ya existan copias ni que se hayan ejecutado pruebas funcionales.
