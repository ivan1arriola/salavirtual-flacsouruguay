# Capas y Encapsulamiento - Etapa 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar la infraestructura de control arquitectónico (pruebas automatizadas de fronteras de capas y encapsulamiento modular) y desplegar el primer módulo piloto (`auditoria`) con sus 5 capas completas (`domain`, `ports`, `application`, `infrastructure`, `api.ts`) y su composición en `src/bootstrap/`, sin alterar la funcionalidad observable ni romper ninguna prueba existente.

**Architecture:** 
- `test/architecture-boundaries.test.ts` inspecciona estáticamente las dependencias e imports en `src/modules/` para impedir acoplamientos prohibidos entre capas (`presentation` -> `infrastructure`, `domain` -> frameworks/efectos, etc.) y entre módulos internos.
- `test/functional-architecture.test.ts` se armoniza para auditar la pureza funcional de la capa `domain/` en los módulos migrados y de los archivos de dominio legacy.
- Módulo piloto `src/modules/auditoria/` implementado bajo el nuevo estándar de 5 capas:
  - `domain`: tipos y validaciones inmutables de auditoría.
  - `ports`: contrato `AuditoriaRepository` en lenguaje de negocio.
  - `application`: caso de uso `registrarAuditoria`.
  - `infrastructure`: adaptador `crearPrismaAuditoriaAdapter` con soporte para transacciones.
  - `api.ts`: única puerta de enlace pública del módulo.
  - `src/bootstrap/auditoria.server.ts`: raíz de composición protegida por `server-only`.

**Tech Stack:** Next.js 16, TypeScript, Prisma 6, Vitest, Node.js `node:fs` / `node:path`.

**Spec:** `docs/superpowers/specs/2026-09-19-capas-y-encapsulamiento-design.md`

## Global Constraints

- No modificar tablas ni esquemas de base de datos (`prisma/schema.prisma`).
- Mantener la compatibilidad total con los 540 tests actuales de la suite.
- Dominio 100% puro: sin `async`, sin red, sin `process.env`, sin mutaciones (`test/functional-architecture.test.ts`).
- Ningún módulo puede importar rutas internas de otro módulo (solo vía `api.ts` o `presentation.ts`).
- Ningún archivo de `presentation` o `application` puede importar `@prisma/client` directamente.
- Composición de dependencias restringida al entorno servidor mediante `src/bootstrap/*.server.ts` con `import "server-only";`.
- Ejecutar `npm run check` y `npm test` tras cada tarea.

---

### Task 1: Harnés de pruebas de fronteras arquitectónicas (`architecture-boundaries`)

**Files:**
- Create: `test/architecture-boundaries.test.ts`

**Interfaces:**
- Produces: Suite de pruebas en Vitest que escanea el código fuente de `src/modules/**` y valida:
  1. `domain` no importa `application`, `infrastructure`, `presentation`, `@prisma/client`, `next`, `react`, bibliotecas de red o `process.env`.
  2. `application` no importa `presentation`, `infrastructure`, `@prisma/client`, `next` ni `react`.
  3. `presentation` no importa `infrastructure` ni `@prisma/client`.
  4. `ports` no importa `infrastructure`, `presentation`, `application` ni `@prisma/client`.
  5. Ningún módulo importa subdirectorios internos de otro módulo (prohibido `from "@/src/modules/<otro>/(domain|application|ports|infrastructure)/..."`).

- [ ] **Step 1: Write the failing test file**

Crear `test/architecture-boundaries.test.ts`:

```ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const MODULES_ROOT = join(process.cwd(), "src/modules");

type FileInfo = Readonly<{
  absPath: string;
  relPath: string;
  moduleName: string;
  layer?: "domain" | "ports" | "application" | "infrastructure" | "presentation";
  content: string;
  imports: readonly string[];
}>;

function extractImports(source: string): string[] {
  const importLines = source.match(/^import\s+[\s\S]*?from\s+["']([^"']+)["']/gm) || [];
  const dynamicImports = source.match(/import\s*\(\s*["']([^"']+)["']\s*\)/g) || [];
  
  const results: string[] = [];
  for (const line of importLines) {
    const match = line.match(/from\s+["']([^"']+)["']/);
    if (match?.[1]) results.push(match[1]);
  }
  for (const call of dynamicImports) {
    const match = call.match(/import\s*\(\s*["']([^"']+)["']\s*\)/);
    if (match?.[1]) results.push(match[1]);
  }
  return results;
}

function scanModules(dir: string): FileInfo[] {
  const entries = readdirSync(dir);
  const files: FileInfo[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...scanModules(fullPath));
    } else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
      const rel = relative(MODULES_ROOT, fullPath);
      const parts = rel.split("/");
      const moduleName = parts[0];
      const layerCandidate = parts[1];
      const layer = ["domain", "ports", "application", "infrastructure", "presentation"].includes(layerCandidate)
        ? (layerCandidate as FileInfo["layer"])
        : undefined;

      const content = readFileSync(fullPath, "utf8");
      files.push({
        absPath: fullPath,
        relPath: rel,
        moduleName,
        layer,
        content,
        imports: extractImports(content)
      });
    }
  }

  return files;
}

describe("fronteras arquitectonicas de capas y modulos", () => {
  const files = scanModules(MODULES_ROOT);
  const layeredFiles = files.filter((f) => f.layer !== undefined);

  it("encuentra y clasifica archivos en modulos por capa", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  describe("aislamiento de capas en modulos migrados", () => {
    for (const file of layeredFiles) {
      if (file.layer === "domain") {
        it(`[domain] ${file.relPath} no importa capas superiores ni dependencias de infraestructura`, () => {
          const forbidden = file.imports.filter((imp) =>
            imp.includes("/infrastructure") ||
            imp.includes("/application") ||
            imp.includes("/presentation") ||
            imp.includes("@prisma/client") ||
            imp.startsWith("next") ||
            imp.startsWith("react") ||
            imp.includes("googleapis") ||
            imp.includes("nodemailer")
          );
          expect(forbidden, `Imports prohibidos en domain: ${forbidden.join(", ")}`).toEqual([]);
        });
      }

      if (file.layer === "ports") {
        it(`[ports] ${file.relPath} no importa infraestructura ni frameworks externos`, () => {
          const forbidden = file.imports.filter((imp) =>
            imp.includes("/infrastructure") ||
            imp.includes("/presentation") ||
            imp.includes("/application") ||
            imp.includes("@prisma/client") ||
            imp.startsWith("next") ||
            imp.startsWith("react")
          );
          expect(forbidden, `Imports prohibidos en ports: ${forbidden.join(", ")}`).toEqual([]);
        });
      }

      if (file.layer === "application") {
        it(`[application] ${file.relPath} no importa infraestructura, presentacion ni Prisma`, () => {
          const forbidden = file.imports.filter((imp) =>
            imp.includes("/infrastructure") ||
            imp.includes("/presentation") ||
            imp.includes("@prisma/client") ||
            imp.startsWith("next") ||
            imp.startsWith("react")
          );
          expect(forbidden, `Imports prohibidos en application: ${forbidden.join(", ")}`).toEqual([]);
        });
      }

      if (file.layer === "presentation") {
        it(`[presentation] ${file.relPath} no importa infraestructura ni Prisma directamente`, () => {
          const forbidden = file.imports.filter((imp) =>
            imp.includes("/infrastructure") ||
            imp.includes("@prisma/client")
          );
          expect(forbidden, `Imports prohibidos en presentation: ${forbidden.join(", ")}`).toEqual([]);
        });
      }
    }
  });

  describe("encapsulamiento entre modulos", () => {
    for (const file of files) {
      it(`${file.relPath} no importa rutas internas de otros modulos`, () => {
        const forbiddenCrossImports = file.imports.filter((imp) => {
          const match = imp.match(/@\/src\/modules\/([^/]+)\/(domain|application|ports|infrastructure)\//);
          if (match) {
            const importedModule = match[1];
            return importedModule !== file.moduleName;
          }
          return false;
        });

        expect(
          forbiddenCrossImports,
          `Acceso a ruta interna privada de otro modulo: ${forbiddenCrossImports.join(", ")}`
        ).toEqual([]);
      });
    }
  });
});
```

