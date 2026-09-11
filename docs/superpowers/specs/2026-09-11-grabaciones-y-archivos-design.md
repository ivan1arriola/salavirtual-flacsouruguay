# Rediseño de Grabaciones y Archivos Meet

- **Ruta principal**: `/grabaciones`
- **Rutas secundarias**: `/reuniones/[solicitudId]`, `/api/v1/reuniones/sincronizar-archivos`
- **Fecha**: 11 de setiembre de 2026
- **Estado**: Especificación de Diseño (Design Spec)

---

## 1. Objetivo

Transformar `/grabaciones` en una biblioteca multimedia y centro de archivos institucional claro, intuitivo y automatizado. Cualquier archivo generado en una reunión de Google Meet (grabación de video MP4, lista de asistencia, transcripción y notas inteligentes de Gemini) debe descubrirse, organizarse en Google Drive y quedar accesible en la plataforma sin requerir sincronizaciones manuales ni mostrar pantallas de error.

El rediseño respeta las reglas de negocio de FLACSO Uruguay, la separación de roles (Administración, Docente, Asistente Técnico), el estándar visual con tokens CSS institucionales y la infraestructura de despliegue en EC2 con Node 24 y systemd.

---

## 2. Problemas Observados

1. **Confusión sobre quién inicia la grabación**:
   Existe la creencia errónea de que si un participante o co-host presiona "Grabar" en Meet, la grabación se pierde o se guarda en su cuenta privada. En Google Workspace, la grabación siempre se guarda en el Google Drive de la cuenta de sala organizadora (`salaXX@flacso.edu.uy`). Sin embargo, el sistema ignoraba la búsqueda de grabaciones si la reunión no tenía marcada previamente la casilla `requiereGrabacion: true`.
2. **Pantallas y pancartas de error alarmantes**:
   Al ingresar a `/grabaciones`, la interfaz recibe al usuario con un bloque rojo/amarillo de "Incidencias de grabación" (`.recording-incidents`). Encuentros donde el docente optó por no grabar o donde Google aún está renderizando el archivo son etiquetados agresivamente como fallas del sistema ("No se grabó", "Meet no registró una sesión de grabación").
3. **Dependencia de sincronización manual**:
   La actualización depende de que un usuario pulse el botón "Sincronizar archivos", ejecutando un proceso HTTP síncrono pesado que genera tiempos de espera (`504 Gateway Timeout`) o cuotas de API excedidas.
4. **Falta de buscador y filtros**:
   La vista lista los archivos cronológicamente sin posibilidad de filtrar por materia, programa académico, docente o tipo de archivo (solo videos vs. asistencias).
5. **Aislamiento de la ficha de reunión**:
   En `/reuniones/[solicitudId]`, los encuentros pasados no muestran accesos directos a la grabación o asistencia, obligando a los docentes a buscar manualmente en `/grabaciones`.

---

## 3. Arquitectura de Información y Flujo de Datos

```
+-------------------------------------------------------------------------------+
|                                 GOOGLE MEET                                   |
|   Cualquier participante autorizado presiona "Iniciar grabación"              |
+---------------------------------------+---------------------------------------+
                                        |
                                        v
+-------------------------------------------------------------------------------+
|                       GOOGLE WORKSPACE DRIVE (ORGANIZADOR)                    |
|   Google genera el MP4 en la carpeta "Meet Recordings" del host salaXX        |
|   Google Meet API v2 crea: conferenceRecords/{id}/recordings/{recordingId}   |
+---------------------------------------+---------------------------------------+
                                        |
                                        v
+-------------------------------------------------------------------------------+
|                     CRON AUTOMÁTICO (Cada 10 min en EC2)                      |
|   1. Consulta GET /api/v1/reuniones/sincronizar-archivos (Bearer $CRON_SECRET)|
|   2. Impersona salaXX con la Service Account (Domain-Wide Delegation)         |
|   3. Mueve el video a la carpeta institucional: "driveDestinationId/Clase"    |
|   4. Genera lista de asistencia oficial como Google Doc en esa carpeta        |
|   5. Registra los archivos en la tabla `ArchivoReunion` de PostgreSQL         |
+---------------------------------------+---------------------------------------+
                                        |
                                        v
+-------------------------------------------------------------------------------+
|                             INTERFAZ DE USUARIO                               |
|   - /grabaciones: Biblioteca interactiva con buscador en vivo y filtros       |
|   - /reuniones/[solicitudId]: Enlaces directos a video y asistencia en ficha  |
+-------------------------------------------------------------------------------+
```

---

## 4. Principios y Reglas de Negocio

