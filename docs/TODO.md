hay que arreglar algunas cosas
las grabaciones deben quedar en al carpeta que te indico con ese formato que tenian las de meet
si hay mas de una grabacion, debtro de la carpeta con fecha - tema deben quedar Grabacion 1, grabacion 2
Al consultar hacia atrás con el dry-run histórico aparecieron 7 ocurrencias en total (entre el 2026-11-04 y el 2026-11-09, incluida 1 en la papelera de Zoom), que todavía no se encolaron porque la recuperación histórica no se había ejecutado con --apply.

debe ser todo lo que te devuelva, no 3 dias

En el dry-run inicial (2026-08-01 a 2026-11-11) ya apareció el primer motivo:

El barrido continuo del worker (src/bootstrap/zoom-archivos.server.ts) solo revisa los últimos 3 días (DIAS_BARRIDO_RECIENTE = 3), donde hay únicamente 2 ocurrencias (del 9 de noviembre).
Al consultar hacia atrás con el dry-run histórico aparecieron 7 ocurrencias en total (entre el 2026-11-04 y el 2026-11-09, incluida 1 en la papelera de Zoom), que todavía no se encolaron porque la recuperación histórica no se había ejecutado con --apply.
Además, 14 de los 23 anfitriones configurados en base de datos devuelven 404:z1001 en Zoom.

Ya delegué a Codex (codex exec) la inspección completa en el servidor para listar el detalle exacto de esas 7 ocurrencias, cruzar los 23 anfitriones de PostgreSQL contra los usuarios actuales de la API de Zoom (por si hay anfitriones con ID cambiado o no registrados en CuentaProveedor) y verificar el resto de los eventos Zoom. Te comparto el resultado apenas termine Codex.