- [ ] **Step 2: Run test to verify it passes on the current codebase**

Run: `npx vitest run test/architecture-boundaries.test.ts`
Expected: PASS (al no existir aún capas migradas, valida el escaneo y el encapsulamiento cruzado).

- [ ] **Step 3: Commit**

```bash
git add test/architecture-boundaries.test.ts
git commit -m "test(arch): agregar arnes de pruebas de fronteras arquitectonicas"
```

---

### Task 2: Armonización de `test/functional-architecture.test.ts`

**Files:**
- Modify: `test/functional-architecture.test.ts`

**Interfaces:**
- Consumes: Convención de carpetas modular (`src/modules/<modulo>/domain/**.ts` y archivos legacy sin carpetas de capa).
- Produces: Verificación de pureza funcional inmutable sobre todos los archivos de dominio (antiguos y nuevos dentro de `domain/`).

- [ ] **Step 1: Write the failing assertion or check**

Actualmente `test/functional-architecture.test.ts` asume que cualquier `.ts` dentro de `src/modules/` que no sea `.service.ts`, `.adapter.ts` o `.xlsx.ts` es puro.
Al introducir `src/modules/auditoria/ports/auditoria.port.ts` o `src/modules/auditoria/api.ts`, el test intentaría exigir pureza de dominio sobre archivos de interfaces o barriles, generando falsos positivos.
La regla debe especificar que para módulos con estructura de capas, la pureza estricta aplica a `src/modules/**/domain/*.ts`, mientras que los módulos aún no migrados conservan su regla de exclusión legacy.

- [ ] **Step 2: Run test to verify current behavior**

Run: `npx vitest run test/functional-architecture.test.ts`
Expected: PASS (con 48 archivos actuales evaluados).

- [ ] **Step 3: Implement minimal adjustment in `test/functional-architecture.test.ts`**

Modificar `test/functional-architecture.test.ts`:

```ts
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const MODULES_ROOT = new URL("../src/modules/", import.meta.url);
const ALL_TS_FILES = readdirSync(MODULES_ROOT, {
  recursive: true,
  encoding: "utf8"
})
  .filter((relativePath) => relativePath.endsWith(".ts") && !relativePath.endsWith(".d.ts"))
  .slice()
  .sort();

// Identificar archivos puramente de dominio:
// 1. En módulos migrados: cualquier archivo dentro de un subdirectorio `domain/`.
// 2. En módulos legacy: cualquier archivo que no sea service, adapter o xlsx, y que no esté en ports, application, infrastructure o presentation.
const PURE_MODULES = ALL_TS_FILES.filter((relativePath) => {
  const parts = relativePath.split("/");
  if (parts.length > 2) {
    const layer = parts[1];
    if (layer === "domain") return true;
    if (["ports", "application", "infrastructure", "presentation"].includes(layer)) {
      return false;
    }
    if (parts[parts.length - 1] === "api.ts" || parts[parts.length - 1] === "presentation.ts") {
      return false;
    }
  }
  return (
    !relativePath.endsWith(".service.ts") &&
    !relativePath.endsWith(".adapter.ts") &&
    !relativePath.endsWith(".xlsx.ts")
  );
});

const FORBIDDEN_EFFECTS = [
  { name: "Prisma", pattern: /@prisma\/client/ },
  { name: "Next.js", pattern: /from ["']next(?:\/|["'])/ },
  { name: "entorno", pattern: /process\.env/ },
  { name: "estado global", pattern: /globalThis/ },
  { name: "red", pattern: /\bfetch\s*\(/ },
  { name: "reloj del sistema", pattern: /\b(?:new Date|Date\.now)\s*\(/ },
  { name: "azar del sistema", pattern: /\b(?:Math\.random|crypto\.randomUUID)\s*\(/ },
  { name: "consola", pattern: /\bconsole\./ },
  { name: "clases", pattern: /\bclass\s+/ },
  { name: "variables reasignables", pattern: /\b(?:let|var)\s+/ },
  {
    name: "mutacion de colecciones",
    pattern: /\.(?:push|pop|shift|unshift|splice|reverse|sort|set|delete|clear|add)\s*\(/
  }
] as const;

describe("arquitectura funcional", () => {
  for (const relativePath of PURE_MODULES) {
    it(`${relativePath} permanece libre de efectos externos`, () => {
      const source = readFileSync(new URL(relativePath, MODULES_ROOT), "utf8");
      const effects = FORBIDDEN_EFFECTS.filter(({ pattern }) => pattern.test(source)).map(
        ({ name }) => name
      );

      expect(effects).toEqual([]);
    });
  }
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/functional-architecture.test.ts`
Expected: PASS (los 48 tests de dominio previos siguen pasando de manera intacta).

