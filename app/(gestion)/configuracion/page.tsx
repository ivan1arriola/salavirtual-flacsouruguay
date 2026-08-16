import { BookOpen, CheckCircle2, KeyRound, MailCheck, Settings, Video } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { PendingMeetButton } from "@/src/components/pending-meet-button";
import { EmailTestForm } from "@/src/components/email-test-form";
import { WorkspaceConfigForm } from "@/src/components/workspace-config-form";
import { db } from "@/src/lib/db";

type SettingsSection = "workspace" | "salas" | "programas" | "correo";

export default async function ConfiguracionPage({
  searchParams
}: Readonly<{ searchParams: Promise<{ seccion?: string }> }>) {
  const session = await auth();
  if (session?.user.role !== "ADMINISTRACION") redirect("/");
  const requestedSection = (await searchParams).seccion;
  const section: SettingsSection = requestedSection === "salas" || requestedSection === "programas" || requestedSection === "correo"
    ? requestedSection
    : "workspace";
  const [configuration, hosts, programs, pendingMeet] = await Promise.all([
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
        operacionPendiente: { not: null }
      }
    })
  ]);

  return (
    <>
      <header className="page-header">
        <div><p className="page-eyebrow">Administración</p><h1>Configuración</h1><p>Cada área se administra por separado.</p></div>
        <Settings size={28} color="var(--brand)" />
      </header>

      <nav className="settings-section-nav" aria-label="Secciones de configuración">
        <SettingsSectionLink
          active={section === "workspace"}
          description="Credenciales, delegación, Drive y estado"
          href="/configuracion?seccion=workspace"
          icon={KeyRound}
          label="Google Workspace"
        />
        <SettingsSectionLink
          active={section === "salas"}
          description={`${hosts.length} cuentas organizadoras`}
          href="/configuracion?seccion=salas"
          icon={Video}
          label="Salas Meet"
        />
        <SettingsSectionLink
          active={section === "programas"}
          description={`${programs.length} programas importados`}
          href="/configuracion?seccion=programas"
          icon={BookOpen}
          label="Programas"
        />
        <SettingsSectionLink
          active={section === "correo"}
          description="Prueba de invitaciones y notificaciones"
          href="/configuracion?seccion=correo"
          icon={MailCheck}
          label="Correo"
        />
      </nav>

      {section === "workspace" ? (
        <div className="settings-grid settings-workspace-grid">
          <section className="content-section settings-wide">
            <PendingMeetButton count={pendingMeet} />
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
        </div>
      ) : null}

      {section === "salas" ? (
        <section className="content-section">
          <div className="section-heading"><div><h2>Salas organizadoras de Meet</h2><p>Cuentas utilizadas para crear y alojar reuniones.</p></div></div>
          {hosts.length > 0 ? (
            <ul className="settings-list">
              {hosts.map((host) => (
                <li key={host.id}>
                  <span><strong>{host.nombre}</strong><small>{host.emailOrganizador}</small></span>
                  <span className={`status status-${host.activa && host.tieneLicencia ? "ok" : "error"}`}>
                    <CheckCircle2 size={14} />
                    {host.activa && host.tieneLicencia ? "Disponible" : host.activa ? "Sin licencia" : "Inactiva"}
                  </span>
                </li>
              ))}
            </ul>
          ) : <div className="empty-state"><Video size={24} /><p>No hay salas Meet configuradas.</p></div>}
        </section>
      ) : null}

      {section === "programas" ? (
        <section className="content-section">
          <div className="section-heading"><div><h2>Programas</h2><p>Programas institucionales y cantidad de docentes asociados.</p></div></div>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Programa</th><th>Código</th><th>Docentes</th><th>Estado</th></tr></thead>
              <tbody>{programs.map((program) => <tr key={program.id}><td><strong>{program.nombre}</strong></td><td>{program.codigo ?? "—"}</td><td>{program._count.docentes}</td><td><span className={`status status-${program.activo ? "ok" : "error"}`}>{program.activo ? "Activo" : "Inactivo"}</span></td></tr>)}</tbody>
            </table>
          </div>
        </section>
      ) : null}

      {section === "correo" ? (
        <EmailTestForm defaultRecipient={session.user.email ?? ""} />
      ) : null}
    </>
  );
}

function SettingsSectionLink({
  active,
  description,
  href,
  icon: Icon,
  label
}: Readonly<{
  active: boolean;
  description: string;
  href: string;
  icon: typeof Settings;
  label: string;
}>) {
  return (
    <Link aria-current={active ? "page" : undefined} className={active ? "is-active" : undefined} href={href}>
      <Icon size={20} aria-hidden="true" />
      <span><strong>{label}</strong><small>{description}</small></span>
    </Link>
  );
}
