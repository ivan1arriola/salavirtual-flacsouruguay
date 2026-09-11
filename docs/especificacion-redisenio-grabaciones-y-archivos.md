# Especificación Técnica Revisada: Rediseño Arquitectónico, Lógico y Visual de Grabaciones y Archivos Meet

- **Ruta de la aplicación**: `/grabaciones` (`http://localhost:8000/grabaciones` / `https://salavirtual.flacso.edu.uy/grabaciones`)
- **Estado**: Especificación revisada para implementación
- **Fecha**: 11 de setiembre de 2026
- **Audiencia**: Agentes de desarrollo, arquitectos de software y equipo de FLACSO Uruguay

---

## 1. Resumen Ejecutivo y Objetivos

### 1.1. Diagnóstico del Estado Actual

El módulo actual de grabaciones presenta fricciones de experiencia de usuario y algunos comportamientos operativos que conviene corregir, pero la integración base con Google Meet ya está avanzada.

Actualmente el repositorio ya dispone de:

- descubrimiento de `conferenceRecord`;
- consulta de grabaciones de Meet;
- consulta de transcripciones;
- consulta de notas inteligentes cuando están disponibles;
- generación de lista de asistencia a partir de participantes y sesiones;
- movimiento de archivos a Google Drive institucional;
- persistencia idempotente en `ArchivoReunion`;
- estados diferenciados de grabación `AUSENTE`, `PROCESANDO` y `GENERADA`;
- reutilización de `conferenceRecordName` en sincronizaciones posteriores.

Por tanto, este trabajo no debe reconstruir desde cero la integración con Meet. Debe consolidar el comportamiento existente, automatizar la sincronización y rediseñar la experiencia visual.

Las fricciones principales son:

1. **Confusión sobre quién inicia la grabación**  
   Docentes y asistentes técnicos serán cohosts y podrán iniciar la grabación. Esto no debe modificar la lógica de captura de Sala Virtual.

   La regla importante es:

   **La identidad de quien pulsa "Iniciar grabación" no determina el propietario institucional del archivo. La grabación queda asociada a la conferencia y al organizador real de la reunión.**

   En las reuniones creadas correctamente por Sala Virtual, el organizador real debe ser una cuenta institucional `salaXX@flacso.edu.uy`.

2. **Pantallas y banners de incidencia demasiado alarmantes**  
   La interfaz actual agrupa como incidencias tanto videos todavía procesándose como reuniones donde se había solicitado grabación pero finalmente no se grabó.

3. **Dependencia visual de sincronización manual**  
   Existe `MeetArtifactsButton` y un endpoint que permite sincronizar manualmente. La sincronización automática debe convertirse en el mecanismo operativo normal.

4. **Falta de buscador y filtros**  
   No existe una experiencia de biblioteca que permita localizar rápidamente materiales por programa, título, docente o tipo de archivo.

5. **Desconexión con la ficha de reunión**  
   Los encuentros pasados no muestran directamente sus grabaciones, asistencias y demás materiales.

### 1.2. Objetivos del Rediseño

- **Biblioteca Multimedia Intuitiva**: convertir `/grabaciones` en una biblioteca navegable, con búsqueda y filtros.
- **Captura Universal e Idempotente**: cualquier artefacto realmente generado por una reunión operativa de Sala Virtual debe descubrirse aunque `requiereGrabacion` sea `false`.
- **Sincronización Automática**: ejecutar periódicamente el proceso mediante `systemd timer`.
- **Cero Alarmismo Visual**: los estados normales de procesamiento no deben mostrarse como errores.
- **Integración Multiartefacto**: mantener un manejo uniforme de grabaciones, asistencias, transcripciones y notas.
- **Auditoría separada de la experiencia docente**: la intención `requiereGrabacion` sigue siendo útil para Administración, pero no debe condicionar el descubrimiento técnico de archivos.

---

## 2. Mecánica y Arquitectura de Grabaciones en Google Meet

### 2.1. Invariante de organizador y cohosts

