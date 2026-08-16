# Arquitectura

## Principios

- La entidad academica principal es la `SolicitudSala`.
- Cada solicitud genera una o mas `InstanciaSala`.
- La integracion externa vive en `EventoProveedor`.
- El `EventoProveedor` conserva su `externalEventId` inmediatamente después del
  POST a Calendar. La creación, el polling de la conferencia y la configuración
  de Meet son pasos reintentables separados; los reintentos nunca hacen POST si
  ya existe ese id.
- `estadoIntegracion` describe el resultado de la última sincronización y
  `operacionPendiente` describe el efecto que falta aplicar (`PROVISIONAR`,
  `REPROGRAMAR`, `CONFIGURAR_MEET` o `CANCELAR`). Los retries no interpretan
  mensajes de error: ejecutan únicamente esa operación persistida.
- Un claim corto protegido por advisory lock evita que dos workers sincronicen
  el mismo `EventoProveedor`; las llamadas HTTP ocurren fuera de transacciones.
- Las eliminaciones son cancelaciones lógicas hasta que Calendar confirma cada
  DELETE, conservando la información necesaria para reintentar.
- Las modificaciones estructurales de una serie toman un advisory lock por
  `SolicitudSala`; después del lock se relee el agregado antes de decidir
  ordinales, solapamientos y mínimos de instancias.
- Google Meet es el proveedor operativo.
- Zoom queda como proveedor historico, sin crear nuevas solicitudes operativas.
- La UI debe ser ligera: CSS propio, componentes pequeños y dependencias justificadas.
- La logica de dominio sigue un enfoque funcional.

## Enfoque funcional

- Funciones puras para reglas, validaciones, transformaciones y decisiones.
- Datos inmutables mediante tipos `readonly` y resultados discriminados.
- Efectos externos aislados en bordes: rutas, Prisma, Google, correo y reloj.
- Casos de uso como composicion de funciones, sin clases de servicio ni estado global mutable.
- El nucleo devuelve planes o resultados; los adaptadores interpretan esos datos dentro de transacciones.
- No se busca que Prisma, HTTP o Google sean puros: se busca que esos efectos no contengan decisiones de negocio.
- Reloj, red y persistencia se reciben como dependencias para que los casos de uso sean deterministas en pruebas.
- La configuracion de login se valida en el dominio y solo el adaptador `src/lib/auth/config.ts` lee `process.env`.
- La cuenta de servicio Google y la carpeta de Drive se configuran desde Administracion y se guardan cifradas en la base.
- Solo OAuth (`AUTH_GOOGLE_ID` y `AUTH_GOOGLE_SECRET`) y la clave tecnica de cifrado permanecen en el entorno.

## Capas

- `app/`: rutas Next.js, server components y endpoints.
- `src/modules/solicitudes`: validacion y casos de uso de solicitudes.
- `src/modules/reuniones`: reglas puras y alta transaccional de reuniones.
- `src/modules/meet`: puerto de provisionamiento Google Meet.
- `src/modules/historico-zoom`: importacion y consulta de datos heredados.
- `src/modules/asistencias`: disponibilidad, interes, asignacion y liquidacion.
- `src/modules/usuarios/*.domain.ts`: reglas puras de usuarios.
- `src/modules/usuarios/*.service.ts`: bordes transaccionales que ejecutan esas reglas.
- `prisma/schema.prisma`: contrato relacional 3NF.

## Decisiones de UI

- Sin Material UI en la base.
- Sin framework CSS obligatorio.
- CSS global pequeño y componentes de servidor cuando no se necesita estado cliente.
- Tableros densos, sobrios y rapidos de escanear.
- Interacciones cliente solo donde aporten valor: formularios, filtros, asignaciones y reportes.
