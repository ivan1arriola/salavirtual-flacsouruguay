# Notificaciones de Sala Virtual — diagnóstico de entrega

## Comportamiento actual

- Una preferencia `push: true` almacena avisos en la bandeja interna de Sala Virtual (`Notificacion`). **No genera notificaciones push del sistema operativo** en Android, Windows ni macOS. El service worker (`public/sw.js`) solo contiene caché y soporte offline: no tiene `push` ni suscripciones de navegador. La API móvil tampoco registra tokens FCM ni distribuye push nativas.
- La preferencia `email: true` habilita el envío por el primer proveedor disponible: **Amazon SES → Gmail API → SMTP**. En caso de una operación SES/Gmail incierta **no se vuelve a enviar por otra ruta** para evitar duplicados.

## Incidente octubre 2026

En la inspección de producción del 21/10/2026 se comprobó que:

- La cuenta de Amazon SES de `us-east-1` dispone de acceso de producción, está habilitada y tiene identidad `envios.flacso.edu.uy` verificada.
- La fila `ConfiguracionCorreoSes` de Sala Virtual tenía `activa = false`; por ello el transporte de correo utilizaba Gmail.
- El rol asociado a EC2, `EC2-CloudWatch-FullAccess`, devolvió `implicitDeny` en el simulador IAM para `ses:SendEmail` sobre la identidad de SES anterior. **No basta con cambiar `activa = true`**.
- El journal de `salavirtual.service` presentaba errores `GoogleCuentaOcupadaError` y `GoogleOperacionInciertaError`, generados por la capa que serializa escrituras sobre una cuenta de Workspace.
- Existían notificaciones en la base de datos recientes; el síntoma de no recibir correo no prueba que se dejara de producir el evento de notificación.

## Correcciones de aplicación

- Se descifran las credenciales Gmail con `descifrarConfiguracion` en el servicio anterior y en el bootstrap actual.
- Dentro de cada llamada masiva, los envíos se procesan en serie y no compiten por el mismo lock de escritura de Gmail.
- Se registra una auditoría `NOTIFICACION_CORREO_ESTADO`, sin destinatario ni contenido, con estados `ACEPTADO`, `OMITIDO`, `ERROR`, tipo de notificación y código técnico de error.
- En **Configuración → Correo** se muestran los últimos intentos y su resultado. `ACEPTADO` significa aceptación del proveedor; no garantiza entrega al buzón o ausencia de rebote.
- No se reenvían automáticamente operaciones de aceptación incierta ni se reproducen las notificaciones históricas, para evitar correos duplicados.

## Pasos operativos pendientes (requieren cambio de infraestructura)

1. Conceder a la **identidad exacta de la instancia de Sala Virtual**, con política de mínimo privilegio, `ses:SendEmail` únicamente sobre `arn:aws:ses:us-east-1:<account-id>:identity/envios.flacso.edu.uy`. Verificar con `SimulatePrincipalPolicy`.
2. Probar `SESv2.SendEmail` contra un buzón institucional de control con permiso para la prueba.
3. Activar SES desde **Configuración → Correo**, conservando la región, el remitente y el Reply-To aprobados. Ejecutar «Enviar correo de prueba» y verificar recepción, no solo aceptación.
4. Revisar rebotes/quejas mediante SES, idealmente asociando un configuration set con métricas y notificaciones de eventos.
5. Para push real del sistema operativo: crear persistencia de subscriptions VAPID y web-push para navegadores/PWA, y, por separado, registros FCM y manejo de tokens para la aplicación Android nativa. Requiere consentimiento de cada dispositivo y eventos de entrega verificables.

Estas operaciones no forman parte del cambio de código de diagnóstico. Habilitar SES o IAM no debe hacerse a ciegas ni atribuir la solución del correo al despliegue del PR por sí solo.