La arquitectura debe asumir esta relación:

```text
Cuenta institucional salaXX
        │
        │ organizador real del evento
        ▼
Google Calendar / Google Meet
        │
        ├── Docente → cohost
        ├── Asistente técnico → cohost
        └── Otros cohosts autorizados
                 │
                 │ cualquiera de ellos puede iniciar la grabación
                 ▼
          conferenceRecord
                 │
                 ▼
          Recording resource
                 │
                 ▼
       archivo de Google Drive
```

La aplicación **no debe intentar determinar quién pulsó el botón de grabación** para decidir qué archivo capturar.

La fuente de verdad técnica es:

- el `conferenceRecord`;
- los recursos `recordings`;
- el organizador real de la reunión;
- la cuenta `CuentaProveedor.emailOrganizador` que Sala Virtual espera utilizar como `subject`.

### 2.2. Regla de seguridad sobre el organizador

No asumir simplemente que toda reunión pertenece a `salaXX`.

Antes de considerar una reunión operativa válida, la lógica existente debe mantener la invariancia:

```text
organizador esperado = cuentaProveedor.emailOrganizador
```

Para nuevas reuniones creadas por Sala Virtual, ese organizador debe corresponder a una de las cuentas de sala institucionales.

Las reuniones históricas pueden haber sido creadas por otras credenciales o proyectos. No deben forzarse artificialmente al flujo moderno si el acceso requiere credenciales Legacy.

### 2.3. Estados de grabación

El adaptador actual ya distingue:

```text
AUSENTE
PROCESANDO
GENERADA
```

Estos estados deben conservarse.

Interpretación:

- `AUSENTE`: Google no informa un recurso de grabación.
- `PROCESANDO`: existe un recurso de grabación, pero todavía no tiene archivo final `FILE_GENERATED`.
- `GENERADA`: existe un archivo listo para sincronizar.

No colapsar `AUSENTE` y `PROCESANDO` en un único estado.

### 2.4. Regla de captura universal

`requiereGrabacion` representa intención académica o administrativa.

No debe utilizarse para decidir si se consulta Google Meet.

Regla:

```text
reunión finalizada con conferenceRecord
            │
            ▼
consultar siempre artefactos
            │
            ├── grabación generada → sincronizar
            ├── grabación procesando → reintentar
            ├── transcripción → sincronizar
            ├── notas → sincronizar
            └── asistencia → generar/sincronizar
```

Por tanto:

- `requiereGrabacion = true` + sin grabación puede alimentar una vista de auditoría;
- `requiereGrabacion = false` + grabación existente igualmente debe sincronizarla;
- `requiereGrabacion` no bloquea `obtenerArtefactos()`.

### 2.5. Almacenamiento en Google Drive

Los archivos se consolidan bajo:

```text
ConfiguracionGoogleWorkspace.driveDestinationId
```

Estructura conceptual:

```text
📁 Unidad Central de Grabaciones FLACSO
   └── 📁 YYYY-MM-DD - Título del encuentro
         ├── 🎥 ..._video_01_....mp4
         ├── 👥 ..._lista-asistencia_01_... (Google Doc)
         ├── 📄 ..._transcripcion_01_... (Google Doc)
         └── 📝 ..._notas_01_... (Google Doc)
```

La creación de carpetas y el registro de artefactos deben mantenerse idempotentes.

---

## 3. Sincronización Automática por `systemd`

### 3.1. Mantener API manual y automática separadas por autenticación

El endpoint actual admite dos formas de ejecución:

- `POST`: ejecución manual con sesión y permisos;
- `GET`: ejecución desatendida autenticada mediante `CRON_SECRET`.

No cambiar esta separación sin necesidad.

La ejecución automática utilizará `GET`.

La ejecución manual para Administración podrá seguir utilizando `POST`.

### 3.2. Nuevas unidades `systemd`

Crear:

```text
infra/ec2/salavirtual-artifacts-sync.service
infra/ec2/salavirtual-artifacts-sync.timer
```

