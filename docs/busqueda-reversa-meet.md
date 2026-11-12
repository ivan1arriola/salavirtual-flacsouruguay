# Búsqueda reversa de Google Meet

Ruta: `/reuniones/buscar-meet`, accesible desde Reuniones, el resumen de Administración
y el menú Administración (también en Más del móvil). Exclusiva para usuarios activos
con el rol ADMINISTRACION, resuelto desde la base antes de consultar.

Acepta código, URL con o sin protocolo, parámetros, mayúsculas y espacios.
La utilidad `meet-link.domain.ts` es compartida con la agenda, el guardado de
resultados del proveedor y la asignación manual de enlaces a series.

## Persistencia y migración

La fuente vigente continúa siendo EventoProveedor.codigoReunion / joinUrl.
No se cambia la creación, relación con Calendar, host ni configuración de cohosts.

La migración `20260914160000_historial_enlaces_meet` añade un índice a Auditoria
y un trigger PostgreSQL AFTER INSERT / UPDATE de código o URL. Guarda ambos valores
en la misma transacción, incluida la instancia y el ID Calendar. Cubre updateMany,
scripts y versiones anteriores de la aplicación. No copia payloads ni credenciales.
Un rollback revierte también el registro. No altera valores existentes ni inventa
una fecha de comienzo de uso de los enlaces anteriores.

El historial se interpreta como observaciones/cambios fechados; el primer dato
conocido no se presenta como fecha de creación del espacio Google. Si no se conoce
un motivo, se indica explícitamente. Los scripts de asignación y migración Preview
especifican origen y motivo mediante set_config local a su transacción.
En la sincronización se conserva el contexto de la operación pendiente.

Antes del despliegue, respaldar la base con el procedimiento habitual.
Aplicar mediante `npx prisma migrate deploy` desde el flujo EC2 existente.
No ejecutar db push contra producción. El cambio es compatible con el release
anterior; un rollback de aplicación puede conservar el trigger y la auditoría.

## Evidencia anterior

Se leen, sin reescribirlas, las auditorías documentadas en el código:

- MEET_MIGRADO_A_ESPACIO_PREVIEW: una instancia.
- MEET_GRUPO_MIGRADO_A_ESPACIO_PREVIEW: IDs explícitos presentes en ambos snapshots.
- ENLACE_MEET_ASIGNADO_A_SERIE / ENLACE_MEET_UNIFICADO_EN_SERIE: evidencia de serie,
  mostrada aparte porque el agregado de códigos no identifica cada encuentro.
- ENLACE_MEET_REGISTRADO: nuevas observaciones del trigger.

No se realizó una inspección de filas de producción en esta implementación.
Las fuentes comprobadas son el schema y los formatos de los scripts versionados.
No se consultan logs externos ni versiones anteriores de Calendar automáticamente.
Un código sobrescrito sin evidencia conservada no puede reconstruirse.
payloadUltimo es el último snapshot, no un historial; no se interpreta como prueba
de que un enlace diferente haya sido vigente.

## Prueba manual

1. Iniciar sesión como Administración; abrir Reuniones → Buscar por enlace o código Meet.
2. Buscar un código actual conocido, su URL y la URL con ?authuser=1; comparar resultados.
3. Repetir con mayúsculas y espacios. Buscar también un código válido inexistente.
4. Buscar un código anterior de una migración Preview conservada: debe indicar Enlace
   histórico y destacar el vigente. Abrir Diagnóstico e historial.
5. Buscar un código compartido: deben aparecer todos los encuentros, incluso pasados
   o cancelados, y una advertencia que contempla las series legítimas.
6. Verificar host, cohosts registrados, creador, Calendar y grabaciones disponibles.
   Los cohosts mostrados no se presentan como una verificación en vivo de Google.
7. Abrir la ruta directamente como Docente, Asistente o sin sesión: no expone resultados.
8. En una base de prueba, cambiar un enlace; buscar el anterior y comprobar la auditoría.
   Retornar al código anterior debe marcarlo nuevamente como vigente.

## Validación

- `npm test`
- `npm run check`
- `npm run validate:schema`
- `npm run build`
- Workflow Meet · Historial PostgreSQL: aplica el SQL al schema anterior en una base
  descartable y prueba escritura masiva, búsqueda real, creación con enlace, retiro
  de enlace, idempotencia, rollback y exclusión de Zoom.

No hay script lint en package.json.
La documentación instalada de Next no está versionada; para esta implementación
remota se consultó la documentación oficial de page/searchParams y loading.

## Límites operativos

Para garantizar compatibilidad con valores antiguos sin normalizar, la búsqueda
lee identificadores mínimos de todos los eventos Meet y las acciones de auditoría
relevantes, los normaliza con una sola utilidad y recién entonces carga detalles
de coincidencias. No se limita arbitrariamente el número de resultados.
El costo crece con esos registros; si crecen significativamente, conviene incorporar
un índice de búsqueda materializado que use el mismo normalizador.
El formulario realiza una consulta al enviar, no una por cada pulsación.
