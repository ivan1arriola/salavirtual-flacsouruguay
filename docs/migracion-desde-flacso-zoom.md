# Migracion desde FLACSO Zoom

## Objetivo

Reemplazar la operacion Zoom por una plataforma Meet, preservando datos historicos para consulta y auditoria.

## Mapeo inicial

| Plataforma Zoom actual | Gestor Meet nuevo |
| --- | --- |
| `User` | `Persona` + `Usuario` |
| `Docente` | `Docente` |
| `AsistenteZoom` | `Asistente` |
| `Programa` | `Programa` |
| `CuentaZoom` | `CuentaProveedor` con proveedor `ZOOM_HISTORICO` |
| `SolicitudSala` | `SolicitudSala` |
| `EventoZoom` | `InstanciaSala` + `EventoProveedor` |
| `Liquidacion` | `Liquidacion` |
| `LiquidacionDetalle` | `LiquidacionDetalle` |

## Fases

1. Congelar creacion de nuevas reuniones Zoom.
2. Exportar usuarios, docentes, asistentes, programas, solicitudes, eventos y liquidaciones.
3. Normalizar personas y usuarios, deduplicando por email/documento.
4. Crear proveedor `GOOGLE_MEET` operativo y `ZOOM_HISTORICO` solo consulta.
5. Importar eventos Zoom como `InstanciaSala` + `EventoProveedor`.
6. Importar grabaciones como `Grabacion` con origen `ZOOM_HISTORICO`.
7. Validar liquidaciones mensuales contra los reportes existentes.
8. Activar nuevas solicitudes solamente sobre Google Meet.

## Pendientes tecnicos

- Definir estrategia exacta para Google Calendar API y creacion de Meet links.
- Escribir importador Prisma desde la base Zoom actual.
- Portar autenticacion y usuarios activos.
- Rehacer pantallas criticas con UI ligera.
- Mantener endpoints de consulta historica para reportes existentes.
