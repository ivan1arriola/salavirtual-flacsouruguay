# Ficha de reuniones

La ficha presenta las cinco secciones a la vez. En escritorio utiliza un **mosaico**: General ocupa todo el ancho; Encuentros es la columna principal, mientras Personas, Archivos y Actividad forman una columna auxiliar independiente. En pantallas intermedias y en móviles se apilan en el mismo orden de lectura, sin pestañas que oculten información y sin un carrusel horizontal. La adaptación a columnas depende del **ancho real del contenedor**, no solo de la resolución del dispositivo. En móviles hay un pequeño índice «Ir a una sección», plegado por defecto; los fragmentos `#general`, `#encuentros`, `#personas`, `#archivos` y `#actividad` siguen funcionando directamente, incluso al entrar desde la pantalla de asistencia. El contenido de cada sección se monta una sola vez, conservando formularios y sus estados mientras se consulta otra sección. Dentro de Personas, los apartados Cohosts, Notificaciones y Configuración pasan de pestañas a desplegables accesibles.

- **General:** información académica, modalidad, estado y resumen de la serie.
- **Encuentros:** agenda, acceso a Meet y operaciones de cada fecha. Las operaciones conservan el alcance de encuentro o serie que ya tenían.
- **Personas:** gestión existente de cohosts, configuración de serie y notificaciones relacionadas.
- **Archivos:** enlaces disponibles a grabaciones, listas de asistencia de participantes y carpetas de Drive, agrupados por encuentro.
- **Actividad:** incidencias actuales de integración de Meet.

La sección **Encuentros** ofrece ahora un acceso directo **Asistencia** en cada fila, sin abrir el acordeón. La vista `/reuniones/[solicitudId]/encuentros/[instanciaId]/asistencia` respeta el alcance de administración y docentes habilitados para el programa. Consulta en modo lectura la planilla asociada a ese encuentro. El listado **primario** y los minutos se derivan de las sesiones de **Meet API**. Los correos y tiempos de **Reports API** se muestran como evidencia complementaria; solo existe vinculación individual cuando Meet ya expone un correo verificado que coincide de manera única con Reports dentro de una única conferencia de auditoría. Nunca se deducen identidades por nombre u horario.

El indicador de **conciliación** muestra personas únicas Meet, correos únicos Reports, sesiones Meet, eventos de Reports, vinculaciones verificadas, registros sin correo, diferencias de recuento y eventos sin solapamiento temporal. Esos recuentos son independientes: no se suman. La existencia de múltiples conferencias de Reports se señala como ambigua y bloquea asociaciones individuales. Las filas de planillas antiguas sin registros Meet quedan en un apartado histórico, sin atribución a Meet. La regeneración se realiza por el endpoint preexistente y sigue reservada a Administración; no modifica una reunión futura ni se presenta un resultado vacío como inasistencia.

## Descargar registros brutos por encuentro

En la pantalla de asistencia de cada instancia con planilla Google Sheets sincronizada figuran cuatro acciones: **Meet CSV**, **Meet JSON**, **Reports CSV** y **Reports JSON**. Los dos botones principales son CSV compatible con Excel; JSON es una alternativa para conservar tipos y los parámetros brutos de auditoría almacenados.

- Se exportan **todas las filas** de la pestaña `Datos brutos` correspondientes a la fuente, sin deduplicar ni combinar identidades. Reports abarca las filas `REPORTS` y `REPORTS_IDENTIDAD`; esta última indica una fila derivada de la identidad reportada y puede repetir una llamada que aparece como `REPORTS`.
- Las 14 columnas disponibles preservan identificación, tipo de registro, horas UTC originales, duración, conferencia, endpoint, código Meet y parámetros de auditoría en el caso de Reports. El JSON incluye metadatos del encuentro y mantiene valores numéricos.
- **Alcance:** los archivos contienen íntegramente los datos brutos **almacenados en la última sincronización**, no una extracción actualizada de absolutamente todos los eventos/campos que las APIs Google podrían exponer. Los Reports actualmente capturados por el sistema proceden de `call_ended`; para otros tipos de evento haría falta ampliar la ingesta.
- Seguridad: acceso con sesión activa y permiso para el programa, instancia y archivo ligados en el servidor, respuestas `no-store`; errores sin revelar datos personales. CSV mitiga interpretación de fórmulas al abrir Excel.
- Si una fuente carece de registros sincronizados se comunica explícitamente: no implica que no haya participantes. Para actualizar la captura, Administración puede usar el botón existente de regeneración.

Archivos incluye la herramienta administrativa para consultar correos de asistencia de participantes. Actividad presenta el estado disponible. La aplicación aún no cuenta con un historial completo de auditoría para todas las modificaciones; esta sección no lo simula ni agrega persistencia.

La ficha reutiliza los datos que ya consulta el servidor. No introduce rutas, contratos API, campos, permisos ni reglas de horarios nuevos. Las listas de asistencia de participantes se mantienen separadas del monitoreo.