Servicio:

```ini
[Unit]
Description=Sala Virtual FLACSO - Sincronización automática de artefactos Meet
After=salavirtual.service
Requires=salavirtual.service

[Service]
Type=oneshot
EnvironmentFile=/srv/apps/salavirtual-flacso/shared/.env.production
ExecStart=/bin/sh -c '/usr/bin/curl --fail --silent --show-error --max-time 300 -H "Authorization: Bearer $CRON_SECRET" http://127.0.0.1:3101/api/v1/reuniones/sincronizar-archivos'
```

Timer:

```ini
[Unit]
Description=Sala Virtual FLACSO - Timer de sincronización de artefactos Meet

[Timer]
OnCalendar=*:0/10
Persistent=true
RandomizedDelaySec=20
Unit=salavirtual-artifacts-sync.service

[Install]
WantedBy=timers.target
```

### 3.3. El despliegue debe instalar también estas unidades

No basta con agregar los archivos al repositorio.

El flujo actual de despliegue instala explícitamente `salavirtual.service`, por lo que debe modificarse `infra/ec2/deploy.sh` para copiar también:

```text
salavirtual-artifacts-sync.service
salavirtual-artifacts-sync.timer
```

y ejecutar:

```bash
systemctl daemon-reload
systemctl enable salavirtual-artifacts-sync.timer
systemctl restart salavirtual-artifacts-sync.timer
```

El deploy no debe reiniciar innecesariamente un `oneshot` en ejecución.

Después del despliegue comprobar:

```bash
systemctl status salavirtual-artifacts-sync.timer --no-pager
systemctl list-timers salavirtual-artifacts-sync.timer
```

### 3.4. Estrategia de selección por ventanas

El endpoint actualmente trabaja sobre reuniones recientes y revisiones periódicas.

Refactorizar la selección para hacer explícitas tres ventanas.

#### Ventana caliente: 0 a 4 horas

Procesar reuniones finalizadas en las últimas 4 horas con:

- `codigoReunion != null`;
- estado distinto de `CANCELADA`;
- `archivosSincronizadosAt == null` o artefactos pendientes.

Revisarlas en cada ejecución del timer.

#### Ventana intermedia: 4 a 48 horas

Procesar reuniones que:

- aún tengan `archivosSincronizadosAt == null`;
- tengan `errorArchivos != null`;
- o necesiten revisar un artefacto `PROCESANDO`.

#### Ventana de cierre: más de 48 horas

Distinguir obligatoriamente dos casos.

**Caso A — Google nunca informó una grabación**

Si el estado técnico continúa siendo `AUSENTE`, se permite cerrar el ciclo:

```text
archivosSincronizadosAt = now
errorArchivos = null
```

aunque se conserve información de auditoría a partir de `requiereGrabacion`.

**Caso B — Google informó una grabación pero sigue sin generar archivo**

Si el estado es `PROCESANDO`, **no marcar silenciosamente como completado únicamente porque pasaron 48 horas**.

Ese caso representa una anomalía técnica.

Debe:

- conservarse para revisión administrativa;
- evitar reintentos cada 10 minutos indefinidamente;
- registrarse como error o estado de atención técnica;
- continuar siendo reintentable manualmente.

No tratar `PROCESANDO > 48h` como equivalente a `AUSENTE`.

### 3.5. Evitar reintentos infinitos

La selección automática debe excluir eventos que ya fueron cerrados limpiamente.

Para anomalías técnicas antiguas, reducir la frecuencia de reintento o dejarlas para reparación manual.

No consumir permanentemente cuota de Google por una reunión que nunca produjo artefactos.

### 3.6. Estado de última sincronización

Si la UI muestra:

```text
Última sincronización: hace X minutos
```

el dato debe proceder de un estado persistido real.

Opción mínima recomendada:

añadir a `ConfiguracionGoogleWorkspace`:

```prisma
ultimaSincronizacionArtefactosAt DateTime?
```

Actualizar el campo al completar una ejecución automática o manual del sincronizador.

