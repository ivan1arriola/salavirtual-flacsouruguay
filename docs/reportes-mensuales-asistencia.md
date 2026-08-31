# Reportes mensuales de asistencia técnica

## Caso de uso

El 1.º de cada mes, Sala Virtual FLACSO debe enviar a cada asistente técnico un correo con la cantidad de horas registradas durante el mes calendario anterior.

Cada mensaje se envía de forma individual:

- **Para:** correo principal del asistente técnico.
- **CC automática:** todos los usuarios activos con rol `ADMINISTRACION` y correo principal.
- **CC adicional:** los correos cargados en **Configuración → Asistencia técnica**.

Los destinatarios se normalizan y deduplican. Si un administrador también fue cargado en la lista adicional, recibe una sola copia.

## Fuente de las horas

El reporte reutiliza el mismo cálculo que el histórico personal del asistente. Para cada asignación válida del período, los minutos se resuelven en este orden:

1. minutos confirmados por Administración;
2. minutos reportados en la instancia;
3. duración real si existe;
4. duración programada como fallback.

No se incluyen instancias `CANCELADA` o `NO_REALIZADA`, solicitudes canceladas ni asignaciones canceladas/rechazadas.

El corte mensual usa `America/Montevideo`: por ejemplo, el reporte ejecutado el 1.º de septiembre de 2026 cubre desde el 1.º de agosto de 2026 00:00 hasta el 1.º de septiembre de 2026 00:00, hora de Uruguay.

## Contenido del mensaje

El correo muestra:

- total en horas y minutos;
- total en horas decimales;
- cantidad de reuniones;
- horas virtuales;
- horas híbridas.

También se envía un reporte de 0 horas cuando el asistente no tuvo asistencias válidas durante el mes.

## Idempotencia y trazabilidad

`EnvioReporteMensualAsistencia` guarda una fotografía de cada reporte por `asistenteTecnicoId + periodo`:

- destinatario y copias;
- minutos totales, virtuales e híbridos;
- cantidad de reuniones;
- estado del envío;
- cantidad de intentos y último error;
- fecha de envío.

La restricción única por asistente y período evita duplicar correos. Una nueva ejecución omite los reportes ya enviados y reintenta los que quedaron en `ERROR`.

## Endpoint de cron

La ejecución se expone por:

```text
GET /api/v1/asistencia/reportes-mensuales
Authorization: Bearer <CRON_SECRET>
```

Devuelve un resumen con:

```json
{
  "periodo": "2026-08",
  "asistentes": 5,
  "enviados": 5,
  "yaProcesados": 0,
  "errores": 0,
  "sinCorreo": 0
}
```

La respuesta es HTTP 500 si al menos un correo falla o existe un asistente sin correo principal. Esto permite que el planificador detecte el envío incompleto. Repetir la llamada es seguro para los reportes ya enviados.

## Programación recomendada

En producción, ejecutar el endpoint el día 1 de cada mes a las 08:00 en `America/Montevideo`. El planificador debe tener acceso a `CRON_SECRET` y tratar un HTTP no exitoso como incidencia.

Ejemplo de expresión cron:

```cron
0 8 1 * *
```

La llamada concreta puede hacerse desde el mismo mecanismo de cron que invoca los demás endpoints protegidos por `CRON_SECRET`.

## Despliegue

Antes de arrancar la versión nueva de la aplicación hay que aplicar las migraciones:

```bash
npx prisma migrate deploy
```

La migración agrega la configuración de destinatarios adicionales y la trazabilidad de envíos mensuales.
