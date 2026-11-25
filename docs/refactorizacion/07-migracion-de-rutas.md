# Migración y compatibilidad de rutas

Las rutas sugeridas son decisiones de organización, no obligación de renombrar URL. Priorizar mantener URLs existentes mientras se unifica la presentación. No crear una redirección hasta que su destino cubra todas las funciones y permisos de origen.

## Mapa de destino conceptual

- S01 a S07: acceso e inicio, rutas conservadas.
- S08 a S11: Reuniones, conservar agenda, creación y serie; evaluar una ruta canónica de encuentro que incluya operación y asistencia sin romper las rutas existentes.
- S12 y S13: Sistema > Centro de operaciones; mantener rutas actuales.
- S14: Comunidad > detalle docente > reuniones, con enlace al módulo académico.
- S15 a S17: Monitoreo; consolidar listados solo después de verificar filtros y acciones de gestión.
- S18: Reuniones > encuentro, accesible también desde Monitoreo.
- S19: Monitoreo > Agenda abierta y postulaciones.
- S20: Monitoreo > Mis monitoreos y Horas e historial, mantener parámetros.
- S21 a S24: Comunidad; enlazar gestión operativa del equipo desde Monitoreo e Informes.
- S25 y S26: actividad docente, rutas conservadas.
- S27: Biblioteca, conservar /grabaciones inicialmente.
- S28 y S29: cuenta y notificaciones, conservar.
- S30 y S31: Sistema > Centro de operaciones, conservar.
- S32 a S37: Sistema > Configuración, conservar.
- S38: Informes > registros importados, mantener /configuracion/historico hasta disponer de destino equivalente.

## Alias y redirecciones existentes

- /asistencia-tecnica: alias del componente de /monitoreo.
- /cobertura-asistencias: redirige a /monitoreo preservando query.
- /historico: redirige a /configuracion/historico con comprobación de rol.
- /mi-historico: redirige a /mi-agenda?tab=historico.
- /reuniones-del-mes: redirige a /mi-agenda?tab=mes.
- /reuniones/migracion-zoom: redirige a /reuniones?proveedor=zoom&vista=series.
- /configuracion?seccion=...: compatibilidad definida en settings-navigation.domain.ts; preservar búsqueda y página del histórico.

## Protocolo

Inventariar consumidores internos, onboarding, notificaciones enviadas, enlaces de Calendar, marcadores y exports. Conservar parámetros semánticos (proveedor, vista, tab, seccion, filtros, IDs) y anclas; probar codificación y combinaciones válidas. Evitar redirecciones abiertas, ciclos y pérdida de alcance. Verificar navegación atrás y enlaces directos. Mantener alias mientras haya consumidores y retirar solo con evidencia y aprobación. No usar una redirección para ampliar autorización.
