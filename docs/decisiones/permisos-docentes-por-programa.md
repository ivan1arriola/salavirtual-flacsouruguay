# Permisos docentes por programa

Las reuniones pertenecen operativamente a un programa, aunque `SolicitudSala` conserve una asociación `DocentePrograma` concreta para identificar a la persona responsable de origen.

## Regla de acceso

- Administración puede gestionar cualquier reunión.
- Un docente activo puede ver y gestionar cualquier reunión cuyo programa tenga una asociación `DocentePrograma` activa con ese docente.
- La persona que creó la reunión y el `DocentePrograma` usado al crearla se conservan para trazabilidad, presentación y auditoría, pero no limitan los permisos de otros docentes del mismo programa.
- Los docentes del programa reciben las notificaciones de creación de reunión y de asignación de asistencia técnica dirigidas al detalle de esa reunión.

Las restricciones temporales siguen vigentes: por ejemplo, no se puede eliminar un encuentro pasado ni una reunión con encuentros que ya comenzaron.
