import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { seleccionarEventoProveedorActivo } from "@/src/modules/reuniones/evento-proveedor-activo.domain";
import { ParticipantesZoomVivo } from "@/src/components/participantes-zoom-vivo";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

type Vista = "proximas" | "en-curso" | "anteriores";
const PAGE_SIZE = 20;

const fechaUY = new Intl.DateTimeFormat("es-UY", {
  timeZone: "America/Montevideo",
  dateStyle: "full",
  timeStyle: "short",
});

export default async function MisClasesPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ vista?: string; pagina?: string }> }>) {
  const session = await auth();
  if (!session?.user) {
    redirect("/acceso");
  }
  const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
  if (!actor?.activo) {
    redirect("/acceso");
  }
  if (actor.rol !== "DOCENTE") {
    redirect("/reuniones");
  }

  const params = await searchParams;
  const vista: Vista =
    params.vista === "anteriores" || params.vista === "en-curso" ? params.vista : "proximas";
  const pagina = Math.min(10000, Math.max(1, Number.parseInt(params.pagina ?? "1", 10) || 1));
  const ahora = new Date();
  // Una clase puede seguir activa una hora después del horario previsto.
  const margen = new Date(ahora.getTime() - 60 * 60 * 1000);
  let filtroTiempo;
  if (vista === "proximas") {
    filtroTiempo = { inicioProgramadoAt: { gt: ahora } };
  } else if (vista === "en-curso") {
    filtroTiempo = { inicioProgramadoAt: { lte: ahora }, finProgramadoAt: { gte: margen } };
  } else {
    filtroTiempo = { finProgramadoAt: { lt: margen } };
  }

  const instancias = await db.instanciaSala.findMany({
    where: {
      estado: { not: "CANCELADA" },
      ...filtroTiempo,
      solicitud: {
        docentePrograma: {
          programa: {
            activo: true,
            docentes: {
              some: { activo: true, docente: { usuarioId: actor.id, usuario: { activo: true } } },
            },
          },
        },
      },
    },
    select: {
      id: true,
      ordinal: true,
      inicioProgramadoAt: true,
      finProgramadoAt: true,
      proveedorActivoTipo: true,
      solicitudSalaId: true,
      solicitud: {
        select: {
          titulo: true,
          docentePrograma: { select: { programa: { select: { nombre: true } } } },
        },
      },
      invitados: { select: { id: true, nombre: true, email: true }, orderBy: { email: "asc" } },
      eventosProveedor: {
        select: {
          proveedor: { select: { tipo: true } },
          codigoReunion: true,
          joinUrl: true,
          cuentaProveedor: { select: { nombre: true, emailOrganizador: true } },
          asistenciaZoom: { select: { id: true } },
          ocurrenciasArchivoZoom: { select: { estadoAsistencia: true } },
        },
      },
    },
    orderBy: { inicioProgramadoAt: vista === "anteriores" ? "desc" : "asc" },
    skip: (pagina - 1) * PAGE_SIZE,
    take: PAGE_SIZE + 1,
  });
  const haySiguiente = instancias.length > PAGE_SIZE;
  const clases = instancias.slice(0, PAGE_SIZE);

  return (
    <div className={styles["page"]}>
      <header className="page-header">
        <div>
          <p className="page-eyebrow">Actividad académica</p>
          <h1>Mis clases</h1>
          <p>Consultá invitados, participantes conectados y asistencia de tus programas.</p>
        </div>
      </header>
      <nav className={styles["tabs"]} aria-label="Estado de las clases">
        {(["proximas", "en-curso", "anteriores"] as const).map((tab) => (
          <Link
            key={tab}
            href={`/mis-clases?vista=${tab}`}
            aria-current={vista === tab ? "page" : undefined}
          >
            {{ proximas: "Próximas", "en-curso": "En curso", anteriores: "Anteriores" }[tab]}
          </Link>
        ))}
      </nav>
      <div className={styles["list"]}>
        {clases.length === 0 ? <p>No hay clases en esta sección.</p> : null}
        {clases.map((clase) => {
          const evento = seleccionarEventoProveedorActivo(clase);
          const zoom = evento?.proveedor.tipo === "ZOOM";
          const detalle = `/reuniones/${clase.solicitudSalaId}`;
          return (
            <article className={styles["card"]} key={clase.id}>
              <div className={styles["heading"]}>
                <div>
                  <small>
                    {clase.solicitud.docentePrograma.programa.nombre} · {zoom ? "Zoom" : "Meet"}
                  </small>
                  <h2>{clase.solicitud.titulo}</h2>
                  <p>
                    Encuentro {clase.ordinal} · {fechaUY.format(clase.inicioProgramadoAt)}–
                    {new Intl.DateTimeFormat("es-UY", {
                      timeZone: "America/Montevideo",
                      hour: "2-digit",
                      minute: "2-digit",
                    }).format(clase.finProgramadoAt)}
                  </p>
                </div>
                <Link href={detalle}>Ver clase</Link>
              </div>
              <dl className={styles["metadata"]}>
                <div>
                  <dt>Cuenta anfitriona</dt>
                  <dd>
                    {evento?.cuentaProveedor?.nombre ??
                      evento?.cuentaProveedor?.emailOrganizador ??
                      "Sin asignar"}
                  </dd>
                </div>
                {zoom ? (
                  <div>
                    <dt>ID de Zoom</dt>
                    <dd>{evento.codigoReunion ?? "Pendiente"}</dd>
                  </div>
                ) : null}
              </dl>
              <details className={styles["invited"]}>
                <summary>Invitados ({clase.invitados.length}) · antes de la clase</summary>
                {clase.invitados.length ? (
                  <ul>
                    {clase.invitados.map((invitado) => (
                      <li key={invitado.id}>
                        {invitado.nombre || invitado.email}{" "}
                        {invitado.nombre ? <small>{invitado.email}</small> : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>No hay invitados cargados.</p>
                )}
              </details>
              {vista === "en-curso" && zoom ? (
                <ParticipantesZoomVivo instanciaId={clase.id} />
              ) : null}
              {vista === "anteriores" ? (
                <div className={styles["attendance"]}>
                  <strong>
                    Asistencia real{" "}
                    {zoom && evento.asistenciaZoom.length
                      ? `· ${evento.asistenciaZoom.length} registros`
                      : ""}
                  </strong>
                  <p>
                    {zoom && !evento.ocurrenciasArchivoZoom.length
                      ? "Aún no hay un reporte de Zoom para este encuentro."
                      : "Consultá los participantes y la conciliación en el informe del encuentro."}
                  </p>
                  <Link href={`${detalle}/encuentros/${clase.id}/asistencia`}>Ver asistencia</Link>
                </div>
              ) : null}
              {evento?.joinUrl ? (
                <a href={evento.joinUrl} target="_blank" rel="noopener noreferrer">
                  Abrir {zoom ? "Zoom" : "Meet"}
                </a>
              ) : null}
            </article>
          );
        })}
      </div>
      <nav className={styles["pagination"]} aria-label="Páginas de clases">
        {pagina > 1 ? (
          <Link href={`/mis-clases?vista=${vista}&pagina=${pagina - 1}`}>Anterior</Link>
        ) : null}
        <span>Página {pagina}</span>
        {haySiguiente ? (
          <Link href={`/mis-clases?vista=${vista}&pagina=${pagina + 1}`}>Siguiente</Link>
        ) : null}
      </nav>
      <p>
        <Link href="/reuniones?vista=encuentros">Abrir agenda completa</Link>
      </p>
    </div>
  );
}
