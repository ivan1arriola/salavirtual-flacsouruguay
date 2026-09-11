# Rediseño de `/configuracion`

## Objetivo

Convertir `/configuracion` en un centro de administración claro para el trabajo habitual. La persona administradora debe reconocer el estado del sistema, encontrar el área que necesita y completar una acción sin recorrer una página técnica extensa.

El rediseño conserva las reglas de negocio, permisos, APIs, datos históricos y mecanismos de guardado actuales. No incluye cambios de Prisma, migraciones ni operaciones masivas sobre Google Workspace.

## Problemas observados

La ruta abre Google Workspace y muestra de inmediato todos sus controles. En una sola columna aparecen sincronización, credenciales, compatibilidad histórica, delegación, permisos, Drive, actualización de cohosts y estado de la integración. La jerarquía visual no distingue el uso diario de la configuración excepcional.

La navegación superior usa seis tarjetas. En pantallas pequeñas se transforma en una fila horizontal que oculta opciones fuera del área visible. El usuario necesita explorar esa fila para descubrir secciones.

Los estados correctos ocupan casi el mismo espacio que los problemas. La página muestra datos técnicos aunque no requieran intervención. Varias tarjetas repiten títulos, bordes y acciones, lo que dificulta reconocer la tarea principal.

Las secciones de salas y programas exponen formularios extensos. El usuario debe recorrer campos antes de obtener una visión rápida de las cuentas o los programas existentes.

## Arquitectura de información

### Entrada: resumen

`/configuracion` abrirá una vista de resumen. La vista mostrará:

- estado de Google Workspace;
- cantidad de salas disponibles y total de salas;
- cantidad de programas activos y total de programas;
- operaciones de Meet que requieren atención;
- accesos directos a las tareas administrativas frecuentes.

Cada bloque usará uno de tres estados: correcto, requiere atención o sin configurar. La interfaz reservará el color rojo para errores y acciones destructivas. Un estado correcto usará poco espacio y no desplegará detalles técnicos.

Los enlaces existentes con `?seccion=workspace`, `salas`, `programas`, `asistencia`, `correo` e `historico` seguirán funcionando. La ruta base cambiará su sección predeterminada de `workspace` a `resumen`.

### Navegación interna

En escritorio, una columna de navegación de 230 a 250 píxeles permanecerá visible junto al contenido. Cada opción tendrá icono, nombre y una descripción breve. La opción activa usará `aria-current="page"` y una marca lateral de color institucional.

En tablet y móvil, la columna se reemplazará por un control visible de ancho completo con la sección actual y el texto “Cambiar sección”. Al abrirlo mostrará todas las opciones en una lista vertical. La solución no dependerá de desplazamiento horizontal.

El contenido tendrá un ancho legible. Los formularios no se expandirán hasta llenar pantallas anchas.

### Encabezado de sección

Cada sección comenzará con:

- nombre;
- explicación de una línea;
- estado o contador pertinente;
- una acción principal, cuando corresponda.

El encabezado reemplazará la repetición de tarjetas introductorias. El usuario podrá confirmar dónde está y qué administra antes de ver campos.

## Diseño por sección

### Resumen

La parte superior responderá “¿hay algo que atender?”. Si existen errores u operaciones pendientes, los mostrará primero con enlaces al área correspondiente. Si el sistema está en orden, presentará un mensaje corto.

Debajo habrá una cuadrícula de accesos a Google Workspace, salas, programas, asistencia y correo. Cada acceso mostrará un dato útil y un verbo: “Revisar integración”, “Administrar salas” o “Gestionar programas”. Histórico Zoom aparecerá como consulta secundaria porque no forma parte de la operación diaria.

### Google Workspace

La sección mostrará primero un resumen compacto de cuatro comprobaciones: cuenta principal, delegación, Drive e integración activa. Las comprobaciones correctas se mostrarán como una línea; los problemas incluirán una explicación y el enlace o control necesario.

