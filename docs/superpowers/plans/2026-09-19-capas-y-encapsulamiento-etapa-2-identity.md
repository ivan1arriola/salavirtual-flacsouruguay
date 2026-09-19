# Capas y Encapsulamiento - Etapa 2 (Identity y Aislamiento de Auth.js) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar el módulo `identity` con arquitectura de 5 capas (`domain`, `ports`, `application`, `infrastructure`, `api.ts`), transformar `auth.ts` en un adaptador puro de Auth.js libre de dependencias de Prisma, cifrado y Google Calendar, y aislar la reconciliación del calendario del asistente técnico mediante un despachador seguro fuera del camino crítico.

**Architecture:** 
- `src/modules/identity/domain/`: Tipos puros inmutables (`RolUsuario`, `UsuarioAutenticado`, `PerfilGoogle`), reglas de acceso Google y credenciales, esquemas Zod de validación y cálculo funcional de redirecciones autorizadas.
- `src/modules/identity/ports/`: Contratos `IdentityRepository` (búsqueda de credenciales, resolución/autovinculación de cuenta Google, registro de acceso) y `CalendarioAsistenteDispatcher` (intención de reconciliación de calendario).
- `src/modules/identity/application/`: Casos de uso `autenticarCredenciales` y `resolverUsuarioGoogle` coordinando reglas de dominio y puertos sin acoplamiento a frameworks.
- `src/modules/identity/infrastructure/`: Adaptador Prisma `PrismaIdentityAdapter` y adaptador de despacho seguro `AsistenciaCalendarioDispatcherAdapter` (con aislamiento total de excepciones de Calendar).
- `src/bootstrap/identity.server.ts`: Raíz de composición `server-only` que inyecta `db` y dependencias de calendario en los casos de uso.
- `auth.ts`: Convertido en adaptador delgado de NextAuth que delega autenticación a `identity.server.ts`, eliminando imports directos de `@/src/lib/db`, `@/src/lib/config/encryption` y `@/src/modules/asistencia/calendario-asistente*`.
- Fachadas de compatibilidad en `src/lib/auth/` y `src/modules/usuarios/` para preservar sin cambios a todos los consumidores existentes.

**Tech Stack:** Next.js 16, TypeScript, NextAuth v5, Prisma 6, bcryptjs, Zod, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-19-capas-y-encapsulamiento-design.md` (Secciones 4, 6, 10 y 14).

## Global Constraints

- No modificar tablas ni campos en `prisma/schema.prisma`.
- Conservar los contratos de sesión Auth.js (`session.user.id`, `session.user.role`, `session.user.mustChangePassword`) y JWT sin alteraciones observables.
- `src/modules/identity/domain/` 100% puro (aprobado por `test/functional-architecture.test.ts`).
- `src/modules/identity/` respeta 100% las fronteras de capas (`test/architecture-boundaries.test.ts`).
- `auth.ts` no puede importar `@prisma/client`, `db`, ni adaptadores de calendario.
- Cualquier fallo de red o rechazo de Google Calendar en la reconciliación del asistente debe quedar contenido sin impedir el login del usuario.
- Todos los tests existentes deben permanecer en verde (`npm run check` y `npm test`).

---

### Task 1: Capa Domain del Módulo `identity`

**Files:**
- Create: `src/modules/identity/domain/identity.types.ts`
- Create: `src/modules/identity/domain/roles.domain.ts`
- Create: `src/modules/identity/domain/credentials.domain.ts`
- Create: `src/modules/identity/domain/google-login.domain.ts`
- Create: `src/modules/identity/domain/auth-config.domain.ts`
- Create: `test/identity-domain.test.ts`

**Interfaces:**
- Produces:
  - `RolUsuario`, `ROLES_USUARIO`, `esRolUsuario`, `puedeAdministrar`, `puedeGestionarAsistencia`, `puedeDictarClases`.
  - `UsuarioAutenticado`, `UsuarioCredenciales`, `evaluarAccesoLocal`, `credencialesLoginSchema`, `normalizarIdentificadorAcceso`.
  - `PerfilGoogle`, `CuentaGoogleVinculada`, `evaluarAccesoGoogle`, `esPerfilGoogleVerificado`, `esPerfilGoogleInstitucional`, `resolverVinculacionSubjectGoogle`.
  - `parseAuthConfig`, `resolverRedireccionAutorizada`, `AuthConfig`.

- [ ] **Step 1: Write the failing domain test**

Crear `test/identity-domain.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  esRolUsuario,
  puedeAdministrar,
  evaluarAccesoLocal,
  evaluarAccesoGoogle,
  esPerfilGoogleVerificado,
  esPerfilGoogleInstitucional,
  resolverVinculacionSubjectGoogle,
  parseAuthConfig,
  resolverRedireccionAutorizada,
  type PerfilGoogle,
  type CuentaGoogleVinculada
} from "@/src/modules/identity/domain";

