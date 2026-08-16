# Modelo 3NF

## Separaciones centrales

El modelo evita repetir datos derivados y separa responsabilidades:

- `Usuario`: identidad, identificador local, contrasena, rol y acceso.
- `CuentaGoogleFlacso`: cuentas Google vinculadas; un usuario puede tener varias.
- `UsuarioEmailAlias`: otros correos validos para localizar al usuario.
- `UsuarioFusion`: trazabilidad inmutable de unificacion de docentes.
- `Docente` / `AsistenteTecnico`: perfiles operativos opcionales de un usuario.
- `UnidadAcademica` / `Programa`: estructura institucional.
- `DocentePrograma`: asociacion explicita entre docente y programa.
- `SolicitudSala`: raíz agregada de una serie académica originada desde un `DocentePrograma`.
- `InstanciaSala`: ocurrencia programada.
- `ProveedorReunion`: Meet operativo o Zoom historico.
- `EventoProveedor`: identificadores, enlaces y payloads externos.
- `CohostReunion`: cuentas Google cohost vinculadas a una ocurrencia.
- `Grabacion`: archivo o referencia de grabacion.
- `PostulacionAsistenciaTecnica`: interes de un asistente tecnico en realizar la asistencia de una instancia.
- `AsignacionAsistenciaTecnica`: adjudicacion de la asistencia tecnica de una instancia.
- `LiquidacionAsistenciaTecnica` / `DetalleLiquidacionAsistenciaTecnica`: cierre economico.

## Por que no se llama todo Meet

Aunque el flujo nuevo sea Google Meet, el dominio no debe depender del proveedor.
Eso permite:

- conservar Zoom como historico;
- cambiar la integracion Meet sin migrar todo el dominio;
- registrar eventos manuales o externos;
- auditar payloads de proveedor sin contaminar solicitudes academicas.

## Usuarios y roles

`Usuario.id` es el nombre de acceso local y `passwordHash` almacena solamente el
hash de la contrasena. Cuando se genera una contrasena temporal para comunicarla
por correo, `passwordInicialCifrada` conserva esa credencial inicial cifrada y se
limpia cuando el usuario define su propia contrasena o se restaura una contrasena
legacy. Las cuentas Google FLACSO no reemplazan esa identidad:
se vinculan de uno a muchos mediante `CuentaGoogleFlacso`.

Administracion mantiene la lista de correos institucionales autorizados. El
`providerAccountId` puede estar vacio mientras la cuenta esta preautorizada y se
completa en el primer login OAuth. Todo usuario debe conservar al menos un
metodo de acceso: una cuenta FLACSO o una contrasena.

Los roles son `ADMINISTRACION`, `ASISTENTE_TECNICO` y `DOCENTE`. El rol neutral
`ADMINISTRACION` absorbe todas las funciones que antes correspondian a
`ADMINISTRADOR` y `CONTADURIA`.

La fusion de dos docentes solo puede ejecutarla Administracion. Se trasladan
cuentas Google, alias, autoria de solicitudes y asociaciones a programas; el
usuario de origen queda inactivo y enlazado al destino para no perder historia.

## Reuniones

Una operacion de alta crea una `SolicitudSala` y una o mas `InstanciaSala`.
Cada instancia conserva fecha, hora y zona horaria, y se vincula a:

- el programa y docente mediante `DocentePrograma`;
- una `CuentaProveedor` Meet activa y con licencia como host;
- cero o mas cuentas institucionales en `CohostReunion`;
- opcionalmente un `AsistenteTecnico`, cuando se solicite asistencia tecnica;
- un `EventoProveedor` con el codigo Meet, cuando ya exista.

El cohost queda modelado sin asignarle permisos o automatizaciones hasta definir
su comportamiento. Los dias de reunion se derivan de las fechas de las
instancias y su zona horaria; no se almacenan por separado para evitar
inconsistencias.

### Fuentes de verdad

| Hecho | Fuente |
| --- | --- |
| Docente y programa | `DocentePrograma`, referenciado por `SolicitudSala` |
| Fecha y hora programadas | `InstanciaSala` |
| Dia de la semana | Derivado de fecha y zona horaria |
| Host y codigo externo | `EventoProveedor` |
| Licencia y limite del host | `CuentaProveedor` |
| Cohosts | `CohostReunion` |
| Asistente tecnico asignado | `AsignacionAsistenciaTecnica` |

`SolicitudSala` es la raíz del agregado. Sus fechas, cantidad, tipo de
instancias, asistencia y grabación son valores agregados actuales, recalculados
desde las instancias activas dentro de la misma transacción que las modifica.
`InstanciaSala` es la fuente de verdad de cada ocurrencia. El flujo normal no
permite una solicitud sin instancias; si aparece por una migración o una
intervención manual, el recálculo falla explícitamente para no conservar datos
agregados obsoletos.

`TarifaAsistenciaTecnica` es una entidad versionada por modalidad. La tarifa vigente es
siempre la ultima creada; al agregar una nueva, las anteriores quedan como
historial. Cada `AsignacionAsistenciaTecnica` referencia obligatoriamente la tarifa que
estaba vigente al asignarla y conserva tambien sus valores aplicados como
snapshot. No se recalcula desde la tarifa actual, porque eso alteraria la
historia economica.

## Zoom historico

Zoom aparece como valor de `TipoProveedor.ZOOM_HISTORICO` y `OrigenGrabacion.ZOOM_HISTORICO`.
No hay modelos centrales `EventoZoom`, `CuentaZoom` ni `AsistenteZoom`.
