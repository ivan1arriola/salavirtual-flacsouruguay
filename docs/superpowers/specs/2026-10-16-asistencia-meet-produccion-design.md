# Integración de asistencia de Meet para producción

## Contexto y resultado

El PR #113 incorporó planillas de Google Sheets con datos de asistencia y una paginación visual para `/grabaciones`. La revisión del estado fusionado encontró que la consulta de archivos sigue limitada a 300 registros, que el refresco de una lista puede producir otra hoja cuando cambian los datos y que faltan pruebas específicas del cliente de Sheets y de Reports API. La implementación debe completar estos flujos dentro de los módulos existentes y quedar en `main` después de verificaciones, sin desplegar.

El repositorio de trabajo se llama localmente `flacso-meet`; GitHub confirma que el `main` de `ivan1arriola/salavirtual-flacsouruguay` y la rama fusionada del PR #113 corresponden a los mismos SHA.

## Requisitos funcionales

### Datos y cálculo de asistencia

- Publicar una Google Sheet por instancia de encuentro, con las pestañas `Asistencia`, `Host y cohosts` y `Datos brutos`.
- La hoja `Asistencia` muestra participante, correo verificado, primera conexión y última desconexión en `America/Montevideo`, minutos conectados, porcentaje del horario programado, cumplimiento de 5/6 y número de conexiones.
- Calcular cada conexión como la intersección entre el intervalo observado y `[inicioProgramadoAt, finProgramadoAt]`. Unir intervalos solapados antes de sumar. El porcentaje es la suma efectiva dividida por la duración programada, acotado entre 0 y 100 %.
- Separar las cuentas de organizador y cohosts configurados de la lista de estudiantes. Solo tratar una cuenta como host/cohost con una dirección de correo configurada y validada para esa instancia.
- Conservar en `Datos brutos` los eventos de Meet y Reports usados para el informe, incluyendo sus identificadores de conferencia, endpoint, identificador/tipo, código Meet y marcas de tiempo originales disponibles. No inferir correo a partir de nombres.
- Normalizar códigos Meet para comparar variantes con y sin guiones, manteniendo los valores originales en la salida bruta.
- Aislar los eventos por instancia de conferencia. Un código Meet puede repetirse entre instancias; no se usarán márgenes temporales amplios que unan llamadas vecinas. Si las fuentes no permiten determinar una pertenencia sin ambigüedad, conservar el registro como no atribuido en bruto y no incorporarlo al resumen.
- Aplicar formato porcentual y escala de color rojo en 0 %, amarillo en 50 % y verde en 100 %.
- Colocar la planilla en la carpeta Drive de la instancia y ofrecer un enlace directo a Sheets.
- Regenerar una instancia actualizando o reconciliando su planilla existente; la repetición con los mismos datos y la regeneración con datos corregidos no deben dejar documentos duplicados.

### API y resiliencia

- Recuperar identidad únicamente cuando Reports API entregue `identifier_type=email_address`. Conservar eventos anónimos o con identificadores de teléfono/dispositivo en los datos brutos sin asociarlos a personas.
- Reutilizar la cuenta de servicio cifrada, la delegación de dominio y el administrador configurado. No introducir claves, tokens ni credenciales nuevas.
- Tratar `403` de permisos como fallo no reintentable con diagnóstico accionable; reintentar `429`, fallos `5xx` y timeouts de lecturas con espera acotada y `Retry-After` cuando exista.
- Las operaciones de escritura remota deben seguir el registro durable existente. Una respuesta incierta debe reconciliar por una marca determinista remota o dejar la operación en estado incierto, nunca repetir ciegamente la creación.
- Un fallo en Reports API no debe impedir crear o editar reuniones. La sincronización de asistencia debe poder reintentarse sin descartar los demás artefactos ni publicar como completa una planilla parcial.
- Respetar el alcance por rol ya usado por el módulo de archivos; los datos personales de asistencia solo se exponen a usuarios autorizados.

### Biblioteca `/grabaciones`

- Paginar encuentros desde la base de datos y no desde un lote inicial fijo de 300 archivos.
- Devolver 12 encuentros por página, manteniendo juntos todos los artefactos de un encuentro.
- Aplicar búsqueda, filtro por tipo, conteos y orden cronológico sobre el conjunto completo antes de calcular la página. Mantener alcance por rol en cada consulta.
- Conservar navegación anterior/siguiente, estados vacíos y apertura directa de Google Sheets; diferenciar visualmente grabaciones, transcripciones, notas y planillas de asistencia.

## Diseño técnico

### Módulo `archivos`

Mantener los puertos de aplicación como límites entre sincronización, adaptadores Google y repositorio Prisma. Extraer o aislar el cálculo puro de la hoja (consolidación, clasificación de roles, recorte horario y porcentaje) para probarlo sin red. El cliente de Reports API entregará registros tipados que conserven los campos originales usados; el adaptador de Google asociará cada registro con una instancia concreta usando una clave de conferencia verificable y los límites reales de esa conferencia. Un evento cuya clave no pueda reconciliarse no se atribuirá por nombre.

