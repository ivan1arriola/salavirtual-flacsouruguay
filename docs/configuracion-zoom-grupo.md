# Cuentas anfitrionas de Zoom a partir de un grupo de Zoom

Las cuentas anfitrionas de Zoom ya no se cargan a mano: son los miembros de un **grupo de Zoom** que elegís en **Configuración › Salas**. La sincronización crea, adopta, actualiza, desactiva o marca «fuera del grupo» las salas Zoom para que coincidan con el grupo. El nombre, el correo y la licencia de cada cuenta Zoom vienen de Zoom; en Sala Virtual solo se editan la prioridad y si la sala está activa. Las salas de Google Meet no cambian.

## Requisitos en Zoom

La app de Zoom es **Server-to-Server OAuth**. Sus credenciales (Account ID, Client ID y Client Secret) se cargan en **Configuración › Zoom**. La app necesita estos permisos granulares:

- Reuniones: `meeting:write:meeting:admin`, `meeting:read:meeting:admin`, `meeting:update:meeting:admin`, `meeting:delete:meeting:admin`, `meeting:read:list_meetings:admin`.
- Grupos: `group:read:list_groups:admin`, `group_member:read:list_members:admin`.

Si faltan los de grupos, la lista de grupos y la sincronización muestran qué permiso agregar en el Marketplace de Zoom.

## Antes de la primera sincronización

Revisá el grupo en Zoom:

- Los miembros tienen que ser usuarios **Licensed**. Un miembro sin licencia queda como sala «sin licencia» y no recibe reuniones nuevas.
- El correo de cada miembro tiene que ser el mismo que el de la sala que ya existe en Sala Virtual. Así la sincronización **adopta** la sala existente (con sus reuniones) en lugar de crear una duplicada. Una sala Zoom que no esté en el grupo se desactiva o, si tiene reuniones futuras, queda «Fuera del grupo» y deja de recibir reuniones nuevas.

La primera sincronización es **manual**: elegí el grupo y tocá «Sincronizar con el grupo».

## Vista previa y confirmación

«Sincronizar con el grupo» primero muestra qué va a cambiar, sin tocar nada: cuentas nuevas, cuentas que se desactivan, cuentas que quedan fuera del grupo (con sus reuniones futuras), cuentas que pasan a sin licencia y cuántos miembros están sin licencia. Después confirmás con «Confirmar y sincronizar» o cancelás.

Si la sincronización dejaría sin reuniones nuevas a **más de la mitad** de las salas Zoom que hoy las reciben, se muestra como alerta y el servidor no la aplica sin esa confirmación explícita. Suele indicar que se eligió el grupo equivocado.

El resultado de cada sincronización («1 nueva, 0 desactivadas, 0 fuera del grupo con reuniones, 1 sin licencia») queda en la pantalla y en la auditoría, con quién la pidió.

## Sincronización periódica

Existe el endpoint `GET /api/v1/configuracion/zoom/grupo/sincronizar`, protegido con `Authorization: Bearer $CRON_SECRET`:

```bash
curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/v1/configuracion/zoom/grupo/sincronizar
```

**Todavía no está programado.** Programarlo con un timer de systemd, siguiendo el modelo de `infra/ec2/salavirtual-google-pending.service` y `.timer`, queda para un cambio posterior, una vez verificada la primera sincronización manual. Se recomienda cada hora o una vez por día.

El endpoint responde 502 mientras no haya un grupo elegido y cuando la sincronización necesita confirmación (es masiva): nunca la confirma solo. En ese caso hay que revisarla y confirmarla desde Configuración › Salas.

También responde 502 si el grupo contiene cuentas nuevas que aún no están en Sala Virtual: un administrador debe revisar esas altas desde Configuración antes de que reciban reuniones.

## Si elegiste el grupo equivocado

Elegí el grupo correcto y sincronizá de nuevo: las salas del grupo correcto se adoptan o reactivan y las demás se desactivan o quedan fuera del grupo. Las reuniones creadas mientras tanto siguen en las salas donde se crearon; no se reasignan solas.

Si una serie con enlace único quedó en una sala que salió del grupo, no se le pueden agregar fechas: usá «Unificar enlace» o creá una serie nueva.
