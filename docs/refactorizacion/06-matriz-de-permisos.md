# Matriz preliminar de permisos

A = ADMINISTRACION, D = DOCENTE, T = ASISTENTE_TECNICO. Esta matriz de experiencia no concede permisos. Los guards de ruta, políticas de dominio y endpoints son la fuente de verdad. Todo alcance de objeto debe verificarse en E01.

## Acceso por tarea

- Inicio: A/D/T con sesión activa, vista propia.
- Programar reunión: A/D sujetos a la política de creación; D dentro de sus programas habilitados. T no crea.
- Agenda completa: A/D según la política actual de agenda y alcance. T usa su agenda asignada.
- Mis clases y programas: D, con alcance propio.
- Monitoreo de administración, asignación y gestión de cobertura: A.
- Agenda abierta: A/T según políticas existentes; postulaciones de T sobre su identidad y elegibilidad.
- Mi agenda y horas personales: T, sobre sus registros.
- Operación de encuentro: A y T asignado según caso de uso; verificar alcance de D y diferencias por proveedor y estado antes de mostrar acciones.
- Ficha de serie/asistencia de encuentro: A/D con alcance académico autorizado según reglas existentes; verificar accesos adicionales por asignación y por proveedor.
- Biblioteca: A/D/T con alcance de recurso; raíz general de Drive solo A.
- Personas, programas administrativos, solicitudes de acceso, equipo, detalle de otro usuario y diagnóstico/configuración: A.
- Notificaciones y perfil: A/D/T, sobre su propia cuenta.
- Completar registro: sesión y condición de registro; acceso y recuperación según política de autenticación.

## Pruebas requeridas antes de mover una acción

Para cada recurso y acción (leer, crear, editar, cancelar, asignar, descargar, exportar, reintentar), anotar guard, caso de uso, API o server action, rol, alcance de programa/asignación/identidad, estado y capacidad del proveedor. Probar permitido y denegado tanto en interfaz como por llamada directa.

Casos mínimos: docente de otro programa, asistente sin asignación, usuario inactivo, IDs alterados, archivo de otro encuentro, acceso a raíz de Drive, acción administrativa desde rol no autorizado, diferencias entre proveedor activo e histórico. Las consultas y exports deben devolver solo registros autorizados. Evitar filtrar únicamente del lado cliente.

No modificar roles, políticas de liquidación, tarifas, horarios ni reglas de cobertura como efecto colateral de cambios UI.
