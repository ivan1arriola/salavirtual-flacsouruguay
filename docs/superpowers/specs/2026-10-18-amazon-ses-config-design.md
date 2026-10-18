# Configuración de correo con Amazon SES

## Problema y evidencia

La app envía correo por dos caminos. El flujo de notificaciones e invitaciones compone Gmail API primero y SMTP después, pero solo usa SMTP si Gmail no está configurado. Un error luego de intentar Gmail no hace fallback para evitar duplicados. Los errores de notificación se registran en logs y se absorben para que el flujo principal continúe. La sección Configuración > Correo permite probar el canal actual, pero no elegir ni configurar proveedor.

No se pudo confirmar la causa operativa actual porque la conexión AWS disponible pidió reautenticación y el runtime EC2 no está accesible desde este repo. La integración nueva debe mostrar errores útiles de SES en la prueba de correo.

## Objetivo

Permitir que administración configure y active Amazon SES desde Configuración > Correo. El envío debe aplicar a invitaciones, notificaciones y pruebas de correo, conservar Gmail/SMTP para recuperación manual y evitar credenciales AWS estáticas en Sala Virtual.

## Decisiones

1. Enviar con Amazon SES API v2 mediante `@aws-sdk/client-sesv2` y `SendEmailCommand` en runtime Node.
2. Usar la cadena predeterminada de credenciales AWS del SDK. En producción EC2, la instancia debe tener un instance profile con rol IAM de mínimo privilegio; no se guardan access keys ni secretos AWS en DB o UI.
3. La UI persistirá región SES, identidad `From`, `Reply-To` opcional y estado activo. La configuración guardará auditoría del usuario y fecha que la actualizó.
4. Si SES está activo y configurado, se usa como proveedor principal. Si está desactivado o no configurado, se conserva el comportamiento Gmail y luego SMTP. Tras intentar SES, un error no cae a Gmail/SMTP porque la aceptación podría ser ambigua y producir duplicados.
5. La ruta actual de prueba de correo permanece compatible y usa el mismo selector de proveedor que los envíos reales. La respuesta identifica el proveedor y los errores SES se traducen a mensajes seguros para administración, sin exponer credenciales, contenido ni destinatarios en logs.
6. Una aceptación de SES significa que SES aceptó el mensaje, no confirma entrega a Recibidos. Rebotes y quejas requieren monitoreo; integración de eventos SES/SNS queda fuera de esta entrega.

## Cambios técnicos

- Agregar una entidad de configuración singleton para SES y una migración SQL aditiva y documentada, justificada por la persistencia requerida por la UI. Como el proyecto usa migraciones Prisma solo hacia delante, la reversión operativa se realiza con una migración correctiva si fuera necesaria.
- Agregar dominio, servicio de configuración con autorización de administración, server action y formulario accesible en la sección de Correo existente.
- Crear un adaptador SES que implemente el puerto de envío actual y componga selección SES/Gmail/SMTP sin duplicar la creación de mensajes.
- Conectar el adaptador tanto al bootstrap global de notificaciones como al servicio de correo de configuración/invitaciones.
- Mantener las rutas y contratos actuales. Ampliar los tipos internos de proveedor para incluir SES.
- Documentar el requisito externo de rol IAM EC2 con `ses:SendEmail`, restringido a la identidad de envío elegida, además de la identidad verificada en la misma región y acceso de producción SES cuando se envíe a direcciones no verificadas.

## Seguridad y autorización

- Solo administración activa puede leer y actualizar la configuración, usando el patrón de autorización existente.
- La UI no acepta ni devuelve claves de acceso AWS.
- El formulario valida región, correos y campos requeridos en servidor.
- No se cambian permisos de otros roles ni preferencias de notificación.
- No se reintenta con otro proveedor después de un intento de envío SES.

## Pruebas y aceptación

- Tests de dominio/servicio: validación de configuración, rechazo de actor no administrador y persistencia/upsert.
- Tests del adaptador: campos To/Cc, contenido texto/HTML, Reply-To, región, respuesta MessageId, errores y proveedor SES seleccionado.
- Tests de composición: SES activo evita Gmail/SMTP; SES desactivado conserva el orden actual; error de SES no hace fallback.
- Test de ruta: solo administrador vigente puede enviar y el resultado comunica el proveedor configurado.
- TypeScript, suite, build de producción y `git diff --check` pasan.
- Validación real de SES queda condicionada a que el rol EC2 y la identidad SES estén listos. La prueba real se ejecuta desde el botón de la UI por administración.

## Riesgos y pendientes

- El instance profile de la instancia productiva no está definido por el repositorio y se debe confirmar/configurar en AWS antes de activar SES.
- La cuenta SES puede permanecer en sandbox y aceptar solo destinatarios verificados.
- Sin eventos de rebote/queja conectados, el estado de éxito de la app no representa entrega final.
- La causa previa de fallos de Gmail/SMTP no queda diagnosticada por esta integración; se conservará en el código la información de error disponible y la UI permitirá confirmar SES de forma independiente.
