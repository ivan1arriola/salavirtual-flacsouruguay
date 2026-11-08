# Conservación integral de archivos y asistencia de Zoom

Fecha: 2026-11-07. Estado: aprobado por el usuario en la conversación, incluyendo histórico sin vincular de las cuentas anfitrionas configuradas.

## Intención y decisiones del usuario

La app debe ofrecer grabaciones y asistencia de Zoom. Es prioritario sacar los archivos de Zoom y conservar **todos los disponibles**, incluidas las distintas variantes de grabación y los archivos auxiliares. Google Drive es el destino propuesto por el agente, coherente con la biblioteca existente; el usuario confirmó la necesidad de conservar archivos fuera de Zoom. No basta con guardar enlaces al original.

## Situación comprobada

El repositorio crea reuniones Zoom con grabación en la nube cuando se solicita. Tiene clientes de participantes históricos, participantes en vivo y resolución del UUID de cada ocurrencia. La ficha histórica consulta conexiones, pero no las persiste. La sincronización de archivos, sus consultas y las exportaciones aún filtran Google Meet. El diseño de asistencia de 2026-11-03 sigue parcialmente pendiente.

`ArchivoReunion` registra archivos conservados en Drive. `TipoArchivoReunion` ya admite `OTRO`. El registro de asistencia de Meet es `RegistroAsistenciaMeet` y no se modifica; la asistencia de Zoom usa tablas nuevas. Los modelos de solicitud, encuentro y evento de proveedor siguen separados.

## Enfoques considerados

1. Enlaces a Zoom: menor transferencia, pero no conserva los archivos fuera del proveedor. Descartado por el requisito del usuario.
2. Copiar un video principal: reduce volumen, pero pierde variantes, audios y auxiliares. Descartado por el requisito de conservar todo.
3. Inventario completo y copia por archivo a Drive: elegido para el diseño. Permite reintentos, trazabilidad y conservación independiente del original.

## Alcance funcional

### Inventario y copia íntegra

- Consultar los archivos de cada ocurrencia mediante UUID, nunca usando el ID numérico de una serie como sustituto de una ocurrencia desconocida. Los casos ambiguos quedan pendientes de revisión.
- Recorrer todos los archivos expuestos por los endpoints habilitados de Zoom, incluidas colecciones auxiliares documentadas en la respuesta. Conservar videos de todas las vistas, fragmentos, audios generales e individuales cuando se expongan, transcripciones, subtítulos, chat, encuestas, líneas de tiempo, miniaturas y resúmenes disponibles.
- El inventario no usa una lista cerrada de extensiones como filtro. Los tipos desconocidos se conservan como `OTRO`, manteniendo tipo original, variante y extensión. La clasificación de interfaz no decide qué descargar.
- Conservar los bytes originales sin convertir ni combinar archivos. Diferentes vistas y fragmentos son archivos distintos aunque tengan la misma extensión.
- Usar carpetas por encuentro y nombres legibles que incluyan variante y un identificador estable para evitar colisiones.
- Registrar cada elemento descubierto antes de transferirlo. Diferenciar descubierto, procesando en Zoom, pendiente de transferencia, copiando, conservado y error reintentable. Un archivo anunciado sin descarga disponible sigue visible como pendiente o no descargable, con su motivo.
- Preservar metadatos necesarios: UUID de ocurrencia, ID de archivo si existe, tipo y variante originales, extensión, inicio/fin y tamaño cuando Zoom los facilite, identidad de origen, destino Drive y fechas de observación/copia.
- Para elementos sin ID, derivar una identidad estable a partir de metadatos inmutables disponibles de la ocurrencia y recurso; excluir tokens y parámetros de autorización. Probar colisiones y cambios de orden. Una identidad ambigua requiere revisión, nunca sobrescritura silenciosa.
- Descargar con autorización en encabezados, transmitir a Drive sin cargar videos completos en memoria y usar subidas reanudables. Limitar concurrencia y tiempo por ejecución. Un trabajo pendiente persiste entre ejecuciones.
- Reservar el trabajo por archivo mediante un lease en base de datos, con vencimiento y protección frente a workers obsoletos. Reconciliar una subida cuyo resultado sea incierto mediante identidad de origen guardada en metadatos de Drive antes de crear otra copia.
- Comprobar la finalización en Drive y comparar tamaño cuando esté disponible antes de marcar conservado. No afirmar integridad criptográfica si el origen no ofrece un hash verificable.
- Renovar credenciales y volver a consultar el inventario para obtener enlaces vigentes al reintentar. No almacenar tokens ni URLs de descarga con autorización en logs, auditoría o respuestas al navegador.
- No borrar automáticamente los originales de Zoom. La conservación no incluye una política de eliminación del origen.

### Asistencia