- [ ] **Step 5: Commit**

```bash
git add test/functional-architecture.test.ts
git commit -m "test(arch): armonizar deteccion de modulos de dominio para soportar capas"
```

---

### Task 3: Módulo Piloto `auditoria` con 5 capas

**Files:**
- Create: `src/modules/auditoria/domain/auditoria.types.ts`
- Create: `src/modules/auditoria/domain/auditoria.domain.ts`
- Create: `src/modules/auditoria/ports/auditoria.port.ts`
- Create: `src/modules/auditoria/application/registrar-auditoria.use-case.ts`
- Create: `src/modules/auditoria/infrastructure/prisma-auditoria.adapter.ts`
- Create: `src/modules/auditoria/api.ts`
- Create: `test/auditoria-module.test.ts`

**Interfaces:**
- Produces:
  - `EventoAuditoria`: Entidad de dominio inmutable con datos validados de auditoría.
  - `validarEventoAuditoria(datos)`: Función pura que valida campos obligatorios y formato.
  - `AuditoriaRepository`: Puerto con método `registrar(evento: EventoAuditoria): Promise<void>`.
  - `crearRegistrarAuditoriaUseCase(repository)`: Caso de uso puro de orquestación.
  - `crearPrismaAuditoriaAdapter(prismaOrTx)`: Adaptador de infraestructura hacia Prisma `model Auditoria`.
  - `api.ts`: Re-exporta los contratos públicos del módulo.

- [ ] **Step 1: Write the failing unit and architecture tests for auditoria**

