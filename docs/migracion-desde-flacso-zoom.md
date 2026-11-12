# Migracion desde FLACSO Zoom

## Objetivo

Reemplazar la operacion Zoom por una plataforma Meet, preservando datos historicos para consulta y auditoria.

## Mapeo inicial

| Plataforma Zoom actual    | Gestor Meet nuevo                                |
| ------------------------- | ------------------------------------------------ |
| `User`                    | `Usuario` + alias y cuentas Google               |
| `Docente`                 | `Docente`                                        |
| `AsistenteZoom`           | `AsistenteTecnico`                               |
| `Programa`                | `Programa`                                       |
| relacion docente/programa | `DocentePrograma`                                |
| `CuentaZoom`              | `CuentaProveedor` con proveedor `ZOOM_HISTORICO` |
| `SolicitudSala`           | `SolicitudSala`                                  |
| `EventoZoom`              | `InstanciaSala` + `EventoProveedor`              |
| `Liquidacion`             | `LiquidacionAsistenciaTecnica`                   |
| `LiquidacionDetalle`      | `DetalleLiquidacionAsistenciaTecnica`            |

## Fases

1. Congelar creacion de nuevas reuniones Zoom.
2. Exportar usuarios, docentes, asistentes, programas, solicitudes, eventos y liquidaciones.
3. Normalizar personas y usuarios, deduplicando por email/documento.
4. Crear proveedor `GOOGLE_MEET` operativo y `ZOOM_HISTORICO` solo consulta.
5. Importar eventos Zoom como `InstanciaSala` + `EventoProveedor`.
6. Importar grabaciones como `Grabacion` con origen `ZOOM_HISTORICO`.
7. Validar liquidaciones mensuales contra los reportes existentes.
8. Activar nuevas solicitudes solamente sobre Google Meet.

## Importacion ejecutada

La importacion desde la base anterior se ejecuto con reconciliacion de conteos:

| Registro                           | Importados |
| ---------------------------------- | ---------: |
| Programas                          |          9 |
| Solicitudes                        |         95 |
| Reuniones/instancias               |        218 |
| Cuentas host Zoom historicas       |         14 |
| Codigos de reunion disponibles     |         97 |
| Asignaciones de asistencia totales |         84 |

Las 218 reuniones quedaron vinculadas exclusivamente al proveedor
`ZOOM_HISTORICO`. De las reuniones importadas, 200 estan programadas, 15
canceladas y 3 finalizadas. Se consolidaron dos registros heredados que
representaban la misma asignacion de asistente.

De las 84 asignaciones, 68 no estan canceladas y 16 se preservan como
canceladas. Hay tres reuniones marcadas como requeridas de asistencia sin
ninguna asignacion importada. Deben quedar visibles para revision de
Administracion.

## Comparacion y alcance

La plataforma web anterior aportaba recurrencia, finalidad academica,
responsable, capacidad, cancelaciones, comentarios y costos. Esos datos se
conservaron en el modelo nuevo aunque algunos registros historicos no los
completen.

El sincronizador de escritorio solo agrega el flujo de grabaciones y Drive; no
define programa, docente, host o cohost, por lo que no requiere mas campos en el
nucleo de reuniones. No se importa el enlace privilegiado `startUrl` de Zoom.
Los dias se calculan desde cada fecha y zona horaria en lugar de duplicarlos.

## Migracion de roles

| Rol anterior     | Rol nuevo           |
| ---------------- | ------------------- |
| `ADMINISTRADOR`  | `ADMINISTRACION`    |
| `CONTADURIA`     | `ADMINISTRACION`    |
| `SOPORTE_ZOOM`   | `ASISTENTE_TECNICO` |
| `ASISTENTE_ZOOM` | `ASISTENTE_TECNICO` |
| `DOCENTE`        | `DOCENTE`           |

Los usuarios de Contabilidad no se eliminan durante la importacion: se migran a
`ADMINISTRACION`, que recibe sus permisos y flujos.

## Acceso de usuarios migrados

- Administracion define los correos `@flacso.edu.uy` permitidos para cada usuario.
- Una cuenta preautorizada se vincula al identificador OAuth en su primer login.
- Los usuarios con al menos una cuenta FLACSO pueden operar sin contrasena.
- Los usuarios sin cuenta FLACSO reciben la contrasena temporal y deben cambiarla.
  Esa contrasena inicial queda guardada cifrada para poder preparar los correos
  de alta; no se guarda como texto plano.
- Las cuentas Google externas se conservan como correo historico, sin permiso de login.

## Pendientes tecnicos

- Definir estrategia exacta para Google Calendar API y creacion de Meet links.
- Importar grabaciones y liquidaciones historicas.
- Completar la recuperacion y cambio obligatorio de contrasena.
- Rehacer pantallas criticas con UI ligera.
- Mantener endpoints de consulta historica para reportes existentes.
