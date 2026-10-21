# Recordatorios de reuniones con verificación Meet

## Comportamiento

La ruta `GET /api/v1/reuniones/recordatorios-24h` exige
`Authorization: Bearer $CRON_SECRET`. Revisa reuniones `PROGRAMADA` que empiezan
en las próximas 24 horas, excluye solicitudes `CANCELADA` y prepara un correo
individual por destinatario: quien creó la solicitud, docente responsable y
asistentes con monitoreo asignado/aceptado. Los horarios se muestran en
`America/Montevideo`; el comienzo de clase determina el umbral de 24h.

Se consulta `spaces.members` de Google Meet con credenciales principales y
alternativas históricas antes de enviar. **Solo COHOST confirmado por Meet** se
presenta como cuenta habilitada para coanfitrionía; una cuenta configurada en
base de datos no implica permisos. La cuenta organizadora de Sala no se
recomienda como identidad personal de acceso. Si la API falla, la verificación
figura como `NO_VERIFICABLE` y se aconseja consultar a Administración.

Los recordatorios se registran en `RecordatorioReunion`, con clave única
`(instanciaSalaId, usuarioId, inicioProgramadoAt)`. Una misma persona no recibe
duplicados al repetirse el cron ni ante ejecuciones concurrentes. Si hubo un
timeout al comunicarse con SES/Gmail, el resultado externo puede ser incierto:
**no se reintenta automáticamente** un envío reservado o fallido. Se revisa
manualmente en el proveedor antes de cualquier reenvío. Las preferencias de
`REUNION_RECORDATORIO` están en Mi Perfil. El estado `ACEPTADO` significa que
el proveedor aceptó el correo, **no** que fue entregado al buzón.

Reuniones creadas con menos de 24 horas o pendientes tras una interrupción
pueden recibir un recordatorio tardío (nunca después del inicio); en operación
continua el recordatorio se genera aproximadamente 24 horas antes, con el
intervalo de hasta 5 minutos del timer.

## Activación EC2

Los archivos de systemd están versionados:

- `infra/ec2/salavirtual-reminders-24h.service`
- `infra/ec2/salavirtual-reminders-24h.timer`

Tras desplegar el código y aplicar la migración Prisma, Administración debe
instalar y activar el timer en la instancia EC2:

```bash
SRC=/srv/apps/salavirtual-flacso/source
sudo install -m 0644 "$SRC/infra/ec2/salavirtual-reminders-24h.service" /etc/systemd/system/salavirtual-reminders-24h.service
sudo install -m 0644 "$SRC/infra/ec2/salavirtual-reminders-24h.timer" /etc/systemd/system/salavirtual-reminders-24h.timer
sudo systemctl daemon-reload
sudo systemctl enable --now salavirtual-reminders-24h.timer
sudo systemctl list-timers --all | grep salavirtual-reminders
```

La ruta responde con recuentos `reuniones`, `destinatarios`, `enviados`,
`omitidos`, `errores` y `verificacionesFallidas`. Consultar el último
resultado con `journalctl -u salavirtual-reminders-24h.service -n 100 --no-pager`.
No guardar emails completos o credenciales de acceso en la auditoría.