No derivar este dato de `updatedAt` de reuniones individuales.

Si se considera innecesario modificar el schema, la primera versión puede mostrar únicamente:

```text
Sincronización automática activa · cada 10 minutos
```

y posponer el indicador de última pasada.

---

## 4. Multi-Artefactos de Reunión

La tabla `ArchivoReunion` ya es la entidad adecuada para indexar artefactos sincronizados.

Tipos actuales relevantes:

| Tipo | Fuente | Destino |
| --- | --- | --- |
| `GRABACION` | `conferenceRecords/{id}/recordings` | MP4 en Drive |
| `TRANSCRIPCION` | `conferenceRecords/{id}/transcripts` | Google Doc |
| `LISTA_ASISTENCIA` | participantes + sesiones | Google Doc generado |
| `NOTAS` | `conferenceRecords/{id}/smartNotes` | Google Doc |

No crear un segundo modelo paralelo para los artefactos modernos.

### 4.1. Idempotencia

Mantener como claves técnicas:

```text
EventoProveedor + externalResourceName
driveFileId único
```

Una ejecución repetida no debe duplicar registros ni archivos.

### 4.2. Lista de asistencia

El comportamiento actual ya genera un Google Doc desde participantes y `participantSessions`.

Conservar este flujo.

Revisar únicamente su tratamiento de estados incompletos.

Actualmente una asistencia todavía incompleta después de 24 horas genera error.

Antes de cambiar esta regla, decidir explícitamente:

- si ausencia total de participantes debe seguir siendo una anomalía;
- si se desea cerrar silenciosamente;
- o si debe aparecer solo en una vista administrativa.

No mezclar este cambio con la eliminación visual de incidencias de grabación sin una decisión de negocio explícita.

---

## 5. Rediseño de `/grabaciones`

### 5.1. Eliminar alarmismo, no observabilidad

Eliminar de la experiencia normal de docentes:

- banners rojos por “no se grabó”;
- estados normales de procesamiento tratados como fallas;
- paneles de incidencias mezclados con la biblioteca.

Pero **no eliminar la información técnica ni la posibilidad de auditoría administrativa**.

### 5.2. Estados visuales

Para una grabación `PROCESANDO` reciente:

```text
Video procesándose en Google Meet
```

No presentar un tiempo exacto garantizado.

Puede utilizarse una ayuda como:

```text
Google todavía está preparando el archivo. La plataforma volverá a comprobarlo automáticamente.
```

Para una reunión sin grabación:

- no mostrar una tarjeta de video;
- no mostrar error al docente;
- si `requiereGrabacion = true`, permitir que Administración la encuentre mediante auditoría.

### 5.3. Biblioteca

La pantalla debe agrupar por encuentro.

Cada tarjeta debe mostrar:

- fecha y hora;
- programa;
- título;
- docente;
- carpeta de Drive;
- archivos disponibles.

### 5.4. Buscador

Crear:

```text
src/components/recordings-library.tsx
```

Client Component responsable únicamente de:

- texto de búsqueda;
- filtros;
- orden visual.

La consulta y permisos siguen resolviéndose en Server Component.

Buscar por:

- título;
- programa;
- docente.

Filtros:

- Todos;
- Video;
- Asistencia;
- Transcripción;
- Notas.

No hacer nuevas consultas a Google desde el buscador.

### 5.5. Auditoría administrativa

Separar una función específica:

```ts
listarAuditoriaGrabacionesFaltantes(...)
```

Su regla puede basarse en:

```text
requiereGrabacion = true
+ reunión finalizada
+ estado técnico AUSENTE
+ sin ArchivoReunion GRABACION
```

No considerar `PROCESANDO` como “no realizada”.

---

## 6. Integración en `/reuniones/[solicitudId]`

### 6.1. Carga de archivos

Actualmente la consulta de `eventosProveedor` no incluye `archivos`.

Modificarla para obtener únicamente los campos requeridos por UI.

Evitar `include: { archivos: true }` si termina trayendo datos innecesarios.

