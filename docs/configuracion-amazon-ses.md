# Configurar Amazon SES para Sala Virtual

Amazon SES puede ser activado desde **Configuración → Correo**. La aplicación guarda la región, el remitente, Reply-To y el estado de activación. Las credenciales provienen de la cadena predeterminada del AWS SDK; no hay claves AWS en la base de datos ni en variables de entorno.

## Requisitos en AWS

1. Asociar a la instancia EC2 un instance profile con un rol IAM. El proceso Node.js recibe las credenciales temporales del rol mediante el SDK.
2. Otorgar al rol `ses:SendEmail`, limitado a la identidad remitente verificada:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "ses:SendEmail",
      "Resource": "arn:aws:ses:REGION:ACCOUNT_ID:identity/avisos.flacso.edu.uy"
    }
  ]
}
```

3. Verificar el dominio o dirección remitente en SES en la misma región que se configurará en Sala Virtual. Configurar DKIM y SPF para mejorar la autenticación del dominio.
4. Si la cuenta SES permanece en sandbox, solo puede enviar a destinatarios verificados. Solicitar acceso de producción antes de habilitar envíos a la comunidad.
5. En **Configuración → Correo**, guardar región y remitente verificado, opcionalmente Reply-To, activar SES y enviar un correo de prueba.

Al estar activo, SES se usa para invitaciones, notificaciones y pruebas. Si está desactivado o sin configurar, la aplicación mantiene Gmail API y luego SMTP. Un error después de intentar SES no cambia de proveedor porque SES podría haber aceptado el mensaje antes del error de red.

El correo de prueba confirma aceptación por SES. No confirma la llegada a Recibidos; rebotes y quejas no están integrados actualmente y deben revisarse en las herramientas de AWS.
