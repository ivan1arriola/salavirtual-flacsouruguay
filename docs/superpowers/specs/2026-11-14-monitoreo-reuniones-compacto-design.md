# Monitoreo > Reuniones: lista compacta por día

Página: `src/bootstrap/ui/asistencia/asistencia-tecnica-page.server.tsx` (`/monitoreo`).

## Intención
La pantalla es una lista larga de tarjetas de ~200 px, iguales entre sí, que repite información (estado, borde, "Asignada a…") y esconde lo accionable. Se quiere poder ver de un vistazo qué falta cubrir y recorrer la semana sin scroll excesivo.

## Objetivos
- Una reunión = una fila compacta (~56 px), agrupada por día (se mantiene `agruparPorDia`).
- Resumen en una línea: "10 reuniones · 9 cubiertas · **1 pendiente**"; el número de pendientes es un enlace que aplica `estado=pendientes`.
- Acciones masivas (Renotificar sin asignar / Notificar asignadas) dentro de un menú "Notificar ▾".
- Pendientes: fondo tenue de advertencia y botón principal "Asignar". Cubiertas: discretas, botón secundario "Gestionar".
- Datos secundarios (host Zoom, N.º de reunión, modalidad/horario híbrido, postulados) en un detalle expandible por fila; "Abrir Zoom / Copiar link / Ver detalle" accesibles desde la fila o el detalle.
- Responsive: en móvil la fila se apila en 2 líneas.

## No objetivos
Vista calendario, cambios de datos/consultas, cambios en la pestaña Gestión, cambios en la lógica de asignación o notificación.

## Anti-objetivos
Perder acceso a algún dato o acción que hoy existe; romper el color por cuenta de Zoom (`data-cuenta`).

## Enfoques considerados
- A. Tabla compacta por día (elegido, con elementos de B).
- B. Pendientes primero + cubiertas plegadas (solo se toma el resumen enlazado y el énfasis en pendientes).
- C. Calendario semanal (descartado: más trabajo, peor en móvil).

## Decisiones del builder
Estilos en el CSS existente de `coverage-*` / `monitoring-*`; reutilizar `MeetLinkActions` y `BulkMonitoringNotificationActions` (adaptar a menú); detalle expandible con `<details>` nativo (sin JS extra). Actualizar tests existentes si dependen del markup.
