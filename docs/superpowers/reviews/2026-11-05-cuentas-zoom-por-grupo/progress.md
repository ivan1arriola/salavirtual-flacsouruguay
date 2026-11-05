# SDD ledger — plan: docs/superpowers/plans/2026-11-05-cuentas-zoom-por-grupo.md
Branch: feat/cuentas-zoom-por-grupo (from docs/spec-cuentas-zoom-por-grupo, which holds spec+plan)
Pre-flight scan (pairs sharing file/interface):
| T1->T4,T7 | produces fields; T4/T7 consume same names | ok |
| T2->T4 | planner types consumed by service | ok |
| T3->T2 | T3 imports MiembroGrupoZoom from T2 domain file | ok (T2 before T3) |
| T3->T4 | client fns/ZoomPermisosError consumed | ok |
| T4->T6,T7 | service fns consumed by routes | ok |
| T5->all | shared filter, independent of schema except fueraDelGrupoAt (T1) | ok |
| T6,T7 | both touch salas-meet / meet-hosts-config consumers | ok |
| T1..T8 self-consistency | ok; Task 8 needs human (deploy) |
Ruling: scope names switched to granular (group:read:list_groups:admin, group_member:read:list_members:admin); user:read:admin dropped — handoff notes show Zoom 4711 error names granular scope; cost if wrong: error text names wrong scope.
Ruling: Task 7 also updates zoom-config-form.tsx scope help — the old help lists classic scopes; cost: cosmetic.
Ruling: Task 8 steps 1-5 beyond opening PR are not run by controller: merge/deploy requires explicit user confirmation and Zoom app status.
Task 1: dispatched implementer (agent aae0c5ccbd0606f5e), BASE 5a2881e
Task 1: minor (deferred): schema fields not column-aligned; test bloque() cuts at first '}'
Task 1: complete (commits 5a2881e..b6dd1ed, review clean)
Task 2: dispatched implementer (agent a1e376698d174acd1), BASE b6dd1ed
Task 2: minor (deferred): resumen verbose when nothing changes ("0 nuevas, 0 desactivadas, ..."); no test for singular/zero; duplicate-email accounts only first adopted, second untouched (corner case)
Task 2: complete (commits b6dd1ed..406967d, review clean)
Task 3: dispatched implementer (agent ad9c5f6078ff92db1), BASE 406967d
Task 3: minor (deferred): MENSAJE_PERMISOS const declared after the class using it; no fetch timeout/retry (matches existing pattern)
Task 3: complete (commits 406967d..4193191, review clean)
Task 4: dispatched implementer (agent a20de8c22be00b9be, opus), BASE 4193191
Task 4: review needs fixes (Important: 1 functional-architecture test red from Task 2 domain file; 2 email change in Zoom breaks sync via unique externalAccountId; 3 manual deactivation undone by reactivar)
Task 4: fix round 1/5 dispatched (resume a20de8c22be00b9be), FIX_BASE 2daa865
Task 4: minor (deferred): 5 elegirGrupoZoom lacks validation (Task 6 route must zod-validate grupoId trimmed non-empty); 6 sync audit has actorUsuarioId null; 7 every run rewrites all in-group accounts + noisy audit; 9 failed lock release rejects; 10 no test that release leaves newer lock alone
Ruling: Task 6 route must validate { grupoId, grupoNombre } with zod (trim, non-empty) — covers Task 4 minor 5 — cost if wrong: garbage id only stores a Zoom error, no data change.
Codex read-only review of Configuración launched (background), output .superpowers/sdd/.../codex-config-review.md
Ruling: user authorized agy --dangerously-skip-permissions (message 'autorizo la flag'); executed only inside an isolated detached worktree, never in the main checkout — cost if wrong: worktree cleanup left behind.
Task 4: fix round 1/5 implemented (commit da56ad9); scoped re-review dispatched, FIX_BASE 2daa865
Task 4: minor (deferred): planner floors new prioridad at 100 (max(existing,99)+1) vs plan "max existing +1"; sync audit has no actor
Task 4: fix round 1/5 (4 addressed, 0 open; commits 2daa865..da56ad9)
Task 4: minor (deferred): duplicate-email members dropped before id match (unrealistic)
Task 4: complete (commits 4193191..da56ad9, review clean)
Task 5: dispatched implementer (sonnet), BASE da56ad9
Task 5: minor (deferred): textual guard test misses differently formatted queries; configuracion-page.service.ts:184 counts hosts with activa&&tieneLicencia ignoring fueraDelGrupoAt (carry to Task 7); constant name Zoom-specific used in provider-scoped queries
Task 5: complete (commits da56ad9..d5d7d74, review clean)
Task 6: dispatched implementer (opus), BASE d5d7d74
Task 6: implemented 9b5ff45; review dispatched (FIX_BASE n/a)
Task 6: minor (deferred): cron compare not timing-safe (project-wide follow-up, all 7 cron routes); POST sync returns 200 {ok:false} (client must read data.ok/resumen, fallback data.error); Zoom PUT silently ignores nombre/email/tieneLicencia; unreachable Zoom branches left in Meet paths of salas-meet (later cleanup); GET groups hides curated "credenciales" error; no PUT null-session test
Ruling: Task 7 brief carries: client reads data.ok/data.resumen regardless of status, falls back to data.error; Zoom edit inputs for nombre/email/licencia read-only; "Agregar sala" no longer defaults to Zoom (Meet only); configuracion-page.service.ts:184 availability count must exclude fueraDelGrupoAt — cost if wrong: confusing UI only.
Task 6: complete (commits d5d7d74..9b5ff45, review clean)
Task 7: dispatched implementer (opus), BASE 9b5ff45
Task 7: implemented c7c19ea; review dispatched
Task 7: minor (deferred): stale seleccion when saved group not in list; no refresh after failed sync; English "Forbidden" 403 from route; last-sync line describes old group after group change (server should clear ultimaSincronizacion* on grupoId change); static-render test cannot prove no-fetch-in-effect
Task 7: complete (commits 9b5ff45..c7c19ea, review clean)
FINAL: whole-branch review dispatched (fable) over f30188f..c7c19ea
FINAL review: verdict Merge after fixes (0 Critical, 4 Important: 1 no preview/confirm before mass-changing sync; 2 license downgrade invisible in summary; 3 add-date on shared-link series whose account left group gives wrong message (gestionar-encuentros.service.ts:124-147); 4 manual sync not attributed to admin)
Ruling: Important 1 fixed with dry-run `vistaPrevia` (POST body) + UI confirmation + server refusal unless `confirmar:true` when plan would deactivate/mark more than half of currently assignable Zoom accounts; cron path never passes confirmar so it refuses (fail-safe) — cost if wrong: an admin sees an extra confirmation step; a legit big change needs a manual confirmed sync.
Ruling: Important 3 fixed with option (b) (specific Spanish error telling the admin the series room left the Zoom group; use «Unificar enlace» or a new series) rather than (a) (changing shared-event account loading) — lower risk in a production path; cost if wrong: admin cannot add dates to that series until fixed manually.
Ruling: Important 2 fixed by adding "N sin licencia" to resumen/audit and to the preview.
Ruling: also fixed cheaply: clear ultimaSincronizacion* in elegirGrupoZoom when grupoId changes; docs/configuracion-zoom-grupo.md written (Task 8 doc).
Ruling: periodic systemd timer (infra/ec2) is NOT part of this PR — installing it on deploy would start unattended syncs before the manual first sync is verified; follow-up PR after manual sync looks right (hourly or daily, not every 5 min).
Ruling: other final-review minors (EN_CURSO count, 401 vs 403 message, Postgres-backed groupBy test, etc.) deferred as follow-ups.
FINAL fix wave: commits c7c19ea..f207569 (ecf5278,51cbd30,eb3a9e7,f38cdd7,f207569); scoped re-review dispatched
FINAL fix wave re-review: all findings addressed, no Critical/Important, Merge-readiness: Ready to merge
Ruling: re-review Minor 1 (stale vistaPrevia survives guardarGrupo, so G2 can be synced with confirmar from G1's preview) fixed with a one-line dispatch before the PR because it weakens the mass-change guard; no further re-review (controller reads the diff) — cost if wrong: guard still bypassable via that UI sequence.
Ruling: re-review Minors 2-4 and out-of-scope observations deferred (preview doesn't list reactivations / marcarFuera repeats; doc line 27 slightly overstates guard; creating many accounts never counts as masivo — decide before scheduling the timer; cron refusals not stored; raw error texts like "fetch failed" reach UI).
PR #195 opened (not merged). Fix2 ed274ec.
