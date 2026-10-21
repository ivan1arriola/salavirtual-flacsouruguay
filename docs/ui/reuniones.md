# Ficha de reuniones

La ficha organiza el ciclo de vida de una reunión en cinco pestañas y muestra un panel por vez. Se puede recorrer con las flechas izquierda y derecha, Inicio y Fin; el panel elegido se refleja en el fragmento de la URL para conservar los enlaces internos.

- **General:** información académica, modalidad, estado y resumen de la serie.
- **Encuentros:** agenda, acceso a Meet y operaciones de cada fecha. Las operaciones conservan el alcance de encuentro o serie que ya tenían.
- **Personas:** gestión existente de cohosts, configuración de serie y notificaciones relacionadas.
- **Archivos:** enlaces disponibles a grabaciones, listas de asistencia de participantes y carpetas de Drive, agrupados por encuentro.
- **Actividad:** incidencias actuales de integración de Meet.

La pestaña **Encuentros** ofrece ahora un acceso directo **Asistencia** en cada fila, sin abrir el acordeón. La vista `/reuniones/[solicitudId]/encuentros/[instanciaId]/asistencia` respeta el alcance de administración y docentes habilitados para el programa. Consulta en modo lectura la planilla asociada a ese encuentro. El listado **primario** y los minutos se derivan de las sesiones de **Meet API**. Los correos y tiempos de **Reports API** se muestran como evidencia complementaria; solo existe vinculación individual cuando Meet ya expone un correo verificado que coincide de manera única con Reports dentro de una única conferencia de auditoría. Nunca se deducen identidades por nombre u horario.\n\nEl indicador de **conciliación** muestra personas únicas Meet, correos únicos Reports, sesiones Meet, eventos de Reports, vinculaciones verificadas, registros sin correo, diferencias de recuento y eventos sin solapamiento temporal. Esos recuentos son independientes: no se suman. La existencia de múltiples conferencias de Reports se señala como ambigua y bloquea asociaciones individuales. Las filas de planillas antiguas sin registros Meet quedan en un apartado histórico, sin atribución a Meet. La regeneración se realiza por el endpoint preexistente y sigue reservada a Administración; no modifica una reunión futura ni se presenta un resultado vacío como inasistencia.

Archivos incluye la herramienta administrativa para consultar correos de asistencia de participantes. Actividad presenta el estado disponible. La aplicación aún no cuenta con un historial completo de auditoría para todas las modificaciones; esta sección no lo simula ni agrega persistencia.

La ficha reutiliza los datos que ya consulta el servidor. No introduce rutas, contratos API, campos, permisos ni reglas de horarios nuevos. Las listas de asistencia de participantes se mantienen separadas del monitoreo.
