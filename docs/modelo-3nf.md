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

Los roles son `ADMINISTRACION`, `ASISTENTE` y `DOCENTE`. El rol neutral
`ADMINISTRACION` absorbe todas las funciones que antes correspondian a
`ADMINISTRADOR` y `CONTADURIA`.

La fusion de dos docentes solo puede ejecutarla Administracion. Se trasladan
cuentas Google, alias, autoria de solicitudes y asociaciones a programas; el
usuario de origen queda inactivo y enlazado al destino para no perder historia.

## Zoom historico

Zoom aparece como valor de `TipoProveedor.ZOOM_HISTORICO` y `OrigenGrabacion.ZOOM_HISTORICO`.
No hay modelos centrales `EventoZoom`, `CuentaZoom` ni `AsistenteZoom`.
