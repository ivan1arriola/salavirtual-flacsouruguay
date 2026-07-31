# Modelo 3NF

## Separaciones centrales

El modelo evita repetir datos derivados y separa responsabilidades:

- `Persona`: identidad humana.
- `Usuario`: credenciales, rol y acceso.
- `Docente` / `Asistente`: perfiles operativos sobre una persona.
- `UnidadAcademica` / `Programa`: estructura institucional.
- `SolicitudSala`: pedido academico.
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

## Zoom historico

Zoom aparece como valor de `TipoProveedor.ZOOM_HISTORICO` y `OrigenGrabacion.ZOOM_HISTORICO`.
No hay modelos centrales `EventoZoom`, `CuentaZoom` ni `AsistenteZoom`.
