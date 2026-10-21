# Ficha de reuniones

La ficha organiza el ciclo de vida de una reunión en cinco pestañas y muestra un panel por vez. Se puede recorrer con las flechas izquierda y derecha, Inicio y Fin; el panel elegido se refleja en el fragmento de la URL para conservar los enlaces internos.

- **General:** información académica, modalidad, estado y resumen de la serie.
- **Encuentros:** agenda, acceso a Meet y operaciones de cada fecha. Las operaciones conservan el alcance de encuentro o serie que ya tenían.
- **Personas:** gestión existente de cohosts, configuración de serie y notificaciones relacionadas.
- **Archivos:** enlaces disponibles a grabaciones, listas de asistencia de participantes y carpetas de Drive, agrupados por encuentro.
- **Actividad:** incidencias actuales de integración de Meet.

La pestaña **Encuentros** ofrece ahora un acceso directo **Asistencia** en cada fila, sin abrir el acordeón. La vista `/reuniones/[solicitudId]/encuentros/[instanciaId]/asistencia` respeta el alcance de administración y docentes habilitados para el programa. Consulta en modo lectura la planilla asociada a ese encuentro con las fuentes Meet y Reports, muestra responsables por separado y mantiene los registros crudos Meet sin asociarlos automáticamente a los correos de auditoría. La regeneración se realiza por el endpoint preexistente y sigue reservada a Administración; no modifica una reunión futura ni se presenta un resultado vacío como inasistencia.

Archivos incluye la herramienta administrativa para consultar correos de asistencia de participantes. Actividad presenta el estado disponible. La aplicación aún no cuenta con un historial completo de auditoría para todas las modificaciones; esta sección no lo simula ni agrega persistencia.

La ficha reutiliza los datos que ya consulta el servidor. No introduce rutas, contratos API, campos, permisos ni reglas de horarios nuevos. Las listas de asistencia de participantes se mantienen separadas del monitoreo.