1. **Captura Universal e Idempotente**:
   Toda reunión finalizada con código Meet que tenga grabaciones o asistencias producidas en Google Cloud será sincronizada, independientemente de si la solicitud inicial tenía `requiereGrabacion: true` o `false`.
2. **Cero Pantallas de Incidencias**:
   Se elimina por completo el bloque `.recording-incidents`. La ausencia de grabación no es un error de software. Los estados en procesamiento se muestran con insignias sutiles ("Procesando en Google"), nunca en rojo ni bloqueando la pantalla.
3. **Sincronización por Cron Desatendida**:
   Se implementa un timer de systemd en EC2 (`salavirtual-artifacts-sync.timer`) que ejecuta la sincronización cada 10 minutos. El botón manual se reemplaza por un indicador de estado: `Sincronización automática activa · Última pasada: hace X min`.
4. **Multi-Artefactos Uniformes**:
   Se da soporte visual y funcional a los 4 tipos de artefactos:
   - `GRABACION`: Archivo `.mp4` con reproductor integrado en Drive y descarga.
   - `LISTA_ASISTENCIA`: Documento Google Doc con el membrete institucional, participantes, horas exactas de ingreso/egreso y minutos de permanencia.
   - `TRANSCRIPCION`: Documento Google Doc con subtítulos y transcripción de voz.
   - `NOTAS`: Documento Google Doc con minutas y tareas generadas por Gemini en Meet.

---

## 5. Diseño de Interfaz y Componentes

### 5.1. Cabecera y Resumen
- Título: **Grabaciones y archivos**
- Subtítulo: Cantidad de archivos disponibles agrupados por cantidad de encuentros.
- Botón principal: **Carpeta general en Google Drive** (abre `driveDestinationId`).
- Barra de estado de fondo: `Sincronización automática activa (cada 10 min) · Última pasada: hace X min`.
- Píldoras de resumen métrico:
  - 🎥 Grabaciones de video (contador)
  - 👥 Listas de asistencia (contador)
  - 📄 Transcripciones (contador)
  - 📝 Notas de Gemini (contador)

### 5.2. Barra de Búsqueda y Filtros (`RecordingsLibrary.tsx`)
Componente interactivo de cliente:
- **Buscador en tiempo real**: Campo de texto que filtra instantáneamente por:
  - Título del encuentro o clase.
  - Nombre del programa académico o materia.
  - Nombre o apellido del docente.
- **Pestañas de filtrado**:
  - `Todos los archivos`
  - `Solo grabaciones`
  - `Solo asistencia`
  - `Transcripciones y notas`
- *(Solo Administradores)*: Filtro discreto de auditoría: `Mostrar clases con grabación requerida pendiente`.

### 5.3. Tarjeta de Encuentro (`.recording-meeting-card`)
Cada encuentro completado se representa en una tarjeta limpia:
- **Encabezado**:
  - Fecha y hora formateada en hora local de Montevideo.
  - Nombre del programa académico y materia.
  - Nombre completo del docente a cargo.
  - Enlace: `Abrir carpeta en Drive ↗`.
- **Cuadrícula de Archivos**:
  - **Tarjeta Video**: Ícono de video institucional, peso en MB/GB, botón destacado `Reproducir grabación ↗`.
  - **Tarjeta Asistencia**: Ícono de usuarios, etiqueta `Lista de asistencia`, botón `Ver documento ↗`.
  - **Tarjeta Transcripción / Notas**: Ícono de documento, botón `Ver notas ↗`.
- **Estado de Procesamiento**:
  - Si el encuentro finalizó hace menos de 2 horas y el video está en renderizado de Google:
    `⏳ Video procesando en Google Meet (demora habitual: 15-45 min)`.

### 5.4. Integración en `/reuniones/[solicitudId]`
En la vista de gestión de serie de encuentros, cada encuentro con temporalidad `PASADO` incluye:
- Fila con botones compactos:
  - `🎥 Grabación (480 MB)` (si existe)
  - `👥 Asistencia (18 alumnos)` (si existe)
  - `📁 Carpeta Drive`

---

## 6. Alcance por Rol

- **ADMINISTRACIÓN**: Acceso global a todos los programas, salas y carpetas. Botón secundario para forzar sincronización manual de diagnóstico.
- **DOCENTE**: Acceso limitado exclusivamente a los encuentros de sus propios programas académicos. Enlaces directos a sus grabaciones y asistencias para compartir con estudiantes.
- **ASISTENTE TÉCNICO**: Acceso a las grabaciones y asistencias de los encuentros donde estuvo asignado.

