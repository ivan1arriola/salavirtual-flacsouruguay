import { Archive } from "lucide-react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { formatDateTime } from "@/src/lib/ui/format";
import {
  obtenerAlcanceHistorico,
  obtenerTituloHistorico
} from "@/src/modules/historico/historico.domain";

export default async function HistoricoPage() {
  const session = await auth();
  if (!session?.user) redirect("/acceso");
  const actor = await resolveSessionActor(db, {
    id: session.user.id,
    email: session.user.email
  });
  if (!actor?.activo) redirect("/acceso");

  const scope = obtenerAlcanceHistorico(actor.rol);
  const programIds = scope === "PROGRAMAS_DOCENTE"
    ? await db.docentePrograma.findMany({
        where: { docente: { usuarioId: actor.id }, activo: true },
        select: { programaId: true }
      }).then((associations) => associations.map(({ programaId }) => programaId))
    : [];
  const visibilityFilter =
    scope === "PROGRAMAS_DOCENTE"
      ? {
          instancia: {
            solicitud: { docentePrograma: { programaId: { in: programIds } } }
          }
        }
      : scope === "ASIGNACIONES_ASISTENTE"
        ? {
            instancia: {
              asignaciones: {
                some: {
                  asistente: { usuarioId: actor.id },
                  estado: { in: ["ASIGNADO" as const, "ACEPTADO" as const] }
                }
              }
            }
          }
        : {};
  const meetings = await db.eventoProveedor.findMany({
    where: {
      proveedor: { tipo: "ZOOM_HISTORICO" },
      ...visibilityFilter
    },
    orderBy: { instancia: { inicioProgramadoAt: "desc" } },
    take: 100,
    include: {
      cuentaProveedor: true,
      instancia: {
        include: {
          solicitud: {
            include: {
              docentePrograma: {
                include: {
                  programa: true,
                  docente: { include: { usuario: true } }
                }
              }
            }
          }
        }
      }
    }
  });

  return (
    <>
      <header className="page-header">
        <div>
          <p className="page-eyebrow">Solo consulta</p>
          <h1>{obtenerTituloHistorico(scope)}</h1>
          <p>{scopeDescription(scope)}</p>
        </div>
        <Archive size={28} color="var(--brand)" aria-hidden="true" />
      </header>
      <section className="content-section">
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Fecha</th><th>Reunión</th><th>Programa</th><th>Cuenta</th><th>Código Zoom</th></tr></thead>
            <tbody>
              {meetings.map((event) => {
                const request = event.instancia.solicitud;
                const association = request.docentePrograma;
                return (
                  <tr key={event.id}>
                    <td className="date-cell">{formatDateTime(event.instancia.inicioProgramadoAt)}</td>
                    <td><strong>{request.titulo}</strong><small>{association.docente.usuario.nombres} {association.docente.usuario.apellidos}</small></td>
                    <td>{association.programa.nombre}</td>
                    <td>{event.cuentaProveedor?.nombre ?? "Sin cuenta"}</td>
                    <td>{event.codigoReunion ?? "No disponible"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function scopeDescription(scope: ReturnType<typeof obtenerAlcanceHistorico>): string {
  if (scope === "COMPLETO") return "Todos los registros migrados de la plataforma anterior.";
  if (scope === "PROGRAMAS_DOCENTE") return "Reuniones de tus programas asociados.";
  return "Reuniones históricas vinculadas a tus asignaciones.";
}
