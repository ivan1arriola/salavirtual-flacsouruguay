# Acceso de FLACSO a las planillas de asistencia

Las planillas generadas por Sala Virtual contienen nombres, correos, tiempos de conexión y registros de auditoría. Por decisión institucional, cada Google Sheets nuevo debe permitir **lectura** a las cuentas autenticadas del dominio `flacso.edu.uy`.

Se publica una autorización **sobre el archivo individual** de Google Drive:
- `type: domain`, `domain: flacso.edu.uy`, `role: reader`.
- `allowFileDiscovery: false` para no indexar los datos personales en las búsquedas de todo el dominio. Las personas deberán recibir el enlace.
- Nunca se crean permisos `anyone`, ni se modifica el acceso a carpetas, grabaciones, transcripciones o archivos ajenos.
- La autorización no habilita edición institucional. Los permisos directos preexistentes de otros usuarios se conservan.

La operación utiliza el scope `https://www.googleapis.com/auth/drive` ya delegado para crear las planillas. Tras solicitar el permiso se vuelve a consultar la lista de permisos de Drive. Un fallo o un permiso no confirmado impide reportar una publicación correcta.

El mismo control se ejecuta en creaciones, regeneraciones, documentos preexistentes recuperados por marcador y operaciones ya confirmadas en el sistema. No se hace un barrido masivo automático de planillas antiguas: para una planilla anterior, regenerarla desde Sala Virtual aplica el nuevo control, siempre que se tenga autorización administrativa.

**Verificación operacional:** generar una planilla de prueba, abrir su enlace con una cuenta distinta de `@flacso.edu.uy` (solo lectura) y con una cuenta externa no invitada (sin acceso); verificar que el archivo no aparece en la búsqueda de Drive de otra cuenta FLACSO y que el resto de archivos de la carpeta conserva sus permisos. Si el administrador de Google Workspace restringe compartir con dominios, la publicación debe informar el error en lugar de ocultarlo.
