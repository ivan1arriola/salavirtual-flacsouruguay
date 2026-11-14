# Pendientes · Grabaciones y archivos de Zoom (2026-11-11)

## 1. Estructura y formato de carpetas en Google Drive (`2026 - Grabaciones General`)

- [ ] **Sin subcarpetas `AAAA/MM/`**:
  - `resolverCarpetaDestinoZoom` (`src/modules/archivos/application/resolver-carpeta-zoom.ts`) y `moverCarpetasVinculadasZoomUseCase` (`src/modules/archivos/application/mover-carpetas-vinculadas-zoom.use-case.ts`) hoy crean `2026/11/<ocurrencia>` dentro de `2026 - Grabaciones General`.
  - Deben crear la carpeta del encuentro **directamente** bajo `2026 - Grabaciones General` (`workspace.driveDestinationId`), sin carpetas intermedias de año ni mes.
- [ ] **Formato idéntico al de Google Meet (`AAAAMMDD - Tema`)**:
  - Usar `nombreCarpetaReunion` (`src/modules/archivos/domain/meet-artifacts.domain.ts`), por ejemplo:
    - `20261110 - Curso básico – Proyecto MIEM FLACSO`
    - `20261107 - Taller Metodológico II orientación Profesional - Grupo Alejandro Sosa`
    - `20261105 - Encuentros sincrónicos IAPE`
- [ ] **Múltiples grabaciones dentro del mismo `AAAAMMDD - Tema`**:
  - Si hay más de una grabación para la misma carpeta `AAAAMMDD - Tema` (p. ej. varias ocurrencias de Zoom del mismo encuentro/día), dentro de `AAAAMMDD - Tema` deben quedar subcarpetas `Grabación 1`, `Grabación 2` (o `Grabacion 1`, `Grabacion 2`).
  - Si hay una sola grabación, los archivos quedan directamente en `AAAAMMDD - Tema`.
- [ ] **Reubicar en Drive lo ya subido en `2026/11/`**:
  - Mover las 2 carpetas ya creadas en producción a la raíz de `2026 - Grabaciones General` con formato `AAAAMMDD - <Tema>` y borrar la carpeta `2026` vacía.

## 2. Barrido de Zoom: traer todo lo que devuelva Zoom (no solo 3 días)

- [ ] **Quitar el límite de 3 días (`DIAS_BARRIDO_RECIENTE = 3`)**:
  - En `src/bootstrap/zoom-archivos.server.ts`, el barrido automático solo mira 3 días hacia atrás.
  - Debe barrer **todo lo que Zoom devuelva** (activas y papelera, recorriendo las ventanas hacia atrás sin depender de correr un script manual).
- [ ] **Verificar el ingreso y vínculo automático de las 7 ocurrencias halladas en Zoom**:
  1. `2026-11-09 20:45Z` · `sala01` · `82521296862` (`NwytKGeLR0WeVr5DUuzy9A==`) · *Conversatorio Virtual: Género, Interseccionalidad y Salud* (activa — ya vinculada).
  2. `2026-11-07 12:46Z` · `sala01` · `82105638588` (`iJxu2kIsQu6sryIR2go8mw==`) · *Salud Mental, Subjetividad y Trabajo* (activa — ya vinculada).
  3. `2026-11-05 21:49Z` · `sala04` · `85735775244` (`7AE2bEzhQruQGd2FUpubpQ==`) · *Taller de Escritura Creativa* (activa, 14 archivos — `EventoProveedor` `cmw0m0lvy0037ixbiwa6n7tk2`).
  4. `2026-11-05 20:50Z` · `sala01` · `83615990493` (`mAnfBt72Q8yqrKipwgZ1VQ==`) · *Taller de Tesis I* (activa, 9 archivos — `EventoProveedor` `cmw0go89100hjix5n012vf4sd`).
  5. `2026-11-05 20:48:49Z` · `sala02` · `81786459217` (`1TikYgzvR0uiSxLTfKAa/Q==`) · *Encuentros sincrónicos IAPE* (activa, 8 archivos — `EventoProveedor` `cmw0m0etq002jixbib0cjmq7l`).
  6. `2026-11-05 20:48:05Z` · `sala02` · `81786459217` (`V75bI+VKTBq1ITM1DkiHIg==`) · *Encuentros sincrónicos IAPE* (**en papelera**, 1 archivo — mismo encuentro del `2026-11-05`, debe quedar junto con la activa como `Grabación 1` y `Grabación 2`).
  7. `2026-11-04 14:02Z` · `sala01` · `86540870944` (`2Km5jl2FRIOzCqfnmRhWhg==`) · *Prueba* (activa, 3 archivos — `EventoProveedor` `cmw26q8s200hzixafacntd1zv`, `CANCELADA`).
