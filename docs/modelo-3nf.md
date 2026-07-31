# Modelo 3NF

## Separaciones centrales

El modelo evita repetir datos derivados y separa responsabilidades:

- `Usuario`: identidad, identificador local, contrasena, rol y acceso.
- `CuentaGoogleFlacso`: cuentas Google vinculadas; un usuario puede tener varias.
- `UsuarioEmailAlias`: otros correos validos para localizar al usuario.
- `UsuarioFusion`: trazabilidad inmutable de unificacion de docentes.
- `Docente` / `Asistente`: perfiles operativos opcionales de un usuario.
- `UnidadAcademica` / `Programa`: estructura institucional.
- `DocentePrograma`: asociacion explicita entre docente y programa.
- `SolicitudSala`: pedido academico originado desde un `DocentePrograma`.
- `InstanciaSala`: ocurrencia programada.
- `ProveedorReunion`: Meet operativo o Zoom historico.
- `EventoProveedor`: identificadores, enlaces y payloads externos.
- `CohostReunion`: cuentas Google cohost vinculadas a una ocurrencia.
- `Grabacion`: archivo o referencia de grabacion.
- `AsignacionAsistente`: cobertura de una instancia.
- `Liquidacion` / `LiquidacionDetalle`: cierre economico.

## Por que no se llama todo Meet

Aunque el flujo nuevo sea Google Meet, el dominio no debe depender del proveedor.
Eso permite:

- conservar Zoom como historico;
- cambiar la integracion Meet sin migrar todo el dominio;
- registrar eventos manuales o externos;
- auditar payloads de proveedor sin contaminar solicitudes academicas.

## Usuarios y roles

`Usuario.id` es el nombre de acceso local y `passwordHash` almacena solamente el
hash de la contrasena. Las cuentas Google FLACSO no reemplazan esa identidad:
se vinculan de uno a muchos mediante `CuentaGoogleFlacso`.

Administracion mantiene la lista de correos institucionales autorizados. El
`providerAccountId` puede estar vacio mientras la cuenta esta preautorizada y se
completa en el primer login OAuth. Todo usuario debe conservar al menos un
metodo de acceso: una cuenta FLACSO o una contrasena.

Los roles son `ADMINISTRACION`, `ASISTENTE` y `DOCENTE`. El rol neutral
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
- opcionalmente un `Asistente`, cuando se solicite asistencia;
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
| Asistente asignado | `AsignacionAsistente` |

Los campos de modalidad, zona horaria, asistencia y grabacion en
`SolicitudSala` expresan el pedido original. Sus equivalentes en
`InstanciaSala` expresan la programacion efectiva y pueden diferir por
ocurrencia. No son dos fuentes para el mismo hecho.

Los importes y tarifas guardados en asignaciones y liquidaciones son snapshots
del acuerdo aplicado en ese momento. No se recalculan desde la tarifa vigente,
porque eso alteraria la historia economica.

## Zoom historico

Zoom aparece como valor de `TipoProveedor.ZOOM_HISTORICO` y `OrigenGrabacion.ZOOM_HISTORICO`.
No hay modelos centrales `EventoZoom`, `CuentaZoom` ni `AsistenteZoom`.