La operación de publicación consultará primero el archivo de asistencia registrado para el evento. Si existe, actualizará el contenido/formato del Spreadsheet en su ID actual. Si no existe, creará el documento mediante la operación durable actual, con una marca remota de reconciliación. La persistencia seguirá usando la clave única del artefacto por `eventoProveedorId` y recurso externo. Cualquier fallo de auditoría deja pendiente la parte de asistencia y no cambia el resultado de los flujos de creación de reuniones.

### Consultas de grabaciones

Ampliar el puerto de consulta con una entrada tipada que incluya página, tamaño, búsqueda y filtro de artefactos. El repositorio Prisma aplicará el alcance del actor, filtrará/ordenará encuentros y paginará por instancia, incluyendo todos los archivos de la página y devolviendo conteos necesarios. El componente cliente conservará búsqueda, filtros y controles, y solicitará páginas al servidor. La consulta no deberá dividir los archivos de un encuentro entre páginas ni descargar todo el catálogo.

### Configuración y privacidad

Actualizar `docs/configuracion-google-workspace.md` con APIs, scopes, tipo de administrador, delegación, permisos Drive y controles de validación. No registrar datos personales ni secretos en logs. La documentación diferenciará el comportamiento verificable en pruebas automatizadas de la validación real pendiente en el Workspace institucional.

## Pruebas y criterios de aceptación

- Unitarias del cálculo con reconexiones, solapamientos, conexiones fuera/parcialmente dentro de horario, horario inválido, cuenta host/cohost y códigos Meet con/sin guiones.
- Pruebas del adaptador Reports API con paginación, identificadores verificados/no verificados, conferencias distintas que reutilizan código, 403, 429, 5xx, timeout y campos originales.
- Pruebas del cliente Sheets para contenido, zonas horarias, formato, seguridad de celdas, actualización idempotente y recuperación de creación incierta.
- Pruebas de integración del repositorio para paginación por encuentros, búsqueda/filtros/orden globales, más de 300 archivos, conteos y aislamiento de roles.
- Regresiones que comprueben que fallo de Reports API no bloquea creación de reuniones y que la regeneración no duplica documentos.
- Ejecutar `npm run check`, `npm test` y `npm run build`. Comparar los resultados con la línea base de este worktree; resolver los fallos que pertenezcan a los flujos tocados y documentar cualquier fallo preexistente residual.
- No afirmar validación real de Workspace/Drive/Reports sin ejecutar una prueba de extremo a extremo autorizada con la configuración institucional existente. No leer ni imprimir archivos locales de secretos para suplir esa validación.

## Permisos Google Workspace que deben documentarse

- Sheets API habilitada en el proyecto Cloud de la cuenta de servicio.
- Admin SDK Reports API habilitada y scope de solo lectura `https://www.googleapis.com/auth/admin.reports.audit.readonly` delegado a la cuenta de servicio.
- Scope Sheets `https://www.googleapis.com/auth/spreadsheets` y los permisos Drive ya usados por el flujo para crear, mover y actualizar el archivo dentro de la carpeta de la reunión.
- `GOOGLE_REPORTS_ADMIN_EMAIL` debe ser un usuario administrador autorizado a consultar auditoría de Meet. El administrador se suplanta mediante la delegación existente.
- La cuenta de servicio organizadora debe poder acceder a la carpeta objetivo y escribir la planilla allí.
- Los registros de auditoría pueden no exponer una dirección para toda llamada; esos participantes permanecerán sin correo atribuido.

## Estado inicial observado

- El PR #113 está cerrado y fusionado en GitHub; su head es `cc6a6df` y el merge de `main` es `a140d1d`.
- `listarArchivosVisibles` limita la consulta a 300 archivos; la página filtra y pagina en memoria.
- La auditoría actualmente agrupa por código y correo y luego filtra llamadas por intervalo con tolerancia de un minuto, sin exigir coincidencia de `conference_id` con la instancia concreta.
- La huella de operación de Sheets incluye el contenido, por lo que un cambio de datos puede producir una operación/hoja nueva en vez de actualizar el artefacto existente.
- La primera ejecución completa de tests en una instalación limpia no generó Prisma Client porque npm omitió scripts; después de `npx prisma generate`, la línea base dio 24 tests fallidos, 1.433 aprobados y 12 omitidos en 158 archivos. Entre los fallos reproducidos hay fixtures incompletos para `cohostEmails` y detecciones del analizador de arquitectura funcional. La línea base se investigará antes de atribuir fallos a los cambios.

## Fuera de alcance y limitaciones

- No se crea ni rota ninguna credencial, no se modifica configuración institucional de Workspace, no se fusiona sin comprobaciones correctas y no se despliega.
- La visibilidad de correos depende de lo que Reports API exponga para cada participante y de la edición/configuración de Google Workspace.
- La prueba real de permisos, disponibilidad de auditoría y escritura/movimiento en Drive requiere el Workspace institucional; si no está disponible durante la verificación, quedará expresamente pendiente.
