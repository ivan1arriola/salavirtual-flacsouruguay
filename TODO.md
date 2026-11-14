# TODO · Grabaciones y archivos de Zoom (2026-11-11)

Pendientes definidos al cierre de la sesión del 2026-11-11 (ver también [`docs/handoff/2026-11-11-pendientes-zoom-archivos.md`](docs/handoff/2026-11-11-pendientes-zoom-archivos.md)).

## 1. Estructura y formato de carpetas en Google Drive (`2026 - Grabaciones General`)

- [x] **Eliminar la jerarquía intermedia `AAAA/MM/` en Drive**  
  > Hecho en #239.
  - Actualmente `resolverCarpetaDestinoZoom` (`src/modules/archivos/application/resolver-carpeta-zoom.ts`) y `moverCarpetasVinculadasZoomUseCase` (`src/modules/archivos/application/mover-carpetas-vinculadas-zoom.use-case.ts`) crean `2026/11/<ocurrencia>` dentro de `2026 - Grabaciones General` (`workspace.driveDestinationId`).
  - Las carpetas de los encuentros deben quedar **directamente** dentro de `2026 - Grabaciones General`, igual que las de Google Meet.
- [x] **Usar el mismo formato de nombre de carpeta que Google Meet (`AAAAMMDD - Tema`)**  
  > Hecho en #239.
  - Reutilizar la convención de `nombreCarpetaReunion` (`src/modules/archivos/domain/meet-artifacts.domain.ts`):
    - Ejemplo: `20261110 - Curso básico – Proyecto MIEM FLACSO`
    - Ejemplo: `20261105 - Encuentros sincrónicos IAPE`
  - Cuando la ocurrencia está vinculada a un encuentro, usar la fecha y el título de la solicitud/encuentro (o el tema saneado con el mismo formato `AAAAMMDD - <Tema>`).
- [x] **Subcarpetas `Grabación 1`, `Grabación 2` cuando hay más de una grabación en el mismo encuentro (`AAAAMMDD - Tema`)**  
  > Hecho en #239.
  - Si un mismo encuentro/fecha-tema tiene **una única grabación/ocurrencia**, los archivos quedan directamente dentro de `AAAAMMDD - <Tema>`.
  - Si hay **más de una grabación** para ese mismo `AAAAMMDD - <Tema>` (por ejemplo, múltiples ocurrencias o cortes de grabación en la misma reunión, como pasa en `20261105 - Encuentros sincrónicos IAPE`), dentro de la carpeta `AAAAMMDD - <Tema>` deben crearse subcarpetas ordenadas cronológicamente:
    - `Grabación 1` (o `Grabacion 1`)
    - `Grabación 2` (o `Grabacion 2`)
  - Si primero existía una sola grabación en `AAAAMMDD - <Tema>` y luego aparece una segunda grabación del mismo encuentro, mover los archivos de la primera a `Grabación 1` y colocar la segunda en `Grabación 2`.
- [x] **Migrar/limpiar en Drive las 2 grabaciones ya transferidas bajo `2026/11/`**  
  > Automático al desplegar #239: el worker mueve y renombra las carpetas conservando IDs. **Manual:** borrar la carpeta `2026` vacía que quede en Drive.
  - Mover las carpetas ya creadas en producción (`2026/11/Conversatorio Virtual...` y `2026/11/Salud Mental...`) a la raíz de `2026 - Grabaciones General` con el nombre `AAAAMMDD - <Tema>` y eliminar la carpeta `2026` sobrante.

## 2. Barrido de Zoom: traer todo lo que devuelva Zoom (no solo 3 días)

- [x] **Ampliar el barrido automático para que no corte a los 3 días (`DIAS_BARRIDO_RECIENTE = 3`)**  
  > Hecho en #239 (barre desde `INICIO_HISTORICO_ZOOM`).
  - En `src/bootstrap/zoom-archivos.server.ts`, `DIAS_BARRIDO_RECIENTE = 3` hace que el worker solo consulte los últimos 3 días y deje sin inventariar reuniones anteriores.
  - Cambiar el barrido para que consulte **todo lo que Zoom devuelva** (activas y papelera, recorriendo las ventanas hacia atrás sobre toda la ventana de retención/histórico de Zoom sin requerir correr un comando manual aparte).
- [ ] **Verificar que se inventaríen, vinculen y transfieran las 7 ocurrencias detectadas en producción**  
  > Con #239 entran por el barrido amplio. **Falta verificar en producción** después de desplegar.
  - Ocurrencias actualmente disponibles en Zoom Cloud / Papelera en producción (`sala01`, `sala02`, `sala04`):
    1. `2026-11-09 20:45Z` · `sala01` · `82521296862` (`NwytKGeLR0WeVr5DUuzy9A==`) · *Conversatorio Virtual: Género, Interseccionalidad y Salud* (activa — ya inventariada y vinculada).
    2. `2026-11-07 12:46Z` · `sala01` · `82105638588` (`iJxu2kIsQu6sryIR2go8mw==`) · *Salud Mental, Subjetividad y Trabajo* (activa — ya inventariada y vinculada).
    3. `2026-11-05 21:49Z` · `sala04` · `85735775244` (`7AE2bEzhQruQGd2FUpubpQ==`) · *Taller de Escritura Creativa* (activa, 14 archivos — tiene `EventoProveedor` `cmw0m0lvy0037ixbiwa6n7tk2`, pendiente de entrar por barrido amplio).
    4. `2026-11-05 20:50Z` · `sala01` · `83615990493` (`mAnfBt72Q8yqrKipwgZ1VQ==`) · *Taller de Tesis I* (activa, 9 archivos — tiene `EventoProveedor` `cmw0go89100hjix5n012vf4sd`, pendiente de entrar por barrido amplio).
    5. `2026-11-05 20:48:49Z` · `sala02` · `81786459217` (`1TikYgzvR0uiSxLTfKAa/Q==`) · *Encuentros sincrónicos IAPE* (activa, 8 archivos — tiene `EventoProveedor` `cmw0m0etq002jixbib0cjmq7l`).
    6. `2026-11-05 20:48:05Z` · `sala02` · `81786459217` (`V75bI+VKTBq1ITM1DkiHIg==`) · *Encuentros sincrónicos IAPE* (**en papelera**, 1 archivo — mismo encuentro del `2026-11-05`, caso real para `Grabación 1` y `Grabación 2` dentro de `20261105 - Encuentros sincrónicos IAPE`).
    7. `2026-11-04 14:02Z` · `sala01` · `86540870944` (`2Km5jl2FRIOzCqfnmRhWhg==`) · *Prueba* (activa, 3 archivos — `EventoProveedor` `cmw26q8s200hzixafacntd1zv` en estado `CANCELADA`).
- [x] **Omitir silenciosamente o desactivar del barrido las 14 cuentas `ZOOM_HISTORICO` dadas de baja (`404:z1001`)**  
  > Hecho en #239 (`anfitrionesInexistentes` en el resumen del barrido).
  - Las 14 cuentas `streaming01@flacso.edu.uy`..`streaming13@flacso.edu.uy` y `zoom-CscyhmgAQgeHVorudA4kfA` ya no existen como usuarios en Zoom (`404:z1001`); evitar que ensucien cada ciclo de logs una vez verificado que no existen en Zoom.