Crear `test/auditoria-module.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import {
  validarEventoAuditoria,
  crearRegistrarAuditoriaUseCase,
  crearPrismaAuditoriaAdapter,
  type EventoAuditoria,
  type AuditoriaRepository
} from "@/src/modules/auditoria/api";

describe("modulo auditoria", () => {
  describe("dominio", () => {
    it("valida exitosamente un evento de auditoria valido", () => {
      const fecha = new Date("2026-09-19T12:00:00Z");
      const resultado = validarEventoAuditoria({
        accion: "CREAR_REUNION",
        entidad: "SolicitudSala",
        entidadId: "sol-123",
        usuarioId: "usr-456",
        timestamp: fecha,
        metadata: { modo: "AUTOMATICO" }
      });

      expect(resultado.ok).toBe(true);
      if (resultado.ok) {
        expect(resultado.value.accion).toBe("CREAR_REUNION");
        expect(resultado.value.entidad).toBe("SolicitudSala");
        expect(resultado.value.timestamp).toBe(fecha);
      }
    });

    it("rechaza un evento con accion o entidad vacias", () => {
      const resultado = validarEventoAuditoria({
        accion: "",
        entidad: "",
        timestamp: new Date()
      });

      expect(resultado.ok).toBe(false);
    });
  });

  describe("aplicacion", () => {
    it("registra el evento a traves del repositorio cuando los datos son validos", async () => {
      const mockRepo: AuditoriaRepository = {
        registrar: vi.fn().mockResolvedValue(undefined)
      };

      const useCase = crearRegistrarAuditoriaUseCase(mockRepo);
      const resultado = await useCase({
        accion: "ASIGNAR_HOST",
        entidad: "InstanciaSala",
        entidadId: "inst-789",
        timestamp: new Date("2026-09-19T14:00:00Z")
      });

      expect(resultado.ok).toBe(true);
      expect(mockRepo.registrar).toHaveBeenCalledOnce();
    });

    it("no invoca el repositorio si el evento no supera la validacion de dominio", async () => {
      const mockRepo: AuditoriaRepository = {
        registrar: vi.fn().mockResolvedValue(undefined)
      };

      const useCase = crearRegistrarAuditoriaUseCase(mockRepo);
      const resultado = await useCase({
        accion: "",
        entidad: "InstanciaSala",
        timestamp: new Date()
      });

      expect(resultado.ok).toBe(false);
      expect(mockRepo.registrar).not.toHaveBeenCalled();
    });
  });

  describe("infraestructura prisma", () => {
    it("inserta el registro en el modelo Prisma Auditoria", async () => {
      const mockCreate = vi.fn().mockResolvedValue({ id: "aud-1" });
      const mockPrisma = {
        auditoria: {
          create: mockCreate
        }
      } as any;

      const adapter = crearPrismaAuditoriaAdapter(mockPrisma);
      const fecha = new Date("2026-09-19T14:00:00Z");

      await adapter.registrar({
        accion: "LOGIN_EXITOSO",
        entidad: "Usuario",
        entidadId: "usr-1",
        usuarioId: "usr-1",
        timestamp: fecha,
        metadata: { ip: "127.0.0.1" }
      });

      expect(mockCreate).toHaveBeenCalledWith({
        data: {
          accion: "LOGIN_EXITOSO",
          entidad: "Usuario",
          entidadId: "usr-1",
          usuarioId: "usr-1",
          creadoEn: fecha,
          metadata: { ip: "127.0.0.1" }
        }
      });
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/auditoria-module.test.ts`
Expected: FAIL (módulo aún no implementado).

- [ ] **Step 3: Implement minimal domain layer**

Crear `src/modules/auditoria/domain/auditoria.types.ts`:

```ts
export type EventoAuditoria = Readonly<{
  accion: string;
  entidad: string;
  entidadId?: string | null;
  usuarioId?: string | null;
  timestamp: Date;
  metadata?: Readonly<Record<string, unknown>> | null;
}>;

export type ResultadoValidacion<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; error: string }>;
```

Crear `src/modules/auditoria/domain/auditoria.domain.ts`:

```ts
import type { EventoAuditoria, ResultadoValidacion } from "./auditoria.types";

export function validarEventoAuditoria(
  input: Readonly<{
    accion: string;
    entidad: string;
    entidadId?: string | null;
    usuarioId?: string | null;
    timestamp?: Date;
    metadata?: Readonly<Record<string, unknown>> | null;
  }>
): ResultadoValidacion<EventoAuditoria> {
  const accion = input.accion.trim();
  const entidad = input.entidad.trim();

  if (!accion) {
    return { ok: false, error: "La accion de auditoria no puede estar vacia" };
  }

  if (!entidad) {
    return { ok: false, error: "La entidad de auditoria no puede estar vacia" };
  }

  if (!input.timestamp || !(input.timestamp instanceof Date) || isNaN(input.timestamp.getTime())) {
    return { ok: false, error: "El timestamp de auditoria debe ser una fecha valida" };
  }

  return {
    ok: true,
    value: {
      accion,
      entidad,
      entidadId: input.entidadId ?? null,
      usuarioId: input.usuarioId ?? null,
      timestamp: input.timestamp,
      metadata: input.metadata ?? null
    }
  };
}
```

