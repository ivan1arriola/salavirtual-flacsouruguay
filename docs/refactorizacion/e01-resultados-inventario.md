# E01 — Resultados del inventario reproducible

Primera ejecución: [workflow 45651305616](https://github.com/ivan1arriola/salavirtual-flacsouruguay/actions/runs/45651305616), commit del PR a5db2760adcac1e9baae3edb8b087fdf622bd6e5. Artefacto e01-5444ca0460080d5fe71ee83c69ee0e9423195c3a. Línea base de código funcional: 0364cc0037748199d428ce7d5b2a7a506e399dec.

## Recuentos

- 722 fuentes TypeScript examinadas por el inventario de entradas.
- 79 archivos API, 104 métodos HTTP explícitos o reexportados: 41 GET, 38 POST, 13 PUT, 6 PATCH y 6 DELETE.
- 23 exportaciones de módulos con use server y una acción inline de cierre de sesión en el menú de perfil.
- 65 imports CSS en TypeScript; 30 corresponden al layout autenticado y cuatro al layout raíz.
- 775 nodos en el grafo de Dependency Cruiser, 111 pares dirigidos entre propietarios, sin imports marcados como no resueltos.
- 23 páginas con import directo resuelto a src/lib/db.ts. El import no prueba una consulta directa.

La descarga y el análisis de los cinco JSON confirman que no hay rutas API sin método reconocido. Los resultados son estáticos y no equivalen a pruebas E2E.

## Acoplamiento entre módulos

De los 111 pares entre propietarios, 40 conectan dos módulos de dominio; 35 contienen al menos una dependencia clasificada como runtime. Los principales pares por número de referencias runtime son:

- reuniones a conferencias: 9; además, una referencia de tipos.
- asistencia a liquidaciones: 7; además, seis referencias de tipos.
- meet a conferencias: 6.
- asistencia a reuniones: 5.
- configuracion a reuniones, dashboard a reuniones y usuarios a identity: 4 cada uno.

El grafo agregado de módulos contiene seis pares bidireccionales: asistencia/reuniones, conferencias/configuracion, conferencias/reuniones, configuracion/reuniones, configuracion/notificaciones y operaciones/reuniones.

Siete módulos forman un componente fuertemente conexo en el grafo agregado: archivos, asistencia, conferencias, configuracion, notificaciones, operaciones y reuniones. Esto no implica un ciclo entre archivos: las aristas pueden provenir de unidades distintas. El check no-circular del CI anterior pasó.

Reuniones concentra 19 referencias runtime salientes a otros módulos y 17 entrantes. Conferencias concentra 22 entrantes. No eliminar dependencias por volumen: distinguir puertos, fachadas, adapters, orquestación y acceso a persistencia antes de decidir.

## Autorización: lectura de casos que el detector no clasifica

El inventario contiene ocho entradas sin indicios léxicos de guard en su cuerpo inmediato. Se revisaron tres casos de API y dos acciones adicionales:

- PATCH y DELETE de encuentros delegan a execute. Este comprueba sesión y actor activo, y después llama a actualizarEncuentro o eliminarEncuentro. Preservar las políticas de programa y titularidad del servicio, y la respuesta 202 si la sincronización externa queda pendiente.
- GET de codigo-zoom llama a contextFor, que exige actor activo de administración, reunión operativa autorizada y proveedor activo Zoom. PATCH comparte este control.
- Los handlers reexportados de Auth.js no tienen cuerpo local. Su revisión corresponde a la configuración de autenticación.
- GET de salud es un endpoint público; revisar alcance de la respuesta.
- La acción solicitarRecuperacion es pública y siempre redirige al mismo estado, incluso ante un error. Falta probar rate limiting y ausencia de diferencias observables.
- La acción inline del menú de perfil delega a signOut y redirige a acceso.

La ausencia de pistas en el AST no demuestra falta de autorización. No convertir este resultado en un listado de vulnerabilidades.

## Server actions: clasificación inicial de las 24 entradas

Las ocho acciones de configuracion/actions.ts (crear, actualizar y eliminar programa; agregar, quitar e invitar integrante; actualizar reportes y correo SES) pasan por requireAdmin, que resuelve el actor actual y exige administración activa.

Las tres acciones de usuarios/[usuarioId]/actions.ts (guardar programas, cesar asistente, eliminar usuario) exigen administración activa antes de ejecutar sus servicios. La revisión de duplicados exige la misma condición.

Las tres acciones de usuarios/actions.ts (invitar, aprobar y rechazar solicitud Google) resuelven actor y delegan la autorización administrativa a servicios. Invitaciones vuelve a consultar el actor en transacción; aprobación y rechazo comprueban actor activo y puedeAdministrar.

Las tres acciones de mi-perfil/actions.ts resuelven actor activo y operan sobre la identidad propia. La acción de mis-programas delega a actualizarProgramasPropios, que comprueba la política y usa actor.id; el servicio vuelve a comprobar permisos en transacción. Registro institucional exige docente activo en su servicio. El resto corresponde a login, recuperación, restablecimiento y cierre de sesión.

Estos grupos cubren 24 entradas. Falta recorrer las políticas internas completas, estados, recursos, efectos y pruebas negativas por acción.

## Prioridad de reorganización

- E04: shell y navegación deben compartir un catálogo de destinos, sin alterar permisos.
- E05/E06: definir contrato de lectura de series y encuentros; separar composición, autorización, proveedor y representación visual. Evitar extraer servicios nuevos solo para reducir líneas.
- E07: establecer un límite claro entre reuniones y asistencia; separar coordinación de cobertura de los cálculos de liquidación.
- E12: separar consultas de configuración, adaptadores de conferencias y diagnóstico operativo, manteniendo compatibilidad histórica.
- E01 pendiente: clasificar las 23 páginas con DB según consulta propia o inyección, rastrear todos los métodos HTTP y validar las 128 entradas con casos apropiados. Completar capturas autenticadas y pruebas de interacción.

No se han realizado cambios de producción ni pruebas contra reuniones reales. El informe inicial no cierra E01.
