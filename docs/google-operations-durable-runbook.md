# Operaciones Google durables — guía de operación

## Propósito y límites de seguridad

Sala Virtual ejecuta POST a Google Meet, Google Drive y Gmail. Una caída de red o del worker **después** de que Google procesó el POST no significa que el POST haya fracasado.

La migración `20261011122000_google_operaciones_durables` crea `GoogleOperacionExterna` y `GoogleCuentaLease`. La aplicación **no** debe auto-repetir un POST no idempotente con resultado incierto.

## Máquina de estados

- **RESERVADA:** se creó registro, pero no ha comenzado la llamada a Google. Reintentable al liberar el lease.
- **ENVIANDO:** se obtuvo el lease y el worker está llamando a Google. Una caída de proceso deja este estado intencionalmente intacto y **no** autoriza repetir.
- **CONFIRMADA:** resultado remoto (ID/acuse mínimo) persistido. Una nueva ejecución con la misma clave retorna ese resultado sin otro POST.
- **INCIERTA:** error en llamada o al guardar respuesta. Requiere conciliación, nunca `POST` automático.

Todos los intentos tienen clave SHA-256 estable, índice único en PostgreSQL y lease de cuenta. El lease dura 120 segundos; su expiración **no** transforma ENVIANDO en RESERVADA. Una operación caducada puede seguir siendo ambigua.

## Conciliación

1. Consultar GET `/api/v1/operaciones/estado` (admin o token del timer). El indicador `googlePost.inciertas` o `enviandoObsoletas` positivo produce estado crítico HTTP 503.
2. Revisar GET `/api/v1/operaciones/google` con cuenta `ADMINISTRACION`, protegido por estado y rol actual en PostgreSQL. Devuelve las primeras 100 operaciones no confirmadas, nunca credenciales ni contenidos de correo/documentos.
3. **Drive carpeta:** hay un intento automático de recuperación mediante búsqueda remota exacta (padre + nombre). Si Google devuelve exactamente una carpeta, se confirma la operación de manera condicional. Si devuelve cero o varias carpetas, se conserva el estado incierto.
4. **Google Meet spaces:** la API `spaces.create` no proporciona clave de idempotencia. No puede deducirse de un timeout qué espacio creó Google. Se requiere diagnóstico administrativo del calendario y de los recursos, y comprobación documentada antes de resolver manualmente.
5. **Drive documento / Gmail send:** no repetir POST ni reactivar fallback SMTP sin investigar el estado remoto. El envío Gmail lleva `Message-ID` determinístico cuando existe un ID de notificación persistida. Con el scope actual `gmail.send`, no hay lectura de mensajes para conciliación automática.
6. No modificar directamente estados a RESERVADA/CONFIRMADA sin evidencia remota. La base almacena resultados mínimos, nunca secretos OAuth o claves privadas.

## Alertas

El timer `salavirtual-ops-health.timer` sigue ejecutándose cada 15 minutos. Invoca `infra/ec2/check-google-ops-health.sh`, que consulta la API local con `CRON_SECRET`.

Para alertas externas, **opcionalmente** configurar el secreto en `/srv/apps/salavirtual-flacso/shared/.env.production`:

```dotenv
GOOGLE_OPS_ALERT_WEBHOOK_URL=https://<webhook-chat-o-slack-configurado>
```

El script emite un mensaje simple compatible con webhooks de Google Chat/Slack ante `degradado` o `critico`, como máximo una alerta por severidad cada 60 minutos. No incluye datos personales ni URL de tokens en los logs. Sin webhook, el incidente permanece observable en systemd y la API, pero **no** se envía una notificación externa.

Verificar luego:

```bash
systemctl status salavirtual-ops-health.timer
systemctl start salavirtual-ops-health.service
journalctl -u salavirtual-ops-health.service -n 50 --no-pager
```

## Gmail y semántica de notificación

Cuando la notificación se guarda en la bandeja del usuario, su ID se utiliza para deduplicar el envío Gmail. Si el usuario deshabilitó avisos de bandeja (solo correo), o un flujo manual no proporciona `MailInput.idempotencyKey`, cada invocación nueva crea una clave aleatoria; el transporte **no garantiza** deduplicar reintentos de alto nivel en esos casos. Se mantiene como trabajo pendiente pasar un ID de entrega estable de origen para **todos** los avisos.

SMTP solo se considera fallback cuando Gmail no tiene credenciales, es decir, no hubo intento remoto. Ante timeout, no existe reenvío por SMTP.

## Límites operativos y despliegue

- `prisma migrate deploy` se ejecuta durante el despliegue EC2, **antes** de activar la release.
- La migración es aditiva y no se revierte automáticamente si se restaura el código anterior. Comprobar que PostgreSQL tenga copias de seguridad y que la migración se aplicó correctamente.
- Todos los cambios necesitan CI: `test/google-durable-operations.test.ts`, `test/google-durable-operations-postgres.test.ts`, tests de Gmail y Drive, tests de integración de conferencias.
- Probar recuperación en staging con una respuesta POST perdida, dos workers concurrentes, cuenta revocada y servicio remoto inactivo.
- Activar webhook real de alertas y comprobar su recepción antes de declarar el monitoreo completo.
- No se ejecuta compensación automática para borrar espacios Meet huérfanos: puede destruir reuniones vigentes, y requiere conciliación con la evidencia de Calendar.