- [ ] **Step 4: Implement minimal ports layer**

Crear `src/modules/auditoria/ports/auditoria.port.ts`:

```ts
import type { EventoAuditoria } from "../domain/auditoria.types";

export type AuditoriaRepository = Readonly<{
  registrar: (evento: EventoAuditoria) => Promise<void>;
}>;
```

- [ ] **Step 5: Implement minimal application layer**

Crear `src/modules/auditoria/application/registrar-auditoria.use-case.ts`:

```ts
import { validarEventoAuditoria } from "../domain/auditoria.domain";
import type { EventoAuditoria } from "../domain/auditoria.types";
import type { AuditoriaRepository } from "../ports/auditoria.port";

export type RegistrarAuditoriaInput = Readonly<{
  accion: string;
  entidad: string;
  entidadId?: string | null;
  usuarioId?: string | null;
  timestamp: Date;
  metadata?: Readonly<Record<string, unknown>> | null;
}>;

export type ResultadoAuditoria =
  | Readonly<{ ok: true; evento: EventoAuditoria }>
  | Readonly<{ ok: false; error: string }>;

export function crearRegistrarAuditoriaUseCase(repository: AuditoriaRepository) {
  return async function registrarAuditoria(
    input: RegistrarAuditoriaInput
  ): Promise<ResultadoAuditoria> {
    const validacion = validarEventoAuditoria(input);
    if (!validacion.ok) {
      return { ok: false, error: validacion.error };
    }

    await repository.registrar(validacion.value);
    return { ok: true, evento: validacion.value };
  };
}
```

- [ ] **Step 6: Implement minimal infrastructure layer**

Crear `src/modules/auditoria/infrastructure/prisma-auditoria.adapter.ts`:

```ts
import type { PrismaClient } from "@prisma/client";
import type { EventoAuditoria } from "../domain/auditoria.types";
import type { AuditoriaRepository } from "../ports/auditoria.port";

type PrismaAuditoriaClient = Pick<PrismaClient, "auditoria">;

export function crearPrismaAuditoriaAdapter(
  prismaOrTx: PrismaAuditoriaClient
): AuditoriaRepository {
  return {
    async registrar(evento: EventoAuditoria): Promise<void> {
      await prismaOrTx.auditoria.create({
        data: {
          accion: evento.accion,
          entidad: evento.entidad,
          entidadId: evento.entidadId ?? null,
          usuarioId: evento.usuarioId ?? null,
          creadoEn: evento.timestamp,
          metadata: (evento.metadata as any) ?? undefined
        }
      });
    }
  };
}
```

- [ ] **Step 7: Implement public module API**

Crear `src/modules/auditoria/api.ts`:

```ts
export type { EventoAuditoria, ResultadoValidacion } from "./domain/auditoria.types";
export { validarEventoAuditoria } from "./domain/auditoria.domain";
export type { AuditoriaRepository } from "./ports/auditoria.port";
export {
  crearRegistrarAuditoriaUseCase,
  type RegistrarAuditoriaInput,
  type ResultadoAuditoria
} from "./application/registrar-auditoria.use-case";
export { crearPrismaAuditoriaAdapter } from "./infrastructure/prisma-auditoria.adapter";
```

- [ ] **Step 8: Run unit, architecture and functional tests to verify they pass**

Run: `npx vitest run test/auditoria-module.test.ts test/architecture-boundaries.test.ts test/functional-architecture.test.ts`
Expected: ALL PASS.

- [ ] **Step 9: Commit**