describe("identity domain", () => {
  it("valida roles permitidos", () => {
    expect(esRolUsuario("ADMINISTRACION")).toBe(true);
    expect(esRolUsuario("ASISTENTE_TECNICO")).toBe(true);
    expect(esRolUsuario("DOCENTE")).toBe(true);
    expect(esRolUsuario("INVALIDO")).toBe(false);
    expect(puedeAdministrar("ADMINISTRACION")).toBe(true);
    expect(puedeAdministrar("DOCENTE")).toBe(false);
  });

  it("evalua acceso local con credenciales", () => {
    const usuario = {
      id: "usr-1",
      passwordHash: "hash",
      debeCambiarPassword: false,
      rol: "DOCENTE" as const,
      activo: true,
      fusionadoEnId: null,
      nombre: "Docente Test",
      email: "docente@flacso.edu.uy"
    };

    expect(evaluarAccesoLocal(usuario, true)?.id).toBe("usr-1");
    expect(evaluarAccesoLocal(usuario, false)).toBeNull();
    expect(evaluarAccesoLocal({ ...usuario, activo: false }, true)).toBeNull();
    expect(evaluarAccesoLocal({ ...usuario, fusionadoEnId: "otro" }, true)).toBeNull();
  });

  it("evalua acceso con Google", () => {
    const perfil: PerfilGoogle = {
      subject: "sub-123",
      email: "docente@flacso.edu.uy",
      emailVerificado: true
    };
    const cuenta: CuentaGoogleVinculada = {
      providerAccountId: "sub-123",
      email: "docente@flacso.edu.uy",
      usuario: {
        id: "usr-1",
        rol: "DOCENTE",
        debeCambiarPassword: false,
        activo: true,
        fusionadoEnId: null,
        nombre: "Docente Test",
        email: "docente@flacso.edu.uy"
      }
    };

    expect(evaluarAccesoGoogle(perfil, cuenta)?.id).toBe("usr-1");
    expect(evaluarAccesoGoogle({ ...perfil, emailVerificado: false }, cuenta)).toBeNull();
    expect(esPerfilGoogleInstitucional(perfil)).toBe(true);
    expect(esPerfilGoogleInstitucional({ ...perfil, email: "otro@gmail.com" })).toBe(false);
    expect(resolverVinculacionSubjectGoogle("sub-antiguo", "sub-nuevo", false)).toBe("REVINCULAR");
  });

  it("valida configuracion de autenticacion y redirecciones", () => {
    const config = parseAuthConfig({
      AUTH_SECRET: "a".repeat(64),
      AUTH_TRUST_HOST: "true",
      APP_BASE_URL: "http://localhost:3000"
    });
    expect(config.trustHost).toBe(true);
    expect(resolverRedireccionAutorizada("/reuniones", "http://localhost:3000")).toBe("http://localhost:3000/reuniones");
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run test/identity-domain.test.ts`
Expected: FAIL (módulo aún no implementado).

- [ ] **Step 3: Implement domain files**

Crear:
- `src/modules/identity/domain/identity.types.ts`
- `src/modules/identity/domain/roles.domain.ts`
- `src/modules/identity/domain/credentials.domain.ts`
- `src/modules/identity/domain/google-login.domain.ts`
- `src/modules/identity/domain/auth-config.domain.ts`
- `src/modules/identity/domain/index.ts`

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run test/identity-domain.test.ts test/functional-architecture.test.ts`
Expected: PASS (los tests de dominio pasan y `functional-architecture` valida que no tienen efectos).

- [ ] **Step 5: Commit**

```bash
git add src/modules/identity/domain/ test/identity-domain.test.ts
git commit -m "feat(identity): implementar capa de dominio para autenticacion y roles"
```

---

### Task 2: Capa Ports del Módulo `identity`

**Files:**
- Create: `src/modules/identity/ports/identity-repository.port.ts`
- Create: `src/modules/identity/ports/calendario-asistente-dispatcher.port.ts`
- Create: `src/modules/identity/ports/index.ts`

**Interfaces:**
- Produces:
  - `IdentityRepository`: Contrato en lenguaje de negocio para consultar usuarios de acceso local, registrar inicios de sesión, resolver y autovincular cuentas Google.
  - `CalendarioAsistenteDispatcher`: Contrato `reconciliarCalendarioAsistente(usuarioId: string): Promise<void>`.

- [ ] **Step 1: Write ports definition files**

Crear `src/modules/identity/ports/identity-repository.port.ts`:

```ts
import type {
  CuentaGoogleVinculada,
  PerfilGoogle,
  UsuarioCredenciales
} from "../domain/identity.types";

export type IdentityRepository = Readonly<{
  buscarParaLoginLocal: (identificador: string) => Promise<UsuarioCredenciales | null>;
  registrarAcceso: (
    usuarioId: string,
    proveedor: "credentials" | "google",
    fecha?: Date
  ) => Promise<void>;
  resolverOCrearCuentaGoogle: (
    perfil: PerfilGoogle,
    fecha: Date
  ) => Promise<CuentaGoogleVinculada | null>;
  actualizarUltimoAccesoGoogle: (
    cuentaId: string,
    subject: string,
    fecha: Date
  ) => Promise<void>;
}>;
```

Crear `src/modules/identity/ports/calendario-asistente-dispatcher.port.ts`:

```ts
export type CalendarioAsistenteDispatcher = Readonly<{
  reconciliarCalendarioAsistente: (usuarioId: string) => Promise<void>;
}>;
```

Crear `src/modules/identity/ports/index.ts`:

```ts
export type { IdentityRepository } from "./identity-repository.port";
export type { CalendarioAsistenteDispatcher } from "./calendario-asistente-dispatcher.port";
```

- [ ] **Step 2: Run boundaries test to verify ports conformity**

Run: `npx vitest run test/architecture-boundaries.test.ts`
Expected: PASS (puertos sin imports prohibidos).

- [ ] **Step 3: Commit**

```bash
git add src/modules/identity/ports/
git commit -m "feat(identity): definir puertos de persistencia y despacho de calendario"
```

---

### Task 3: Capa Application del Módulo `identity`

**Files:**
- Create: `src/modules/identity/application/autenticar-credenciales.use-case.ts`
- Create: `src/modules/identity/application/resolver-usuario-google.use-case.ts`
- Create: `src/modules/identity/application/index.ts`
- Create: `test/identity-application.test.ts`

**Interfaces:**
- Produces:
  - `crearAutenticarCredencialesUseCase(repository, verificarPassword)`
  - `crearResolverUsuarioGoogleUseCase(repository, calendarioDispatcher?)`

- [ ] **Step 1: Write the failing application test**

Crear `test/identity-application.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import {
  crearAutenticarCredencialesUseCase,
  crearResolverUsuarioGoogleUseCase
} from "@/src/modules/identity/application";
import type {
  IdentityRepository,
  CalendarioAsistenteDispatcher
} from "@/src/modules/identity/ports";

describe("identity application use cases", () => {
  it("autentica con credenciales validas", async () => {
    const mockRepo: IdentityRepository = {
      buscarParaLoginLocal: vi.fn().mockResolvedValue({
        id: "usr-1",
        passwordHash: "$2a$10$hash",
        debeCambiarPassword: false,
        rol: "ADMINISTRACION",
        activo: true,
        fusionadoEnId: null,
        nombre: "Admin",
        email: "admin@flacso.edu.uy"
      }),
      registrarAcceso: vi.fn().mockResolvedValue(undefined),
      resolverOCrearCuentaGoogle: vi.fn(),
      actualizarUltimoAccesoGoogle: vi.fn()
    };
    const mockVerificar = vi.fn().mockResolvedValue(true);

    const useCase = crearAutenticarCredencialesUseCase(mockRepo, mockVerificar);
    const usuario = await useCase({ usuario: "admin@flacso.edu.uy", password: "secretPassword123" });

    expect(usuario?.id).toBe("usr-1");
    expect(mockRepo.registrarAcceso).toHaveBeenCalledWith("usr-1", "credentials");
  });

  it("resuelve usuario Google y despacha sincronizacion de calendario para asistentes", async () => {
    const mockRepo: IdentityRepository = {
      buscarParaLoginLocal: vi.fn(),
      registrarAcceso: vi.fn().mockResolvedValue(undefined),
      resolverOCrearCuentaGoogle: vi.fn().mockResolvedValue({
        providerAccountId: "sub-google-1",
        email: "asistente@flacso.edu.uy",
        usuario: {
          id: "asist-1",
          rol: "ASISTENTE_TECNICO",
          debeCambiarPassword: false,
          activo: true,
          fusionadoEnId: null,
          nombre: "Asistente Uno",
          email: "asistente@flacso.edu.uy"
        }
      }),
      actualizarUltimoAccesoGoogle: vi.fn().mockResolvedValue(undefined)
    };
    const mockDispatcher: CalendarioAsistenteDispatcher = {
      reconciliarCalendarioAsistente: vi.fn().mockResolvedValue(undefined)
    };

    const useCase = crearResolverUsuarioGoogleUseCase(mockRepo, mockDispatcher);
    const usuario = await useCase({
      subject: "sub-google-1",
      email: "asistente@flacso.edu.uy",
      emailVerificado: true,
      nombre: "Asistente Uno"
    });

    expect(usuario?.id).toBe("asist-1");
    expect(mockDispatcher.reconciliarCalendarioAsistente).toHaveBeenCalledWith("asist-1");
  });

  it("no interrumpe el login si el despachador de calendario rechaza la ejecucion", async () => {
    const mockRepo: IdentityRepository = {
      buscarParaLoginLocal: vi.fn(),
      registrarAcceso: vi.fn().mockResolvedValue(undefined),
      resolverOCrearCuentaGoogle: vi.fn().mockResolvedValue({
        providerAccountId: "sub-google-2",
        email: "asistente@flacso.edu.uy",
        usuario: {
          id: "asist-2",
          rol: "ASISTENTE_TECNICO",
          debeCambiarPassword: false,
          activo: true,
          fusionadoEnId: null,
          nombre: "Asistente Dos",
          email: "asistente@flacso.edu.uy"
        }
      }),
      actualizarUltimoAccesoGoogle: vi.fn().mockResolvedValue(undefined)
    };
    const mockFailingDispatcher: CalendarioAsistenteDispatcher = {
      reconciliarCalendarioAsistente: vi.fn().mockRejectedValue(new Error("Google Calendar timeout"))
    };

    const useCase = crearResolverUsuarioGoogleUseCase(mockRepo, mockFailingDispatcher);
    const usuario = await useCase({
      subject: "sub-google-2",
      email: "asistente@flacso.edu.uy",
      emailVerificado: true
    });

    expect(usuario?.id).toBe("asist-2");
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run test/identity-application.test.ts`
Expected: FAIL (casos de uso aún no implementados).

- [ ] **Step 3: Implement application use cases**

Implementar `autenticar-credenciales.use-case.ts` y `resolver-usuario-google.use-case.ts`.

- [ ] **Step 4: Run test to verify pass**

Run: `npx vitest run test/identity-application.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/identity/application/ test/identity-application.test.ts
git commit -m "feat(identity): implementar casos de uso de autenticacion local y google"
```

---

### Task 4: Capa Infrastructure y Entrada Pública `api.ts`

**Files:**
- Create: `src/modules/identity/infrastructure/prisma-identity.adapter.ts`
- Create: `src/modules/identity/infrastructure/asistencia-calendario-dispatcher.adapter.ts`
- Create: `src/modules/identity/api.ts`
- Create: `test/identity-infrastructure.test.ts`

**Interfaces:**
- Produces:
  - `crearPrismaIdentityAdapter(prismaOrTx): IdentityRepository`
  - `crearAsistenciaCalendarioDispatcher(options): CalendarioAsistenteDispatcher`
  - `api.ts`: única puerta de enlace del módulo `identity`.

- [ ] **Step 1: Write the infrastructure tests**

Crear `test/identity-infrastructure.test.ts` probando mapeos Prisma y captura segura de errores de calendario.

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run test/identity-infrastructure.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement adapters and `api.ts`**

Implementar:
- `prisma-identity.adapter.ts` (trasladando de forma limpia las queries de `google-login.adapter.ts` y `local-login.adapter.ts`).
- `asistencia-calendario-dispatcher.adapter.ts` (invocando `sincronizarCalendariosAsistenteUsuario` con try/catch y console.warn).
- `src/modules/identity/api.ts`.

- [ ] **Step 4: Run all identity tests and boundary checks**

Run: `npx vitest run test/identity-module.test.ts test/identity-domain.test.ts test/identity-application.test.ts test/identity-infrastructure.test.ts test/architecture-boundaries.test.ts`
Expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/identity/infrastructure/ src/modules/identity/api.ts test/identity-infrastructure.test.ts
git commit -m "feat(identity): implementar adaptadores de infraestructura y api publica"
```

---

### Task 5: Composición en `src/bootstrap/identity.server.ts` y Desacople de `auth.ts`

**Files:**
- Create: `src/bootstrap/identity.server.ts`
- Modify: `auth.ts`
- Modify: `src/lib/auth/google-login.adapter.ts` (fachada temporal)
- Modify: `src/lib/auth/local-login.adapter.ts` (fachada temporal)
- Modify: `src/modules/usuarios/google-login.domain.ts` (fachada temporal)
- Modify: `src/modules/usuarios/credentials.domain.ts` (fachada temporal)
- Modify: `src/modules/usuarios/auth-config.domain.ts` (fachada temporal)
- Modify: `src/modules/usuarios/roles.ts` (fachada temporal)
- Create: `test/identity-bootstrap.test.ts`

**Interfaces:**
- Consumes: `@/src/modules/identity/api`, `@/src/lib/db`, `@/src/lib/config/encryption`, `@/src/modules/asistencia/calendario-asistente.service`.
- Produces: `obtenerServicioIdentity()` con `autenticarCredenciales` y `resolverUsuarioGoogle`.
- Modifies `auth.ts`: Ya NO importa `db`, `descifrarConfiguracion`, ni adaptadores de Google Calendar. Delega en `obtenerServicioIdentity()`.

- [ ] **Step 1: Write the bootstrap test**

Crear `test/identity-bootstrap.test.ts`.

- [ ] **Step 2: Implement `src/bootstrap/identity.server.ts`**

Implementar el ensamblador server-only.

- [ ] **Step 3: Refactor `auth.ts` to be a pure Auth.js adapter**

Eliminar imports directos de base de datos, cifrado y Google Calendar en `auth.ts`. Delegar en `obtenerServicioIdentity()`.

- [ ] **Step 4: Set up backward-compatible facades**

Asegurar que los archivos legacy reexporten desde `@/src/modules/identity/api` para no romper ningún test existente ni import en páginas.

- [ ] **Step 5: Run full test suite and boundary check**

Run: `npx vitest run test/identity-bootstrap.test.ts test/architecture-boundaries.test.ts test/auth-config.test.ts test/google-login-domain.test.ts`
Expected: ALL PASS.

- [ ] **Step 6: Commit**

```bash
git add src/bootstrap/identity.server.ts auth.ts src/lib/auth/ src/modules/usuarios/ test/identity-bootstrap.test.ts
git commit -m "feat(auth): desacoplar auth.ts de prisma y calendario delegando en identity"
```

---

### Task 6: Verificación Global de la Etapa 2

**Files:**
- None (verificación pura sobre el árbol completo)

**Interfaces:**
- Consumes: Todo el repositorio.
- Produces: Validación estricta de TypeScript, suite completa de Vitest, esquema Prisma y compilación de producción.

- [ ] **Step 1: Run TypeScript check**

Run: `npm run check`
Expected: PASS con 0 errores de tipo.

- [ ] **Step 2: Run complete test suite**

Run: `npm test`
Expected: PASS con 100% de pruebas aprobadas (100+ archivos de test).

- [ ] **Step 3: Validate database schema**

Run: `npm run validate:schema`
Expected: PASS.

- [ ] **Step 4: Run Next.js production build**

Run: `npm run build`
Expected: PASS con compilación exitosa.