El contenido se dividirá en grupos:

1. **Integración y salud**: operaciones pendientes, validación de permisos y estado general.
2. **Cuenta principal**: credencial que crea reuniones y acción para verificarla o reemplazarla.
3. **Delegación y archivos**: usuario delegado y carpeta de Drive.
4. **Reuniones existentes**: actualización de cohosts.
5. **Compatibilidad histórica**: credenciales Legacy dentro de un panel cerrado.
6. **Configuración avanzada**: scopes OAuth y pausa de la integración dentro de un panel cerrado.

Los grupos usarán encabezados y separadores. La interfaz evitará una tarjeta completa para cada control. Los detalles técnicos permanecerán cerrados mientras el sistema esté en buen estado.

### Salas

La sección abrirá con el total de cuentas, las disponibles y las que requieren atención. Una lista resumida mostrará nombre, correo, disponibilidad, prioridad y capacidad. Incluirá búsqueda por nombre o correo.

Cada fila tendrá una acción “Editar”. Al activarla, abrirá el formulario de esa sala sin mostrar al mismo tiempo los formularios de las demás. “Agregar sala” abrirá un formulario separado.

La edición conservará los campos y reglas existentes. El cambio de contraseña tendrá una explicación propia. La eliminación se ubicará al final, dentro de una zona de riesgo que mantendrá la confirmación vigente.

### Programas

La cabecera mostrará cantidad total, activos e inactivos. La lista incluirá búsqueda y filtro de estado. Cada fila resumirá nombre, código, unidad académica, estado y cantidad de docentes.

Al abrir un programa, el usuario verá dos áreas: datos del programa y docentes asociados. La incorporación de una persona existente y la invitación de una persona nueva estarán separadas para evitar confusión.

En móvil, la tabla de docentes se convertirá en filas apiladas con nombre, correo, estado y acciones. La eliminación permanente del programa permanecerá dentro de una zona de riesgo y conservará la confirmación `ELIMINAR`.

### Asistencia técnica

La sección explicará qué reporte se envía y cuándo. El formulario distinguirá los administradores incluidos por el sistema de los correos adicionales que agrega el usuario. La acción “Guardar destinatarios” permanecerá asociada al formulario.

### Correo

La sección presentará una tarea única: enviar un correo de prueba. La interfaz explicará que genera un correo real antes del botón. El resultado aparecerá junto al formulario y anunciará su estado mediante una región accesible.

### Histórico Zoom

La interfaz lo identificará como consulta de solo lectura. Incluirá búsqueda por reunión, programa o cuenta. En móvil, cada registro se mostrará como bloque; en escritorio se mantendrá la tabla.

## Patrones de interacción

Cada formulario tendrá una acción primaria. Las acciones secundarias usarán menor peso visual. La interfaz deshabilitará los botones durante el envío y mostrará el verbo en curso, por ejemplo “Guardando…” o “Validando…”.

Los mensajes de éxito y error aparecerán dentro del grupo que inició la operación. Los mensajes enviados mediante parámetros de URL seguirán disponibles y se mostrarán bajo el encabezado de la sección correspondiente.

Los paneles usarán expansión progresiva para tareas poco frecuentes. La interfaz mantendrá visibles los controles que el administrador usa para resolver un problema presente.

Las zonas de riesgo agruparán eliminación de salas, eliminación de programas y pausa de la integración. El color rojo no se usará en acciones normales.

## Adaptación a pantallas

### Escritorio, desde 1024 px

- navegación interna fija a la izquierda;
- contenido a la derecha con ancho máximo de 1040 px;
- resúmenes en dos o tres columnas según el contenido;
- formularios con dos columnas solo cuando los campos se relacionen.

### Tablet, entre 641 y 1023 px

- selector de sección sobre el contenido;
- cuadrículas de dos columnas para resúmenes;
- formularios de una o dos columnas según el ancho disponible.

### Móvil, hasta 640 px

