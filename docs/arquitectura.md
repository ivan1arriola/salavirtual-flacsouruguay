# Arquitectura

## Principios

- La entidad académica principal es la `SolicitudSala`.
- Cada solicitud genera una o más `InstanciaSala`.
- La integración externa vive en `EventoProveedor`.
- El `EventoProveedor` conserva su `externalEventId` inmediatamente después del
  POST a Calendar. La creación, el polling de la conferencia y la configuración
  de Meet son pasos reintentables separados; los reintentos nunca hacen POST si
  ya existe ese id.
- `estadoIntegracion` describe el resultado de la última sincronización y
  `operacionPendiente` describe el efecto que falta aplicar (`PROVISIONAR`,
  `REPROGRAMAR`, `CONFIGURAR_MEET` o `CANCELAR`). Los retries no interpretan
  mensajes de error: ejecutan únicamente esa operación persistida.
- Un claim corto protegido por advisory lock evita que dos workers sincronicen
  el mismo `EventoProveedor`; cada claim tiene un token único y las llamadas
  HTTP tienen timeout menor al lease. Las llamadas HTTP ocurren fuera de
  transacciones y un worker obsoleto nunca modifica ni reabre el estado vigente.
- Las eliminaciones son cancelaciones lógicas hasta que Calendar confirma cada
  DELETE, conservando la información necesaria para reintentar.
- Las respuestas HTTP usan `202 Accepted` cuando el cambio local se confirmó
  pero Google aún está pendiente. Administración puede asignar explícitamente
  una operación a eventos históricos ambiguos; nunca se infiere desde errores.
- Un encuentro agregado a una serie no hereda automáticamente el asistente de
  otras fechas: cada instancia requiere una asignación propia con validación de
  agenda y tarifa.
- Las modificaciones estructurales de una serie toman un advisory lock por
  `SolicitudSala`; después del lock se relee el agregado antes de decidir
  ordinales, solapamientos y mínimos de instancias.
- Google Meet es el proveedor operativo.
- Zoom queda como proveedor histórico, sin crear nuevas solicitudes operativas.
- La UI debe ser ligera: CSS propio, componentes pequeños y dependencias justificadas.
- La lógica de dominio sigue un enfoque funcional.
- La ruta raíz `/` siempre renderiza el dashboard correspondiente al rol autenticado; las consolas operativas y fichas detalladas se abren desde el dashboard y nunca sustituyen esa entrada.

## Enfoque funcional

- Funciones puras para reglas, validaciones, transformaciones y decisiones.
- Datos inmutables mediante tipos `readonly` y resultados discriminados.
- Efectos externos aislados en bordes: rutas, Prisma, Google, correo y reloj.
- Casos de uso como composición de funciones, sin clases de servicio ni estado global mutable.
- El núcleo devuelve planes o resultados; los adaptadores interpretan esos datos dentro de transacciones.
- No se busca que Prisma, HTTP o Google sean puros: se busca que esos efectos no contengan decisiones de negocio.
- Reloj, red y persistencia se reciben como dependencias para que los casos de uso sean deterministas en pruebas.
- La configuración de login se valida en el dominio y solo el adaptador `src/lib/auth/config.ts` lee `process.env`.
- La cuenta de servicio Google y la carpeta de Drive se configuran desde Administración y se guardan cifradas en la base.
- Solo OAuth (`AUTH_GOOGLE_ID` y `AUTH_GOOGLE_SECRET`) y la clave técnica de cifrado permanecen en el entorno.

## Capas

- `app/`: rutas Next.js, server components y endpoints; autentican, traducen HTTP y delegan.
- `src/bootstrap/`: composición de dependencias para UI, jobs y rutas.
- `src/modules/reuniones/`: solicitudes, series, encuentros e instancias.
- `src/modules/conferencias/`: aprovisionamiento, cohosts y estado del proveedor de videoconferencia.
- `src/modules/asistencia/`: disponibilidad, postulaciones, asignaciones y reportes de asistencia.
- `src/modules/archivos/`: grabaciones, transcripciones, notas y artefactos.
- `src/modules/notificaciones/`: intención de notificación y canales de entrega.
- `src/modules/liquidaciones/`: tarifas, horas, cierres y pagos.
- `src/modules/historico/`: consulta y tipos de datos heredados de Zoom.
- `src/modules/usuarios/` e `src/modules/identity/`: identidad, roles y administración de usuarios.
- `src/integrations/google/`: clientes técnicos de Auth, Calendar, Meet, Drive y Gmail; no contienen reglas de negocio.
- `prisma/schema.prisma`: contrato relacional 3NF.