- Persistir las sesiones históricas de la ocurrencia correcta y consolidar reconexiones mediante unión de intervalos; las conexiones simultáneas no duplican minutos. Calcular permanencia sobre la ventana programada.
- Preservar los nombres e identificadores proporcionados por Zoom. Un nombre coincidente no prueba identidad: no fusionar homónimos con identificadores distintos ni atribuir correos por nombre automáticamente.
- Permitir a docentes autorizados y administración vincular registros a invitados o marcarlos externos, con auditoría y conservación de correcciones en sincronizaciones posteriores.
- Guardar la asistencia de Zoom en una tabla nueva con estado de conciliación y vínculo opcional al invitado, sin tocar la tabla de Meet (migración aditiva). Las sugerencias entre encuentros nunca confirman automáticamente una identidad.
- No aplicar ningún umbral de asistencia en la integración Zoom. El 5/6 del código de Meet corresponde a una clase en particular, no a una regla general: la asistencia Zoom informa minutos y porcentaje sobre la ventana programada, sin veredicto de cumplimiento. Excluir hosts/cohosts del conteo solo cuando su rol esté comprobado; no inferir un rol que Zoom no facilite.
- Generar y actualizar una planilla en Drive desde los registros persistidos, con descargas y vista de asistencia. Conservar además las sesiones originales normalizadas para trazabilidad y exportación.
- La persistencia de asistencia no depende de que Drive esté disponible. Su planilla puede quedar pendiente sin perder registros.

### Automatización y presentación

- Ampliar el polling existente con un camino Zoom separado del adaptador de conferencias Meet y un adaptador de almacenamiento Drive reutilizable. Usar credenciales Zoom existentes para origen y Workspace existente para destino.
- Procesar asistencia y cada archivo con estados independientes: un video fallido no bloquea la asistencia ni otras copias.
- Mantener seguimiento de encuentros con archivos procesándose y volver a inventariar para encontrar archivos publicados después. No cerrar definitivamente un encuentro solo porque tenga un MP4 o por vencer la ventana de 48 horas de Meet.
- Ofrecer resincronización autorizada de encuentros pasados y un mecanismo paginado para recuperar encuentros vinculados a la app con archivos aún disponibles. No lanzar una recuperación masiva de producción durante el desarrollo. No atribuir automáticamente reuniones ajenas a un encuentro.
- Extender biblioteca, ficha y descargas para Zoom y para `OTRO`: cada archivo conservado debe tener una entrada accesible. Mostrar variante, formato y estado; conservar los permisos actuales por administración, docente y asistente asignado. Chats y otros archivos heredan esos permisos, sin publicación general automática.
- Webhooks quedan como aceleración posterior; la conservación inicial funciona mediante polling y reintentos, sin depender de configurar nuevas suscripciones.

## Arquitectura y persistencia

Separar puertos de inventario Zoom, asistencia, almacenamiento y repositorio. Las decisiones de agrupación, clasificación e identidad pertenecen al dominio; HTTP y Prisma a adaptadores. El bootstrap selecciona el camino por proveedor activo.

Agregar un inventario persistente por recurso de origen y ocurrencia, con unicidad, estado, intentos, próximo reintento, lease y vínculo al `ArchivoReunion` confirmado. La implementación definirá nombres y SQL exactos en el plan. Migraciones aditivas; no alterar destructivamente datos de Meet. Mantener `ArchivoReunion` para archivos que ya tienen copia Drive válida.

## Límites y decisiones de implementación propuestas

El alcance aprobado comprende los encuentros vinculados a Sala Virtual y las grabaciones históricas de las cuentas anfitrionas configuradas sin encuentro asociado. Se requiere inventario paginado por anfitrión y fecha, y una entidad de ocurrencia de origen que pueda conservar archivos sin `EventoProveedor` asociado. Los archivos sin encuentro se mantienen en una sección de archivo pendiente de vincular, inicialmente accesible solo a administración; no se atribuyen automáticamente a docentes o estudiantes. La asociación posterior conserva la identidad de origen y no vuelve a copiarlos.

El alcance técnico es todo archivo descargable que Zoom exponga con las credenciales y capacidades contratadas, dentro del conjunto de reuniones que confirme el usuario. Archivos locales que Zoom nunca recibió o archivos ya eliminados no son recuperables por esta integración. Los recursos detectados pero inaccesibles deben quedar contabilizados con motivo; nunca desaparecer del inventario silenciosamente.

La entrega incluye la herramienta de recuperación histórica. Su ejecución masiva en producción es una operación posterior al desarrollo y las verificaciones; escribir esta herramienta no significa que los archivos históricos ya estén conservados.

Se implementa en tres entregas desplegables por separado (A: inventario y copia con worker y barrido histórico con dry-run; B: biblioteca y vínculo; C: asistencia, conciliación y planilla), según las decisiones del usuario. No se incluyen controles remotos de grabación, rediseño general de reuniones ni eliminación de datos de Zoom.

## Decisiones del usuario (2026-11-08)

