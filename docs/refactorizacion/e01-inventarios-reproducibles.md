# E01 — Inventarios estáticos reproducibles

Este mecanismo complementa la revisión manual. No concede permisos ni certifica seguridad o accesibilidad.

## Ejecución

Desde la raíz del repositorio, con las dependencias instaladas mediante `npm ci`:

```bash
mkdir -p /tmp/e01
npx --no-install depcruise src app auth.ts --config .dependency-cruiser.cjs --output-type json > /tmp/e01/dependencies.json
node scripts/auditar-e01.mjs /tmp/e01
```

El workflow de auditoría genera los mismos inventarios y los conserva como artefacto de CI durante siete días. Se ejecuta al modificar su script o workflow, y manualmente mediante workflow_dispatch. No reemplaza el gate de CI ni despliega.

## Artefactos

- `dependencies.json`: grafo resuelto por Dependency Cruiser, incluyendo referencias de compilación.
- `owner-graph.json`: dependencias agrupadas por propietario, imports no resueltos y páginas que importan DB.
- `entries.json`: métodos HTTP, exportaciones de módulos con use server y acciones inline detectadas.
- `css-imports.json`: imports estáticos de CSS en componentes TypeScript.
- `summary.json`: recuentos y rutas sin método reconocido.

## Interpretación

Cada entrada incluye archivo, línea, llamadas, referencias léxicas a controles y literales de rol. Estos datos son pistas para rastrear la autorización; no prueban que un guard se ejecute antes de una mutación ni que autorice correctamente el objeto. La matriz final requiere seguir el caso de uso y ejecutar pruebas positivas y negativas.

El grafo agrupa dependencias por propietario y separa referencias marcadas por Dependency Cruiser como type-only o pre-compilation-only de las demás. Esta clasificación es instrumental, no una medición de acoplamiento semántico. Los imports CSS no identifican todos los consumidores de selectores globales. Los accesos dinámicos, los exports indirectos y los efectos de dependencias requieren revisión adicional.

No se usan credenciales, usuarios, reuniones ni datos reales. La salida es información estática del repositorio.

## Criterio de aceptación

El informe debe incluir todas las rutas API reconocidas o señalar explícitamente las no reconocidas. Se debe conservar el SHA de ejecución, revisar las entradas pendientes y contrastar los resultados con las pruebas existentes. No cerrar E01 ni aprobar E02 exclusivamente con este informe.
