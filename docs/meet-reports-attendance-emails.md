# Correos de asistencia vía Google Workspace Reports API

## Configuración (opt-in)

1. Habilitar **Admin SDK API** en el proyecto Google Cloud usado por Sala Virtual.
2. Agregar `https://www.googleapis.com/auth/admin.reports.audit.readonly` a la delegación de todo el dominio del Client ID de la cuenta de servicio **Principal** en Google Admin. Conservar los scopes existentes.
3. Delegar a una cuenta administradora que posea permiso para consultar los eventos de auditoría de Meet. No usar una cuenta sala como sujeto para la Reports API.
4. Agregar `GOOGLE_REPORTS_ADMIN_EMAIL=<admin autorizado de FLACSO>` al entorno privado del servicio. No incorporar la clave privada al entorno: la integración usa la credencial cifrada ya gestionada por Sala Virtual.
5. Reiniciar el proceso y verificar primero con una reunión de prueba finalizada y una persona externa con cuenta Google.

Sin esa variable, el comportamiento existente se mantiene intacto.

## Funcionamiento

Al generar el documento de asistencia, el backend consulta `call_ended` entre los primeros ingresos y los últimos egresos (con margen de dos horas para la publicación del egreso), filtra por `meeting_code` y admite **solo** `identifier_type=email_address`. Pagina la API y deduplica por conferencia/identificador. Los resultados se anexan en una tabla separada de la asistencia por sesiones.

No se infieren correos por nombre: Reports y Meet no garantizan los mismos identificadores. Los enlaces de una serie reutilizan código Meet, por lo que un código y rango horario por sí solos no garantizan identificar exactamente una instancia. No tratar esta tabla como correspondencia individual verificada.

Si falla Reports API, se registra el fallo y se conserva el informe existente. No debe tratarse un informe sin correos como evidencia de ausencia. Los documentos ya sincronizados **no se regeneran** con esta implementación; hace falta un mecanismo explícito de actualización/backfill.

## Pendiente antes de producción

- Probar permisos, edición de Workspace y eventos externos en un entorno autorizado.
- Confirmar ejecución de tests y tipos en CI.
- Añadir reconciliación por `conference_id`/instancia cuando Google permita identificarla de manera inequívoca.
- Definir backfill y política de actualización para auditoría publicada con retraso.
- Restringir acceso a estos datos personales a roles autorizados.
