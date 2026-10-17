# F1 — Consolidación progresiva del sistema visual

## Objetivo

Consolidar la base visual de Sala Virtual FLACSO para que las próximas fases puedan reutilizar decisiones consistentes de color, tipografía, espaciado, bordes, radios, estados y foco, sin alterar los flujos operativos existentes.

## Contexto observado

- `app/brand.css` ya contiene colores institucionales, estados, sombras, fondo y foco visible.
- `app/globals.css` define estilos base y reglas generales que se solapan parcialmente con `brand.css`.
- El layout de gestión importa 25 hojas CSS globales, además de las hojas globales del layout raíz.
- Hay CSS de página y módulos CSS cuyo uso debe preservarse durante una consolidación progresiva.
- La identidad principal usa `#2c4777`; la aplicación declara idioma español y tiene diseños de escritorio y móvil.

## Alcance de F1

1. Inventariar los tokens compartidos y sus usos en las hojas globales base.
2. Definir una escala coherente de tokens para color semántico, tipografía, espaciado, radios, bordes, elevaciones y foco, reutilizando los valores actuales cuando sean adecuados.
3. Consolidar las definiciones compartidas en la hoja de identidad existente, evitando una nueva hoja global correctiva.
4. Normalizar las reglas base duplicadas solo cuando la cascada y los consumidores permitan verificar que no se altera el aspecto o comportamiento de las páginas.
5. Documentar los tokens y las reglas de migración para que las fases posteriores puedan adoptar el sistema sin cambios masivos.
6. Añadir verificaciones automatizadas pequeñas para proteger la presencia y los valores institucionales de los tokens acordados.

## Fuera de alcance

- Rediseñar navegación, dashboards, agenda, formularios o fichas de reuniones.
- Cambiar permisos, roles, contratos API, rutas o compatibilidad Android.
- Cambiar reglas de negocio, persistencia o integraciones Google.
- Eliminar hojas de estilos de página sin rastrear sus consumidores.
- Reemplazar componentes visuales de forma masiva o introducir dependencias visuales.
- Repetir el cambio de nomenclatura de Monitoreo ya integrado por el PR #121 (`151d822`). La ruta antigua se conserva y `/monitoreo` reutiliza la misma página.

## Enfoque técnico

Usar `app/brand.css` como fuente de tokens compartidos y `app/globals.css` para la normalización estructural que no sea específica de marca. La implementación debe mantener la importación y precedencia actuales hasta que cada regla compartida tenga consumidores identificados. No se crearán selectores de parche ni se borrarán estilos de página como parte de esta fase.

Los tokens deben cubrir valores semánticos, no solo colores crudos: superficies, texto, borde, marca, acento, éxito, advertencia, error, información, tamaños tipográficos, escalas de espacio y foco. Los nombres elegidos se documentarán y usarán de manera consistente en lo que se modifique en F1. La accesibilidad de foco visible y contraste es un requisito; el cumplimiento WCAG 2.2 AA de cada pantalla se validará en las fases que modifiquen sus componentes.

## Verificación

- TypeScript y compilación de producción deben conservarse sin errores.
- Las pruebas automatizadas del proyecto deben pasar; se añadirán comprobaciones enfocadas a los tokens y a cualquier regla base modificada.
- Revisar manualmente el diff de cascada y los consumidores de cada regla base antes de consolidarla.
- No afirmar validación visual responsive ni comparación de capturas si no se dispone de entorno visual para ejecutar esas comprobaciones.
- Confirmar que no hay cambios en rutas, permisos, lógica operativa, contratos API ni esquema de base de datos.

## Revisión de cambios previos

El PR #121 fue revisado antes de planificar la ejecución. Su CI terminó correctamente en seis trabajos: esquema/TypeScript, auditoría de dependencias, PostgreSQL, build, pruebas y deploy gate. No hay reviews ni hilos de revisión registrados y el smoke test manual descrito en el PR no está acreditado. La nomenclatura de Monitoreo queda fuera de F1.

La revisión encontró textos heredados en algunos mensajes de configuración y errores de API móvil; las formas de respuesta y rutas persistidas se mantuvieron. El repositorio no contiene una aplicación Android para confirmar el tratamiento del texto libre `error`; F1 no modificará esos contratos ni esos mensajes.

## Entrega y riesgos

La implementación de F1 se mantendrá en un PR pequeño, limitado a tokens, reglas base verificadas, pruebas enfocadas y documentación. El principal riesgo es una regresión visual causada por la cascada global o por valores heredados en las 25 hojas de gestión; se mitiga manteniendo reglas locales y cambiando únicamente definiciones compartidas con usos trazables. Si la consolidación requiere modificar varias pantallas para conservar su apariencia, ese trabajo se separará en fases posteriores.
