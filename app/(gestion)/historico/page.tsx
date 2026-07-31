import { Archive } from "lucide-react";
import { auth } from "@/auth";
import { db } from "@/src/lib/db";
import { formatDateTime } from "@/src/lib/ui/format";

export default async function HistoricoPage() {
  const session = await auth();
  const meetings = await db.eventoProveedor.findMany({
    where: {
      proveedor: { tipo: "ZOOM_HISTORICO" },
      ...(session?.user.role === "DOCENTE"
        ? {
            instancia: {
              solicitud: { docentePrograma: { docente: { usuarioId: session.user.id } } }
            }
          }
        : {})
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
          <h1>Histórico Zoom</h1>
          <p>Registros migrados de la plataforma anterior.</p>
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
