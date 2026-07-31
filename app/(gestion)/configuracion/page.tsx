import { CheckCircle2, Settings } from "lucide-react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { PendingMeetButton } from "@/src/components/pending-meet-button";
import { MeetArtifactsButton } from "@/src/components/meet-artifacts-button";
import { WorkspaceConfigForm } from "@/src/components/workspace-config-form";
import { db } from "@/src/lib/db";

export default async function ConfiguracionPage() {
  const session = await auth();
  if (session?.user.role !== "ADMINISTRACION") redirect("/");
  const [configuration, hosts, programs, pendingMeet, finishedMeet] = await Promise.all([
    db.configuracionGoogleWorkspace.findUnique({ where: { id: "principal" } }),
    db.cuentaProveedor.findMany({
      where: { proveedor: { tipo: "GOOGLE_MEET" } },
      orderBy: { prioridad: "asc" }
    }),
    db.programa.findMany({
      orderBy: { nombre: "asc" },
      include: { _count: { select: { docentes: true } } }
    }),
    db.eventoProveedor.count({
      where: {
        proveedor: { tipo: "GOOGLE_MEET" },
        estadoIntegracion: { in: ["PENDIENTE", "ERROR"] },
        instancia: {
          inicioProgramadoAt: { gte: new Date() },
          estado: "PROGRAMADA"
        }
      }
    }),
    db.eventoProveedor.count({
      where: {
        proveedor: { tipo: "GOOGLE_MEET" },
        estadoIntegracion: "SINCRONIZADA",
        instancia: {
          finProgramadoAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), lte: new Date() },
          estado: { not: "CANCELADA" }
        }
      }
    })
  ]);

  return (
    <>
      <header className="page-header">
        <div><p className="page-eyebrow">Administración</p><h1>Configuración</h1><p>Google Workspace, salas host y programas.</p></div>
        <Settings size={28} color="var(--brand)" />
      </header>

      <div className="settings-grid">
        <section className="content-section settings-wide">
          <PendingMeetButton count={pendingMeet} />
          <MeetArtifactsButton count={finishedMeet} />
        </section>
        <WorkspaceConfigForm
          initial={configuration ? {
            serviceAccountEmail: configuration.serviceAccountEmail,
            serviceAccountSubject: configuration.serviceAccountSubject,
            driveDestinationId: configuration.driveDestinationId,
            privateKeyConfigurada: Boolean(configuration.privateKeyCifrada),
            activa: configuration.activa
          } : null}
        />

        <section className="content-section">
          <div className="section-heading"><div><h2>Salas con licencia Meet</h2><p>{hosts.length} cuentas configuradas.</p></div></div>
          <ul className="settings-list">
            {hosts.map((host) => (
              <li key={host.id}>
                <span><strong>{host.nombre}</strong><small>{host.emailOrganizador}</small></span>
                <span className={`status status-${host.activa && host.tieneLicencia ? "ok" : "error"}`}><CheckCircle2 size={14} />{host.activa ? "Activa" : "Inactiva"}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="content-section settings-wide">
          <div className="section-heading"><div><h2>Programas</h2><p>{programs.length} programas importados.</p></div></div>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Programa</th><th>Código</th><th>Docentes</th><th>Estado</th></tr></thead>
              <tbody>{programs.map((program) => <tr key={program.id}><td><strong>{program.nombre}</strong></td><td>{program.codigo ?? "—"}</td><td>{program._count.docentes}</td><td><span className={`status status-${program.activo ? "ok" : "error"}`}>{program.activo ? "Activo" : "Inactivo"}</span></td></tr>)}</tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}
