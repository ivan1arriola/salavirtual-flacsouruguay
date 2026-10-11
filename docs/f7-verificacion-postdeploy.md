# F7 — Verificación de integración F0–F6

Esta fase no modifica datos de producción ni afirma que una CI exitosa valide integraciones reales.

## Comprobación automatizada de solo lectura

En el servidor EC2, con permisos para consultar systemd:

```bash
sudo bash /srv/apps/salavirtual-flacso/source/scripts/verify-postdeploy.sh 954fe717ca89f07b3d345079b8a912ba0d001771
```

El script comprueba: release activo, SHA exacto, servicio web, respuesta saludable de PostgreSQL y tres timers habilitados y activos. No imprime secretos ni ejecuta mutaciones de datos. No verifica que los timers hayan ejecutado trabajos satisfactoriamente.

## Verificación manual obligatoria

1. Confirmar que [CI de main](https://github.com/ivan1arriola/salavirtual-flacsouruguay/actions/runs/38105009078) sea exitosa y [Deploy EC2](https://github.com/ivan1arriola/salavirtual-flacsouruguay/actions/runs/38105086235) termine en éxito.
2. Inspeccionar `systemctl list-timers --all 'salavirtual-*'`, `systemctl status salavirtual-google-pending.service salavirtual-ops-health.service` y `journalctl -u salavirtual-google-pending.service -u salavirtual-ops-health.service --since '1 hour ago' --no-pager`. No publicar logs sin revisar datos sensibles.
3. Probar con datos de prueba: alta, reprogramación, modificación de serie, cohosts, cancelación y reconciliación contra Google Calendar/Meet. Comprobar que no aparecen eventos duplicados.
4. Validar con cuentas reales de pruebas y por rol: administración, docente, asistente técnico y acceso no autorizado. Verificar límites de acceso a reuniones ajenas.
5. Validar Android: login, lectura de agenda, edición permitida, logout y rechazo efectivo de token revocado.
6. Verificar backups y restauración ensayada en entorno aislado, y compatibilidad de esquema con el release anterior.
7. Confirmar que los fallos de monitorización llegan a un canal externo; hasta entonces el health timer **no constituye una alerta**.
8. Registrar SHA, fecha/hora, resultados y evidencia en el ticket de release; no marcar F7 completada por CI solamente.

## Criterio de aprobación

CI y deploy exitosos; script sin fallas; operaciones Google sin duplicaciones; sesiones y permisos validados; Android compatible; evidencia de restauración y alertas. Si alguno falla, bloquear nuevas modificaciones y documentar incidencia antes de proceder.