> Para el análisis exhaustivo del estado de migración por módulo, acoplamientos residuales y plan de consolidación en 4 fases, consultar [`docs/diagnostico-arquitectura-acoplamiento-y-coherencia.md`](./diagnostico-arquitectura-acoplamiento-y-coherencia.md).

### Módulos en contracción

`src/modules/meet/` se conserva temporalmente únicamente como superficie de compatibilidad para scripts o tests heredados. Ningún archivo de código runtime (`app/`, `src/bootstrap/`, `src/components/` ni `src/modules/`) debe importarlo; esa frontera está protegida por `test/no-meet-runtime-imports.test.ts`, y el aislamiento de capas (`domain`, `ports`, `application`, `presentation`) está protegido por `test/architecture-boundaries.test.ts`. La lógica de proveedor pertenece a `conferencias`, los artefactos a `archivos` y las composiciones con Prisma/Google a `bootstrap`.

Las fachadas duplicadas `src/modules/asistencias/` y `src/modules/historico-zoom/` fueron retiradas. Los nombres canónicos son `asistencia` e `historico`.

## Consola operativa en tiempo real

- La consola vive en `/operacion/[instanciaId]` y nunca sustituye al dashboard de `/`.
- Administración puede operar cualquier encuentro; un AT solo los encuentros con asignación activa.
- El estado `EN_CURSO` requiere una conferencia real confirmada por Google Meet.
- **Separación entre política solicitada y estado en vivo:** la consola distingue explícitamente la política de la solicitud (`requiereGrabacion`: _Requerida_ / _No requerida_) del estado real reportado por la API v2 de Google Meet (`grabandoEnVivo`: `STATE_UNSPECIFIED` / `STARTED` / `ENDED` / `FILE_GENERATED`), emitiendo una alerta operativa si el encuentro está en curso, requiere grabación y aún no se está grabando en Meet. Del mismo modo reporta el estado en vivo de la transcripción (`transcribiendoEnVivo`).
- **Registro persistente de asistencia (`RegistroAsistenciaMeet`):** consolida los participantes activos y desconectados fusionando intervalos de múltiples sesiones simultáneas (evitando duplicar minutos cuando una persona ingresa desde PC y móvil), atribuyendo correos sin colisiones por homónimos (`crearIndiceUnicoPorNombre`) y preservando las ediciones manuales del operador (`origenCorreo = "MANUAL"`).
- **Control remoto en vivo (`POST /api/v1/reuniones/instancias/[instanciaId]/control-operativo`):** permite modificar desde Sala Virtual la política de grabación, modalidad, ventana horaria de asistencia, tipo de acceso del espacio Meet (`OPEN`, `TRUSTED`, `RESTRICTED`) y lista de cohosts en tiempo real.
- Las consultas externas se realizan al abrir la consola. Solo `ESPERANDO_INICIO` y `EN_CURSO` activan refresco automático cada 30 segundos, y únicamente con la pestaña visible.
- Administración puede reintentar desde la consola la `operacionPendiente` persistida sin inferirla desde mensajes de error.
- Las incidencias operativas reutilizan `Incidencia` y se registran junto con una entrada de `Auditoria` dentro de una transacción.
- Las incidencias abiertas alimentan el triage administrativo existente.

## Decisiones de UI

- Sin Material UI en la base.
- Sin framework CSS obligatorio.
- CSS global pequeño y componentes de servidor cuando no se necesita estado cliente.
- Tableros densos, sobrios y rápidos de escanear.
- Interacciones cliente solo donde aporten valor: formularios, filtros, asignaciones y reportes.
