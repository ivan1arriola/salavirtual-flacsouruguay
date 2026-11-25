# Inventario de pantallas y línea base

Fuente: árbol de rutas de main en `4ce11ebd4ceffa17467491b252e1e256f28deda3`, implementaciones de página y navegación. Se cuentan plantillas dinámicas una vez, no registros individuales, endpoints ni layouts.

## Recuento

- 42 archivos page.tsx: 38 bajo el grupo de gestión y 4 fuera de él.
- 5 rutas exclusivamente de redirección y 1 alias con el mismo componente.
- 36 destinos con contenido después de descontar esos 6; el inicio tiene tres dashboards, por lo que existen 38 pantallas base.
- 57 casos iniciales al diferenciar las 19 variantes adicionales indicadas abajo; 171 combinaciones si se revisan en tres tamaños de pantalla. Es una estimación de cobertura, no evidencia de pruebas ejecutadas. Algunos estados y roles amplían el total.

## Pantallas base

### Acceso y registro (4)

- S01 Iniciar sesión: `/acceso`.
- S02 Completar registro: `/completar-registro`.
- S03 Recuperar contraseña: `/recuperar-contrasena`.
- S04 Restablecer contraseña: `/restablecer-contrasena`.

### Inicio (3)

- S05 Inicio de administración: `/`.
- S06 Inicio docente: `/`.
- S07 Inicio de asistente: `/`.

### Reuniones y encuentros (7)

- S08 Agenda y series: `/reuniones`.
- S09 Programar reunión: `/reuniones/nueva`.
- S10 Ficha de serie: `/reuniones/[solicitudId]`.
- S11 Asistencia: `/reuniones/[solicitudId]/encuentros/[instanciaId]/asistencia`.
- S12 Buscar reunión por Meet: `/reuniones/buscar-meet`.
- S13 Duplicados: `/reuniones/duplicados`.
- S14 Reuniones de un docente: `/docentes/[usuarioId]/reuniones`.

### Monitoreo (6)

- S15 Monitoreo: `/monitoreo`.
- S16 Gestión de monitoreo: `/monitoreo/gestion`.
- S17 Gestionar cobertura de encuentro: `/monitoreo/gestionar/[instanciaId]`.
- S18 Ficha operativa: `/operacion/[instanciaId]`.
- S19 Agenda abierta y postulaciones: `/agenda-abierta`.
- S20 Mi agenda: `/mi-agenda`.

### Personas y administración (4)

- S21 Personas y programas: `/usuarios`.
- S22 Gestión de usuario: `/usuarios/[usuarioId]`.
- S23 Equipo de monitoreo: `/asistentes`.
- S24 Ficha del asistente: `/asistentes/[usuarioId]`.

### Actividad docente (2)

- S25 Mis clases: `/mis-clases`.
- S26 Mis programas: `/mis-programas`.

### Recursos y cuenta (3)

- S27 Grabaciones y archivos: `/grabaciones`.
- S28 Notificaciones: `/notificaciones`.
- S29 Mi perfil: `/mi-perfil`.

### Operaciones (2)

- S30 Centro de operaciones: `/centro-operaciones`.
- S31 Diagnóstico de Zoom: `/centro-operaciones/zoom`.

### Configuración (7)

- S32 Resumen: `/configuracion`.
- S33 Google: `/configuracion/google`.
- S34 Zoom: `/configuracion/zoom`.
- S35 Salas: `/configuracion/salas`.
- S36 Correo: `/configuracion/correo`.
- S37 Notificaciones de sistema: `/configuracion/notificaciones`.
- S38 Registros importados: `/configuracion/historico`.

## Variantes iniciales

- S08: Meet/Zoom, cada uno por serie y encuentro (4).
- S10: Meet/Zoom (2).
- S11: Meet/Zoom (2).
- S13: pendientes, actualizar y falsos (3).
- S18: Meet/Zoom (2); Zoom distingue además consola e histórico según estado, pendiente de desglosar.
- S19: agenda abierta y postulaciones (2).
- S20: próximas, mes e histórico (3).
- S21: personas y programas (2).
- S25: próximas, en curso y anteriores (3).
- S29: datos, acceso y contraseña, notificaciones (3).
- S31: cuentas, series, pasadas, agenda (4).

## Compatibilidad

Las redirecciones son cobertura-asistencias, historico, mi-historico, reuniones-del-mes y reuniones/migracion-zoom. asistencia-tecnica exporta el mismo componente que monitoreo. Ver el registro de migración.

## Auditoría E01 pendiente

Registrar por cada ID: URL y parámetros, rol y permiso de servidor, entradas y salidas, acciones y efectos, consultas, estados de carga/error/vacío, componentes y CSS, pruebas existentes, capturas de 360, 768 y 1440 px, y observaciones. Añadir variantes por estado real, proveedor, capacidad y rol; inspeccionar diálogos, formularios de varios pasos, filtros y onboarding. No registrar datos personales en capturas del repositorio.
