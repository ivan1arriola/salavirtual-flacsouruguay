# Cuentas anfitrionas de Zoom a partir de un grupo de Zoom

Fecha: 2026-11-04. Estado: diseño aprobado en conversación, pendiente de revisión de este documento.

## Objetivo

Hoy las cuentas anfitrionas de Zoom se cargan una por una en Configuración › Salas («Agregar sala»). Se quiere que las cuentas de Zoom sean **los miembros de un grupo de Zoom elegido en Configuración**, de modo que la lista de anfitriones refleje siempre ese grupo.

## Decisiones acordadas

1. El grupo es un **grupo de Zoom**, elegido desde la lista de grupos de la cuenta de Zoom (no un grupo de Google Workspace).
2. Los miembros se incorporan con un botón **«Sincronizar con el grupo»** y también con una **sincronización automática periódica**.
3. La **carga manual de cuentas Zoom se elimina**. «Agregar sala» queda solo para Meet. Las cuentas Zoom pueden editarse (prioridad y límite) pero no crearse ni borrarse a mano.
4. Si una cuenta sale del grupo **y tiene reuniones futuras**, sigue activa, no recibe reuniones nuevas y se marca «Fuera del grupo (N reuniones futuras)». Si no tiene reuniones futuras, se desactiva.

## Fuera de alcance

- Grupos de Google Workspace o etiquetas propias de la app.
- Reasignación automática de reuniones futuras entre cuentas.
- Cambios en cómo se asignan cuentas a reuniones nuevas, salvo excluir las que están fuera del grupo.
- Cuentas de Meet: no cambian.

## Enfoque

Se guarda el grupo elegido en `ConfiguracionZoom` y la sincronización crea y actualiza filas de `CuentaProveedor`, que es a lo que ya apuntan las reuniones (`EventoProveedor`, `ReunionProveedor`). No se crea una tabla nueva de miembros: cambiaría la asignación de cuentas en un sistema en producción.

## Diseño

### 1. Datos (migración Prisma)

`ConfiguracionZoom` suma:

- `grupoId: String?` y `grupoNombre: String?` — grupo elegido.
- `ultimaSincronizacionAt: DateTime?`
- `ultimaSincronizacionResultado: String?` — resumen legible («3 nuevas, 1 desactivada, 1 fuera del grupo con reuniones») o el error.

`CuentaProveedor` suma:

- `origenGrupoZoom: Boolean @default(false)` — la cuenta fue creada o adoptada por la sincronización.
- `fueraDelGrupoAt: DateTime?` — fecha en que se detectó que salió del grupo; `null` si pertenece.

Cuentas nuevas: `prioridad` según el orden de aparición en el grupo (a partir de la mayor prioridad existente de Zoom), `limiteConcurrente = 1`, `tieneLicencia = true` solo si Zoom informa el usuario como licenciado (tipo 2), `false` en cualquier otro caso, `activa = true`, `emailOrganizador` = correo del miembro, `externalAccountId` = id de usuario de Zoom.

Una cuenta Zoom ya existente cuyo `emailOrganizador` coincide con un miembro del grupo se **adopta** (se marca `origenGrupoZoom = true`) en lugar de duplicarse; esto conserva las reuniones ya asignadas.

### 2. Servicio de sincronización

Un servicio `sincronizarCuentasZoomConGrupo` (módulo `configuracion`):

1. Lee los miembros del grupo elegido con las credenciales de `obtenerCredencialesZoom`, paginando.
2. Calcula el plan con una función pura `planificarSincronizacionGrupoZoom(miembros, cuentasActuales, reunionesFuturasPorCuenta)` que devuelve: crear, actualizar, adoptar, desactivar, marcar fuera del grupo, reactivar (una cuenta que vuelve al grupo se reactiva y limpia `fueraDelGrupoAt`).
3. Aplica el plan en una transacción y guarda fecha y resumen en `ConfiguracionZoom`.
4. Si Zoom no responde, faltan permisos o el grupo ya no existe, **no cambia ninguna cuenta**; solo guarda el error como resultado.

Reglas de la función pura:

- Miembro nuevo → crear activa.
- Miembro existente → actualizar nombre/correo; si estaba fuera del grupo, reactivar.
- Cuenta de origen grupo que ya no es miembro: sin reuniones futuras → `activa = false` y `fueraDelGrupoAt`; con reuniones futuras → sigue `activa`, se fija `fueraDelGrupoAt` y se cuenta como «fuera con reuniones».
- Una cuenta Zoom sin `origenGrupoZoom` que no está en el grupo (carga manual previa) se trata igual que las de origen grupo: se desactiva o se marca, para que la lista termine reflejando el grupo.
- «Reuniones futuras» = instancias en estado `PROGRAMADA` con fin posterior a ahora, cuyo evento Zoom activo usa esa cuenta.

Disparadores: acción del botón (solo administración) y un endpoint periódico protegido igual que los otros endpoints de tareas programadas del proyecto. Una sincronización en curso no se lanza dos veces a la vez.

### 3. Asignación de cuentas

La selección de cuenta anfitriona para reuniones nuevas ignora las cuentas con `fueraDelGrupoAt` no nulo. Las reuniones ya asignadas a esas cuentas no cambian.

### 4. Pantalla de Configuración › Salas

- Para Zoom: selector del grupo (la lista se pide a Zoom al abrir el selector), botón «Sincronizar con el grupo» y texto con la fecha y el resultado de la última sincronización.
- «Agregar sala» ofrece solo Google Meet.
- Filas de Zoom: editar prioridad y límite; sin borrar. Cuentas fuera del grupo muestran «Fuera del grupo (N reuniones futuras)».
- Sin grupo elegido: aviso «Elegí un grupo de Zoom para obtener las cuentas anfitrionas» y no se sincroniza.

### 5. Errores

- Falta de permisos de la app de Zoom: mensaje que nombra los permisos faltantes.
- Zoom no disponible o grupo inexistente: mensaje claro; la lista no se toca.
- Grupo vacío: se rechaza la sincronización con aviso explícito, para no desactivar todas las cuentas por error.

### 6. Pruebas

- Función pura: nuevo, existente, adopción por correo, salió con y sin reuniones futuras, regreso al grupo, grupo vacío, cuenta manual fuera del grupo.
- Servicio con adaptador de Zoom simulado: éxito, error de Zoom sin cambios, transacción.
- La selección de cuenta ignora las cuentas fuera del grupo.
- UI: «Agregar sala» solo ofrece Meet; las filas de Zoom no tienen botón de borrar.

## Riesgos y requisitos

- **Permisos de Zoom (no verificado):** la app Server-to-Server OAuth necesita permisos de lectura de grupos y de usuarios (por ejemplo `group:read:admin` y `user:read:admin`). Si faltan, hay que agregarlos en el Marketplace de Zoom antes de usar la función.
- **Cuentas manuales actuales:** la primera sincronización puede desactivar o marcar cuentas que no estén en el grupo. Antes de activar la sincronización automática conviene revisar el grupo en Zoom y correr una sincronización manual.
- **Producción:** la migración agrega columnas nulas o con valor por defecto, sin reescribir datos.
