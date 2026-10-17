# Acceso por enlace a las planillas de asistencia

Las planillas de asistencia de Sala Virtual contienen nombres, correos y registros detallados de conexión.

## Política de acceso

Por decisión institucional, las planillas de Google Sheets generadas por Sala Virtual se comparten como **Cualquier persona con el enlace → Lector**. El destinatario **no necesita** cuenta de FLACSO ni iniciar sesión.

La autorización se otorga exclusivamente al archivo individual mediante Google Drive API:

```json
{"type":"anyone","role":"reader","allowFileDiscovery":false}
```

- No se publica el archivo en búsquedas; una persona necesita obtener su enlace.
- No se conceden permisos de edición por enlace. Si ya existía un permiso `anyone` con edición, se ajusta a lectura.
- No se alteran permisos sobre carpetas, grabaciones, transcripciones ni otros archivos.
- Los permisos preexistentes de usuarios y grupos distintos de `anyone` se mantienen sin cambios.
- Se verifica la autorización real después de guardar. Si Workspace prohíbe compartir públicamente, la sincronización informa el error y no declara éxito.
- El control se ejecuta para planillas nuevas, regeneradas, existentes localizadas y recuperadas tras operaciones inciertas. Las planillas históricas no son modificadas de forma masiva.

## Riesgo y verificación

**Cualquier persona con el enlace, también fuera de la institución, podrá consultar datos personales de asistencia**. Evitar publicar los enlaces en medios públicos.

Probar con una cuenta de FLACSO distinta de la organizadora y también con un navegador privado sin iniciar sesión: ambos deben poder abrir el enlace sin editar. Confirmar que una búsqueda pública no lo indexe por el permiso de Drive, y que otros archivos en su carpeta conservan sus ACL.