Preferir:

```ts
archivos: {
  select: {
    id: true,
    tipo: true,
    nombre: true,
    mimeType: true,
    tamanoBytes: true,
    webViewUrl: true,
    driveFileId: true
  }
}
```

También seleccionar `driveFolderId`.

### 6.2. DTO del encuentro

Extender `meetingViews` con una estructura explícita para materiales.

Ejemplo conceptual:

```ts
materials: {
  folderUrl: string | null;
  files: readonly MeetingMaterial[];
  recordingStatus: "AUSENTE" | "PROCESANDO" | "GENERADA" | null;
}
```

No pasar objetos Prisma completos al Client Component.

### 6.3. UI para encuentros pasados

En `MeetingDetailManager`, para `temporalidad === "PASADO"`:

mostrar:

- grabación;
- asistencia;
- transcripción;
- notas;
- carpeta del encuentro.

Si existe una grabación procesándose:

```text
Grabación en procesamiento
```

Si no existe grabación:

- no mostrar error;
- simplemente omitir el acceso al video.

---

## 7. Alcance y Permisos por Rol

Conservar la lógica existente de alcance de grabaciones como punto de partida.

### Administración

- acceso global;
- sincronización manual;
- auditoría de grabaciones solicitadas y ausentes;
- acceso a carpeta institucional.

### Docente

Mantener el alcance actual de programas donde está asociado como docente, salvo que exista una decisión de producto para limitarlo exclusivamente a solicitudes concretas.

Puede:

- ver materiales;
- abrir archivos;
- consultar reuniones de su alcance.

No conceder privilegios de sincronización adicionales sin revisar `puedeSincronizarGrabaciones`.

### Asistente técnico

Acceso a encuentros donde tenga asignación activa relevante.

No ampliar el alcance global por haber sido cohost.

El rol de cohost en Google Meet y el permiso de lectura dentro de Sala Virtual son conceptos distintos.

---

## 8. Plan de Implementación

### Fase 1: Tests de reglas antes de modificar comportamiento

Agregar o ajustar pruebas para demostrar las invariantes actuales y deseadas.

#### Test obligatorio 1: grabación no solicitada pero existente

```text
GIVEN
  requiereGrabacion = false
  reunión finalizada
  Google devuelve recording FILE_GENERATED

WHEN
  sincronizarArtefactosMeet()

THEN
  crea ArchivoReunion tipo GRABACION
  mueve el archivo
  no genera error
```

#### Test obligatorio 2: grabación procesando

```text
GIVEN
  existe recurso Recording
  estado != FILE_GENERATED

THEN
  estado = ARTEFACTOS_PENDIENTES
  grabacion = PENDIENTE
  errorArchivos = null
```

#### Test obligatorio 3: ausencia real

```text
GIVEN
  no existe recurso Recording
  conferencia finalizada

THEN
  la grabación se considera AUSENTE
  pero otros artefactos pueden sincronizarse
```

#### Test obligatorio 4: idempotencia

Ejecutar dos veces la sincronización con los mismos `resourceName`.

Resultado:

- sin duplicados;
- sin mover nuevamente archivos ya conocidos.

### Fase 2: Refinar selección automática

Modificar:

```text
app/api/v1/reuniones/sincronizar-archivos/route.ts
```

Responsabilidades:

- selección de eventos;
- ventanas temporales;
- límite por ejecución;
- autenticación cron/manual;
- resumen de resultados.

No trasladar lógica de Google a esta ruta.

### Fase 3: Ajustar servicio de sincronización

Modificar:

```text
src/modules/meet/sincronizar-artefactos.service.ts
```

Objetivo:

- conservar captura universal;
- hacer explícito que `requiereGrabacion` no controla el escaneo;
- distinguir cierre `AUSENTE` de anomalía `PROCESANDO`;
- conservar `errorArchivos = null` durante procesamiento normal.

No reimplementar funcionalidades que ya existen.

### Fase 4: Infraestructura automática

Crear:

