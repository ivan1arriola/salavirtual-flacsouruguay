import { BookOpen, History, KeyRound, MailCheck, Settings, Video } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { PendingMeetButton } from "@/src/components/pending-meet-button";
import { EmailTestForm } from "@/src/components/email-test-form";
import { MeetHostsConfig } from "@/src/components/meet-hosts-config";
import { WorkspaceConfigForm } from "@/src/components/workspace-config-form";
import { db } from "@/src/lib/db";
import { formatDateTime } from "@/src/lib/ui/format";

type SettingsSection = "workspace" | "salas" | "programas" | "correo" | "historico";

export default async function ConfiguracionPage({
  searchParams
}: Readonly<{ searchParams: Promise<{ seccion?: string }> }>) {
  const session = await auth();
  if (session?.user.role !== "ADMINISTRACION") redirect("/");
  const requestedSection = (await searchParams).seccion;
  const section: SettingsSection = requestedSection === "salas"
    || requestedSection === "programas"
    || requestedSection === "correo"
    || requestedSection === "historico"
    ? requestedSection
    : "workspace";
  const [configuration, hosts, programs, pendingMeet] = await Promise.all([
    db.configuracionGoogleWorkspace.findUnique({ where: { id: "principal" } }),
    db.cuentaProveedor.findMany({
      where: { proveedor: { tipo: "GOOGLE_MEET" } },
      orderBy: [{ prioridad: "asc" }, { id: "asc" }],
      select: {
        id: true,
        nombre: true,
        emailOrganizador: true,
        prioridad: true,
        limiteConcurrente: true,
        tieneLicencia: true,
        activa: true,
        secretRef: true,
        _count: { select: { eventosProveedor: true } }
      }
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
  const historicalMeetings = section === "historico"
    ? await db.eventoProveedor.findMany({
        where: { proveedor: { tipo: "ZOOM_HISTORICO" } },
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
      })
    : [];
  const availableHosts = hosts.filter((host) => host.activa && host.tieneLicencia).length;

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
          description={`${hosts.length} cuentas · ${availableHosts} disponibles`}
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
        <SettingsSectionLink
          active={section === "historico"}
          description="Registros migrados de la plataforma anterior"
          href="/configuracion?seccion=historico"
          icon={History}
          label="Histórico Zoom"
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
        <MeetHostsConfig
          hosts={hosts.map((host) => ({
            id: host.id,
            nombre: host.nombre,
            emailOrganizador: host.emailOrganizador,
            prioridad: host.prioridad,
            limiteConcurrente: host.limiteConcurrente,
            tieneLicencia: host.tieneLicencia,
            activa: host.activa,
            passwordConfigurada: Boolean(host.secretRef),
            enUso: host._count.eventosProveedor > 0
          }))}
        />
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

      {section === "historico" ? (
        <section className="content-section">
          <div className="section-heading">
            <div><h2>Histórico Zoom</h2><p>Registros migrados de la plataforma anterior. Solo consulta.</p></div>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Fecha</th><th>Reunión</th><th>Programa</th><th>Cuenta</th><th>Código Zoom</th></tr></thead>
              <tbody>
                {historicalMeetings.map((event) => {
                  const request = event.instancia.solicitud;
                  const association = request.docentePrograma;
                  return (
                    <tr key={event.id}>
                      <td className="date-cell">{formatDateTime(event.instancia.inicioProgramadoAt)}</td>
                      <td><strong>{request.titulo}</strong><small>{association.docente.usuario.nombres} {association.docente.usuario.apellidos}</small></td>
                      <td>{association.programa.nombre}</td>
                      <td>{event.cuentaProveedor?.emailOrganizador ?? event.cuentaProveedor?.nombre ?? "Sin cuenta"}</td>
                      <td>{event.codigoReunion ?? "No disponible"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
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