```bash
git add src/modules/auditoria/ test/auditoria-module.test.ts
git commit -m "feat(auditoria): crear modulo piloto con arquitectura de 5 capas"
```

---

### Task 4: Composición del módulo piloto en `src/bootstrap/auditoria.server.ts`

**Files:**
- Create: `src/bootstrap/auditoria.server.ts`
- Create: `test/auditoria-bootstrap.test.ts`

**Interfaces:**
- Consumes: `@/src/lib/db`, `@/src/modules/auditoria/api`.
- Produces: `obtenerServicioAuditoria()` y `crearServicioAuditoriaTransaccional(tx)` como puntos de entrada singleton y transaccionales para servidores Next.js.

- [ ] **Step 1: Write the failing bootstrap test**

Crear `test/auditoria-bootstrap.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/src/lib/db", () => ({
  db: {
    auditoria: {
      create: vi.fn().mockResolvedValue({ id: "aud-mock-1" })
    }
  }
}));

import { obtenerServicioAuditoria } from "@/src/bootstrap/auditoria.server";

describe("bootstrap auditoria.server", () => {
  it("compone el caso de uso con el cliente prisma del sistema", async () => {
    const servicio = obtenerServicioAuditoria();
    const resultado = await servicio.registrar({
      accion: "BOOTSTRAP_TEST",
      entidad: "Sistema",
      timestamp: new Date("2026-09-19T15:00:00Z")
    });

    expect(resultado.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run test/auditoria-bootstrap.test.ts`
Expected: FAIL (archivo `src/bootstrap/auditoria.server.ts` aún no existe).

- [ ] **Step 3: Implement minimal bootstrap file**

Crear `src/bootstrap/auditoria.server.ts`:

```ts
import "server-only";
import { db } from "@/src/lib/db";
import {
  crearPrismaAuditoriaAdapter,
  crearRegistrarAuditoriaUseCase,
  type RegistrarAuditoriaInput,
  type ResultadoAuditoria
} from "@/src/modules/auditoria/api";
import type { PrismaClient } from "@prisma/client";

export type ServicioAuditoria = Readonly<{
  registrar: (input: RegistrarAuditoriaInput) => Promise<ResultadoAuditoria>;
}>;

const defaultAdapter = crearPrismaAuditoriaAdapter(db);
const defaultUseCase = crearRegistrarAuditoriaUseCase(defaultAdapter);

export function obtenerServicioAuditoria(): ServicioAuditoria {
  return {
    registrar: defaultUseCase
  };
}

export function crearServicioAuditoriaTransaccional(
  tx: Pick<PrismaClient, "auditoria">
): ServicioAuditoria {
  const adapter = crearPrismaAuditoriaAdapter(tx);
  const useCase = crearRegistrarAuditoriaUseCase(adapter);
  return {
    registrar: useCase
  };
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `npx vitest run test/auditoria-bootstrap.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/bootstrap/auditoria.server.ts test/auditoria-bootstrap.test.ts
git commit -m "feat(bootstrap): raiz de composicion server-only para modulo auditoria"
```

---

### Task 5: Verificación global de tipos, tests y build

**Files:**
- None (verificación pura sobre el árbol completo)

**Interfaces:**
- Consumes: Todo el árbol de código y tests.
- Produces: Validación estricta de TypeScript, suite completa de Vitest, esquema de Prisma y compilación Next.js 16.

- [ ] **Step 1: Check TypeScript types**

Run: `npm run check`
Expected: PASS con 0 errores de tipo.

- [ ] **Step 2: Run complete test suite**

Run: `npm test`
Expected: PASS con 100% de tests aprobados (97+ archivos de prueba).

- [ ] **Step 3: Validate database schema**

Run: `npm run validate:schema`
Expected: PASS.

- [ ] **Step 4: Run production build**

Run: `npm run build`
Expected: PASS con compilación exitosa de Next.js 16.