```text
infra/ec2/salavirtual-artifacts-sync.service
infra/ec2/salavirtual-artifacts-sync.timer
```

Modificar:

```text
infra/ec2/deploy.sh
docs/despliegue-ec2.md
```

El deploy debe instalar las unidades.

### Fase 5: Rediseño de biblioteca

Crear:

```text
src/components/recordings-library.tsx
```

Modificar:

```text
app/(gestion)/grabaciones/page.tsx
app/(gestion)/grabaciones/grabaciones.css
src/modules/meet/grabaciones.adapter.ts
```

Objetivo:

- biblioteca;
- buscador;
- filtros;
- sin panel de incidencias para docentes;
- auditoría separada para Administración.

### Fase 6: Integración en detalle de reunión

Modificar:

```text
app/(gestion)/reuniones/[solicitudId]/page.tsx
src/components/meeting-detail-manager.tsx
```

Agregar DTO de materiales por encuentro.

### Fase 7: Validación

Ejecutar tests específicos primero.

Después:

```bash
npm run check
npm test
npm run validate:schema
npm run build
```

Si se modifica Prisma para guardar última sincronización:

1. crear migración;
2. revisar SQL;
3. ejecutar validaciones;
4. recordar que `main` exitoso despliega automáticamente y ejecuta `prisma migrate deploy`.

---

## 9. Criterios de Aceptación

1. **Grabación universal**  
   Una grabación existente se sincroniza aunque `requiereGrabacion` sea `false`.

2. **Cohost independiente del almacenamiento**  
   El flujo no depende de identificar qué cohost pulsó “Grabar”.

3. **Organizador institucional preservado**  
   Las reuniones nuevas siguen usando la cuenta `salaXX` seleccionada como organizador operativo.

4. **Procesamiento no es error**  
   Una grabación `PROCESANDO` no genera `errorArchivos`.

5. **Ausencia no genera alarma docente**  
   Una reunión sin video simplemente no muestra tarjeta de grabación.

6. **Auditoría administrativa**  
   Administración puede localizar reuniones con `requiereGrabacion = true` que finalmente no generaron grabación.

7. **Sincronización automática**  
   El timer ejecuta el endpoint cada 10 minutos y queda instalado por el flujo de despliegue.

8. **Idempotencia**  
   Múltiples ejecuciones no duplican archivos ni registros.

9. **Biblioteca funcional**  
   La búsqueda por título, programa o docente y los filtros por tipo funcionan sin nuevas llamadas a Google.

10. **Acceso desde reunión**  
    Los encuentros pasados muestran sus materiales directamente en `/reuniones/[solicitudId]`.

11. **Compatibilidad con artefactos actuales**  
    Grabación, asistencia, transcripción y notas siguen sincronizándose mediante `ArchivoReunion`.

12. **Verificación completa antes de merge**  
    `npm run check`, `npm test`, `npm run validate:schema` y `npm run build` terminan correctamente.

---

## 10. Fuera de Alcance

Este rediseño no debe:

- cambiar quién es host/organizador de las reuniones;
- reemplazar el mecanismo Principal/Legacy;
- migrar archivos históricos de Zoom;
- crear una segunda fuente de verdad para artefactos;
- inferir quién inició una grabación;
- modificar los permisos de cohost;
- cambiar las reglas de acceso académico sin una decisión explícita;
- convertir la ausencia de grabación en un error técnico para docentes.

---

## 11. Regla Arquitectónica Final

La implementación debe preservar esta separación:

```text
requiereGrabacion
        │
        └── intención / auditoría

conferenceRecord + artefactos de Google
        │
        └── verdad técnica sobre lo que realmente ocurrió

Cuenta salaXX organizadora
        │
        └── identidad institucional del Meet

Docentes / asistentes cohosts
        │
        └── pueden operar la reunión, incluida la acción de grabar
```

El sistema debe sincronizar **lo que Google realmente generó**, independientemente de quién accionó la grabación y de si originalmente se había marcado la intención de grabar.
