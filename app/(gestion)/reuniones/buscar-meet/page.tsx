import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/src/lib/db";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { toHttpError } from "@/src/lib/http/api-error";
import { puedeAdministrar } from "@/src/modules/usuarios/roles";
import { buscarMeet } from "@/src/bootstrap/reverse-meet-search.server";
import { extraerCohostEmailsDeInstancia, type MeetChange } from "@/src/modules/conferencias/api";
import styles from "./search.module.css";

export default async function ReverseMeetPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ q?: string | string[] }>;
}>) {
  const session = await auth();
  if (!session?.user) {
    redirect("/acceso");
  }
  const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
  if (!actor?.activo || !puedeAdministrar(actor.rol)) {
    redirect("/");
  }
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : "";
  let data: Awaited<ReturnType<typeof buscarMeet>> | null = null;
  let error: string | null = null;
  if (q.trim()) {
    try {
      data = await buscarMeet(actor, q);
    } catch (cause) {
      error = toHttpError(cause).message;
    }
  }
  return (
    <div className={styles["page"]}>
      <header>
        <Link href="/reuniones">Reuniones</Link>
        <h1>Buscar reunión por Google Meet</h1>
        <p>Consultá enlaces vigentes y anteriores, en cualquier fecha.</p>
      </header>
      <form action="/reuniones/buscar-meet" method="get" className={styles["form"]}>
        <label htmlFor="meet-search">Enlace o código de Meet</label>
        <div className={styles["inputRow"]}>
          <input
            id="meet-search"
            name="q"
            type="text"
            defaultValue={q}
            required
            maxLength={2048}
            placeholder="jgw-boaw-dgr o https://meet.google.com/…"
            autoCapitalize="none"
            spellCheck={false}
            autoComplete="off"
            aria-describedby={error ? "meet-search-error" : undefined}
            aria-invalid={Boolean(error)}
          />
          <button className="primary-action" type="submit">
            Buscar
          </button>
        </div>
      </form>
      {error && (
        <p id="meet-search-error" role="alert" className={styles["notice"]}>
          {error}
        </p>
      )}
      {data && (
        <section aria-label="Resultados de la búsqueda" aria-live="polite">
          <p>
            Meet buscado: <strong>{data.searched.code}</strong> · {data.results.length} encuentro(s)
          </p>
          {data.multiple && (
            <p className={styles["notice"]}>
              Atención: el código coincide con varias reuniones. Revisá todas las fechas. Una serie
              puede compartir el enlace; también puede indicar una anomalía.
            </p>
          )}
          {!data.results.length && !data.series.length && (
            <p className={styles["empty"]}>
              No se encontraron coincidencias. Un enlace anterior sin auditoría conservada puede no
              aparecer.
            </p>
          )}
          {data.results.map(({ event, current, inconsistent, currentLinks, history }) => {
            const meeting = event.instancia;
            const request = meeting.solicitud;
            const creator = request.creadaPor;
            const cohosts = extraerCohostEmailsDeInstancia(meeting);
            const recordings = [
              ...event.archivos.map((file) => ({
                id: file.id,
                title: file.nombre,
                url: `https://drive.google.com/file/d/${encodeURIComponent(file.driveFileId)}/view`,
              })),
              ...meeting.grabaciones.map((file) => ({
                id: file.id,
                title: file.titulo,
                url: file.driveFileId
                  ? `https://drive.google.com/file/d/${encodeURIComponent(file.driveFileId)}/view`
                  : safeUrl(file.urlHistorica),
              })),
            ];
            return (
              <article key={event.id} className={styles["result"]}>
                <header>
                  <span className={current ? styles["badge"] : styles["historical"]}>
                    {current ? "Enlace vigente" : "Enlace histórico"}
                  </span>
                  <h2>{request.titulo}</h2>
                  <p>
                    {date(meeting.inicioProgramadoAt, meeting.timezone)} –{" "}
                    {time(meeting.finProgramadoAt, meeting.timezone)} ({meeting.timezone})
                  </p>
                  <p>{request.docentePrograma.programa.nombre}</p>
                </header>
                {!current && (
                  <p className={styles["notice"]}>
                    Este código pertenece a un enlace anterior de esta reunión.
                  </p>
                )}
                {inconsistent && (
                  <p className={styles["notice"]}>
                    El código y la URL guardados no coinciden. Hay que verificar el enlace vigente.
                  </p>
                )}
                <div className={styles["current"]}>
                  <strong>
                    {inconsistent ? "Enlaces actuales en conflicto" : "Enlace vigente"}
                  </strong>
                  {currentLinks.length ? (
                    currentLinks.map((link) => (
                      <div key={link.code}>
                        <code>{link.code}</code>
                        <br />
                        <a href={link.url} target="_blank" rel="noopener noreferrer">
                          {link.url}
                        </a>
                      </div>
                    ))
                  ) : (
                    <p>No hay un enlace vigente registrado.</p>
                  )}
                </div>
                <dl className={styles["facts"]}>
                  {event.cuentaProveedor && (
                    <>
                      <dt>Host / sala asignada</dt>
                      <dd>
                        {event.cuentaProveedor.emailOrganizador || event.cuentaProveedor.nombre}
                      </dd>
                    </>
                  )}
                  {!!cohosts.length && (
                    <>
                      <dt>Cohosts registrados</dt>
                      <dd>
                        {cohosts.join(", ")}
                        <small>
                          Configuración local; consultá la verificación de Google en el detalle.
                        </small>
                      </dd>
                    </>
                  )}
                  <dt>Estado</dt>
                  <dd>{meeting.estado.replaceAll("_", " ")}</dd>
                  <dt>Creada por</dt>
                  <dd>
                    {[creator.nombres, creator.apellidos].filter(Boolean).join(" ")}
                    {creator.emailPrincipal ? ` · ${creator.emailPrincipal}` : ""}
                  </dd>
                </dl>
                <details className={styles["details"]}>
                  <summary>Diagnóstico e historial de enlaces</summary>
                  <dl className={styles["facts"]}>
                    <dt>Encuentro</dt>
                    <dd>{meeting.id}</dd>
                    <dt>Solicitud</dt>
                    <dd>{request.id}</dd>
                    <dt>Evento proveedor</dt>
                    <dd>{event.id}</dd>
                    {event.externalEventId && (
                      <>
                        <dt>Evento de Calendar</dt>
                        <dd>{event.externalEventId}</dd>
                      </>
                    )}
                    <dt>Integración</dt>
                    <dd>{event.estadoIntegracion}</dd>
                    {event.sincronizadoAt && (
                      <>
                        <dt>Última sincronización</dt>
                        <dd>{date(event.sincronizadoAt, meeting.timezone)}</dd>
                      </>
                    )}
                    {event.operacionPendiente && (
                      <>
                        <dt>Operación pendiente</dt>
                        <dd>{event.operacionPendiente}</dd>
                      </>
                    )}
                  </dl>
                  {history.length ? (
                    <History changes={history} timezone={meeting.timezone} />
                  ) : (
                    <p>No hay historial previo conservado para este encuentro.</p>
                  )}
                  {!!recordings.length && (
                    <section>
                      <h3>Grabaciones relacionadas</h3>
                      <ul>
                        {recordings.map((file) => (
                          <li key={file.id}>
                            {file.url ? (
                              <a href={file.url} target="_blank" rel="noopener noreferrer">
                                {file.title}
                              </a>
                            ) : (
                              file.title
                            )}
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                </details>
                <Link
                  className="secondary-action"
                  href={`/reuniones/${encodeURIComponent(request.id)}`}
                >
                  Ver reunión
                </Link>
              </article>
            );
          })}
          {!!data.series.length && (
            <section className={styles["result"]}>
              <h2>Evidencia histórica de series</h2>
              <p>
                Estos registros vinculan el código a una serie, pero no permiten demostrar qué
                encuentro lo utilizó.
              </p>
              {data.series.map((series) => (
                <article key={series.id}>
                  <h3>
                    <Link href={`/reuniones/${encodeURIComponent(series.id)}`}>
                      {series.titulo}
                    </Link>
                  </h3>
                  <History changes={series.history} timezone="America/Montevideo" />
                </article>
              ))}
            </section>
          )}
        </section>
      )}
    </div>
  );
}

function History({
  changes,
  timezone,
}: Readonly<{ changes: readonly MeetChange[]; timezone: string }>) {
  return (
    <ol className={styles["history"]}>
      {[...changes].reverse().map((change) => (
        <li key={change.auditId}>
          <strong>{date(change.at, timezone)}</strong>
          {!!change.before.length && (
            <p>
              Anterior: <code>{change.before.join(", ")}</code>
            </p>
          )}
          {!!change.after.length && (
            <p>
              Registrado: <code>{change.after.join(", ")}</code>
            </p>
          )}
          {!change.after.length && <p>Se retiró el enlace registrado.</p>}
          <p>{change.reason || "Motivo no registrado."}</p>
          <small>
            Origen: {change.origin} · Auditoría: {change.auditId}
          </small>
        </li>
      ))}
    </ol>
  );
}
function date(value: Date, timezone: string) {
  return new Intl.DateTimeFormat("es-UY", {
    timeZone: timezone,
    dateStyle: "short",
    timeStyle: "short",
  }).format(value);
}
function time(value: Date, timezone: string) {
  return new Intl.DateTimeFormat("es-UY", { timeZone: timezone, timeStyle: "short" }).format(value);
}
function safeUrl(value: string | null): string | null {
  if (!value) {
    return null;
  }
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