- **Cuenta de subida:** todos los archivos de Zoom se suben a Drive con el subject general ya configurado en Workspace (`serviceAccountSubject`), sin depender del correo del anfitrión ni crear cuentas o Drives nuevos. Esto vale también para el histórico sin sala local. Se verificará en una prueba de integración con un encuentro vinculado y una grabación histórica.
- **Visibilidad:** todos los que hoy pueden ver las grabaciones ven también todos los archivos de la grabación de Zoom (chat, audios y auxiliares incluidos). Se logra con permisos de carpeta: la carpeta destino de los encuentros vinculados hereda los permisos que hoy dan acceso a las grabaciones de Meet. Los históricos sin vincular van a una carpeta aparte accesible solo para administración y, al vincularse, se mueven a la carpeta del encuentro sin copiarse de nuevo. Se verificará el acceso real con un usuario autorizado y uno no autorizado.
- **Reaperturas:** un encuentro puede tener varias ocurrencias (UUID) de Zoom; cada ocurrencia pertenece a lo sumo a un encuentro. Los archivos se guardan por ocurrencia y la asistencia une los intervalos de todas las ocurrencias vinculadas. Hay acciones auditadas para vincular y desvincular.
- **Entrega:** se divide en tres despliegues independientes. A: inventario y copia con el worker (tareas 1–5, urgente por la retención de Zoom). B: biblioteca, recuperación histórica y vínculo (tareas 9–10). C: asistencia, conciliación y planillas (tareas 6–8). La tarea 11 acompaña a cada entrega según corresponda.
- **Acceso a la asistencia:** la vista y la exportación las sirve Sala Virtual tras validar sesión y alcance (docentes y asistentes pueden no tener cuenta Google); la planilla de Drive queda para administración.
- **Conciliación:** solo administración y el docente titular de la serie; el asistente técnico y los demás docentes del programa solo leen.
- **Tabla de asistencia:** tabla nueva para Zoom; `RegistroAsistenciaMeet` no se toca.
- **Resúmenes de AI Companion:** se conservan si la app tiene el scope; si no, quedan como capacidad pendiente visible.
- **Sin umbral de asistencia** en Zoom (el 5/6 de Meet es específico de una clase).

## Cupo de transferencia

El almacenamiento total de Drive no es una restricción (hay más de 1 TB disponible). Para no saturar la cuenta que sube, el worker aplica un tope configurable de **80 GB** en una ventana móvil de 24 horas, medida con marcas de tiempo exactas. Cada archivo **reserva su tamaño completo de forma atómica antes de empezar**; si no cabe, espera como pendiente visible hasta que se libere cupo. Así ninguna ventana móvil supera los 80 GB aunque haya varios workers. Se reservan **20 GB** del cupo para encuentros de los últimos 7 días, de modo que el histórico nunca los bloquea. La reserva se ajusta a los bytes realmente transferidos al terminar el intento, y reanudar desde un offset confirmado solo reserva lo que falta. Zoom limita cada archivo a 50 GB, así que ningún archivo queda excluido por tamaño. Una recuperación histórica grande se completa en varios días.

## Verificación y aceptación

- Inventarios con todas las variantes conocidas y tipos desconocidos; colecciones auxiliares, IDs ausentes, metadatos opcionales y orden variable.
- Serie recurrente con varias fechas: ningún archivo ni participante se atribuye a otra ocurrencia; la ambigüedad no produce escritura atribuida.
- Reintentos, 404 aún no disponible, 429 con espera indicada, fallos parciales, expiración de token, ejecución concurrente y caídas durante/finalizando subida: sin pérdida ni duplicados.
- Transferencias grandes sin acumulación completa en memoria y conservación de bytes; destino confirmado antes del estado conservado.
- Asistencia: reconexiones, solapamientos, homónimos, ausencia de correo, datos vacíos frente a reporte no disponible y preservación de conciliación manual.
- Permisos por rol en consulta, descarga, conciliación y resincronización; regresiones de Meet.
- Pruebas específicas y comprobaciones del repositorio: TypeScript, suite, validación de schema y build. Leer guías Next.js instaladas antes de modificar rutas o componentes dependientes del framework.

## Activación y reversión

Documentar scopes actuales de Zoom y permisos del destino Drive, validarlos con pruebas de integración autorizadas y activar primero sobre un encuentro controlado. Despliegue y recuperación masiva se coordinan después de las verificaciones. La reversión desactiva el worker Zoom y conserva inventario, archivos Drive y datos de asistencia; no requiere borrar datos ni revertir migraciones de forma destructiva.

## Referencia heredada y servidor dedicado

El usuario aportó `docs/old_appscript_code.gs` como referencia y aclaró que sus limitaciones de Apps Script no deben trasladarse al servidor dedicado. Se rescata la intención de recorrer anfitriones, respaldar cada archivo y usar descargas por rangos y subidas reanudables. No se heredan el horizonte de siete días, los triggers encadenados, el tamaño fijo de 50 MB, la falta de paginación ni la deduplicación basada solo en nombres.

Un worker Node separado del proceso web ejecutará las transferencias desde una cola persistente, sin sujetar la duración de un archivo al timeout HTTP de la app. Los límites de concurrencia y tamaño de bloque son operativos y configurables, no límites de aceptación o conservación de archivos. El código heredado contiene configuración sensible: no copiar sus valores ni incorporarlo a commits de esta entrega.

## Fuentes

- https://developers.zoom.us/docs/api/meetings/ (inventario, tipos, descarga autorizada y uso de UUID).
- Diseño local de asistencia: `2026-11-03-zoom-asistencia-design.md` (se actualizan sus reglas de identidad para no fusionar homónimos de forma insegura).