- una columna;
- selector de sección vertical y visible;
- objetivos táctiles de al menos 44 píxeles;
- acciones principales de ancho completo;
- tablas operativas convertidas en filas apiladas;
- identificadores y correos largos con ajuste de línea;
- sin desplazamiento horizontal para navegar entre secciones.

## Lenguaje visual

El rediseño mantendrá la identidad actual de Sala Virtual FLACSO: azul petróleo, fondos claros, tipografía del sistema y densidad administrativa moderada. Usará los tokens existentes de marca, texto, fondo y bordes. Incorporará variantes solo cuando falte un estado semántico.

La superficie principal tendrá menos contenedores con borde. Los separadores, espacios y títulos organizarán el contenido. Las tarjetas quedarán reservadas para resúmenes, elementos seleccionables y estados que requieran atención.

Los iconos acompañarán etiquetas. Ninguna acción dependerá solo del icono. El diseño respetará contraste WCAG AA, foco visible y `prefers-reduced-motion`.

## Componentes y límites

La página de servidor conservará la autorización de Administración y las consultas condicionadas por sección. Un módulo de dominio normalizará el parámetro `seccion` y expondrá los metadatos de navegación para evitar duplicación.

Los componentes de presentación se dividirán por responsabilidad:

- marco y navegación de configuración;
- resumen operativo;
- encabezado de sección;
- lista y editor de salas;
- lista y editor de programas;
- grupos de Google Workspace.

Los componentes actuales de credenciales, delegación, Drive, permisos, cohosts y estado seguirán usando las APIs vigentes. El rediseño podrá cambiar su composición y estilos, pero no el contrato de red.

## Datos y rendimiento

La vista de resumen consultará contadores y estados breves. Las listas completas de programas e histórico se cargarán solo cuando el usuario abra esas secciones. Google Workspace podrá cargar sus datos cuando el usuario entre a esa sección.

El rediseño no añadirá solicitudes automáticas que modifiquen Google, correo o PostgreSQL. Las operaciones continuarán ejecutándose cuando el usuario pulse una acción explícita.

## Pruebas y validación

El desarrollo seguirá ciclos de prueba primero para la normalización de secciones y cualquier lógica nueva de filtrado o estado. Las pruebas existentes protegerán los contratos de las acciones y APIs.

La validación incluirá:

- prueba específica del módulo de navegación;
- pruebas específicas de cualquier filtro nuevo;
- suite Vitest;
- comprobación de TypeScript;
- validación del schema de Prisma, aunque no cambie;
- build de Next.js;
- revisión visual y funcional en `http://localhost:8000/configuracion`.

La revisión en localhost cubrirá las seis secciones y el resumen en anchos de escritorio, tablet y móvil. Se comprobarán navegación por teclado, foco, apertura de paneles, estados vacíos, textos largos, botones ocupados y mensajes de error. No se usarán acciones que envíen correo, sincronicen Google, eliminen registros o cambien configuración real durante la revisión visual.

## Criterios de aceptación

- `/configuracion` abre el resumen y permite llegar a cualquier sección sin desplazamiento horizontal.
- El usuario identifica desde el primer bloque si el sistema requiere atención.
- Google Workspace oculta detalles técnicos sanos y mantiene visibles los problemas.
- Salas y programas muestran primero una lista resumida y abren un editor por vez.
- La pantalla funciona a 390, 768 y 1440 píxeles sin contenido cortado.
- Los enlaces actuales con `seccion` conservan su destino.
- Los permisos, APIs y reglas destructivas mantienen su comportamiento.
- La suite, TypeScript, schema y build terminan sin errores.
- La revisión final se realiza en `localhost:8000`.

## Fuera de alcance

- cambios de base de datos o migraciones;
- nuevas integraciones con Google Workspace;
- modificación de permisos o roles;
- ejecución de sincronizaciones, correos de prueba o eliminaciones durante la validación;
- despliegue a producción.
