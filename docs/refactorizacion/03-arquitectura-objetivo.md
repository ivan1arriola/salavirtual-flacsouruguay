# Arquitectura objetivo

## Dominios de experiencia

- Inicio: prioridades y próxima acción por rol; no duplicar herramientas completas.
- Reuniones: agenda, series, encuentros, programación y consulta histórica.
- Monitoreo: cobertura y asignación, agenda abierta, postulaciones, operación y disponibilidad. El equipo puede accederse desde Comunidad y desde tareas de cobertura.
- Biblioteca: grabaciones, transcripciones, notas y documentos realmente disponibles. Cada recurso enlaza al encuentro; mostrar estados de sincronización.
- Comunidad: personas, programas, roles, solicitudes de acceso y perfil administrativo del equipo.
- Informes: horas, liquidaciones, registros importados y consulta de asistencia existente. Los informes agregados nuevos no están incluidos sin aprobación.
- Sistema: configuración de integraciones, cuentas anfitrionas, comunicaciones y diagnóstico técnico.
- Cuenta personal: datos, contraseña y preferencias; notificaciones personales como acceso global.

## Modelo académico

SolicitudSala representa la solicitud/serie; InstanciaSala representa un encuentro; EventoProveedor representa el vínculo externo. Verificar las agrupaciones de serie existentes antes de alterar identidades. Monitoreo y asistencia de participantes son conceptos distintos.

La ficha de serie contiene información común, encuentros, personas, configuración de serie, archivos y actividad. La ficha de encuentro contiene horario, acceso, monitoreo, participantes, asistencia, archivos y actividad del encuentro.

La misma ficha cambia prioridades antes, durante y después del encuentro. Operaciones disponibles dependen de estado, rol y proveedor. El proveedor activo determina controles operativos; la procedencia de evidencia histórica se preserva independientemente. No fusionar registros incompatibles ni inferir identidades o tiempos.

## Arquitectura técnica

Mantener Next App Router como entrada, bootstrap como composición, módulos de dominio y adaptadores de infraestructura. En cada incremento:

- Extraer decisiones puras y modelos de lectura tipados antes de compartir UI.
- Definir un contrato de presentación neutral con capacidades explícitas (p. ej., asistencia disponible, edición, grabación, acceso).
- Adaptadores Meet/Zoom producen ese contrato sin sustituir reglas de dominio ni mezclar evidencia.
- Mantener límites entre client y server components; no enviar secretos, start_url privilegiadas ni datos no autorizados.
- Reutilizar componentes en src/components y módulos de presentación con dueño claro; evitar ciclos y nuevas fachadas duplicadas.
- Preferir cambios compatibles en datos. Una migración de persistencia requiere un plan aparte con respaldo, validación y rollback.

No se propone dividir el monolito en servicios ni repositorios. El problema observado es organización y duplicación interna, no evidencia de una necesidad de microservicios.

## Vocabulario

Serie: agrupación académica de encuentros. Encuentro: ocurrencia concreta. Monitoreo: apoyo técnico. Cobertura: asignación necesaria o realizada. Postulación: solicitud de un asistente. Asistencia: participación de personas en un encuentro. Cuenta anfitriona: cuenta que aloja la conferencia. Biblioteca: recursos académicos. Evitar llamar asistencia técnica a la asistencia de participantes.
