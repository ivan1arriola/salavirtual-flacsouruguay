import { BookOpen, History, KeyRound, MailCheck, Settings, Video } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { EmailTestForm } from "@/src/components/email-test-form";
import { MeetHostsConfig } from "@/src/components/meet-hosts-config";
import { PendingMeetButton } from "@/src/components/pending-meet-button";
import { ProgramMembersConfig } from "@/src/components/program-members-config";
import { WorkspaceConfigForm } from "@/src/components/workspace-config-form";
import { db } from "@/src/lib/db";
import { formatDateTime } from "@/src/lib/ui/format";
import {
  actualizarProgramaAdmin,
  agregarIntegrantePrograma,
  crearProgramaAdmin,
  eliminarProgramaAdmin,
  invitarIntegrantePrograma,
  quitarIntegrantePrograma
} from "./actions";

type SettingsSection = "workspace" | "salas" | "programas" | "correo" | "historico";

export default async function ConfiguracionPage({
  searchParams
}: Readonly<{ searchParams: Promise<{ seccion?: string; programa?: string; estado?: string; error?: string }> }>) {
  const session = await auth();
  if (session?.user.role !== "ADMINISTRACION") redirect("/");
  const query = await searchParams;
  const requestedSection = query.seccion;
  const section: SettingsSection = requestedSection === "salas"
    || requestedSection === "programas"
    || requestedSection === "correo"
    || requestedSection === "historico"
    ? requestedSection
    : "workspace";
  const [configuration, hosts, programCount, pendingMeetOperations] = await Promise.all([
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
    db.programa.count(),
    db.eventoProveedor.findMany({
      where: {
        proveedor: { tipo: "GOOGLE_MEET" },
        operacionPendiente: { not: null }
      },
      select: { operacionPendiente: true }
    })
  ]);
  const [programs, teachers, academicUnits] = section === "programas"
    ? await Promise.all([
        db.programa.findMany({
          orderBy: { nombre: "asc" },
          select: {
            id: true,
            nombre: true,
            codigo: true,
            activo: true,
            unidadAcademicaId: true,
            unidadAcademica: { select: { id: true, nombre: true, activa: true } },
            docentes: {
              where: { activo: true },
              select: {
                docente: {
                  select: {
                    usuario: {
                      select: { id: true, nombres: true, apellidos: true, emailPrincipal: true, activo: true }
                    }
                  }
                }
              }
            }
          }
        }),
        db.usuario.findMany({
          where: { rol: "DOCENTE", activo: true },
          orderBy: [{ apellidos: "asc" }, { nombres: "asc" }],
          select: {
            id: true,
            nombres: true,
            apellidos: true,
            emailPrincipal: true,
            activo: true
          }
        }),
        db.unidadAcademica.findMany({
          orderBy: { nombre: "asc" },
          select: { id: true, nombre: true, activa: true }
        })
      ])
    : [[], [], []];
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
          description={`${programCount} programas`}
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

      {query.estado === "programa-creado" ? <p className="form-notice" role="status">El programa fue creado.</p> : null}
      {query.estado === "programa-actualizado" ? <p className="form-notice" role="status">Los datos del programa fueron actualizados.</p> : null}
      {query.estado === "programa-eliminado" ? <p className="form-notice" role="status">El programa fue eliminado.</p> : null}
      {query.estado === "integrante-agregado" ? <p className="form-notice" role="status">La persona fue agregada al programa.</p> : null}
      {query.estado === "integrante-quitado" ? <p className="form-notice" role="status">La persona fue quitada del programa. Su usuario y su historial se conservaron.</p> : null}
      {query.estado === "invitacion-enviada" ? <p className="form-notice" role="status">La persona fue creada, asociada al programa e invitada por correo.</p> : null}
      {query.estado === "invitacion-creada" ? <p className="form-notice" role="status">La persona fue creada y asociada. El correo de invitación no pudo enviarse.</p> : null}
      {query.error ? <p className="form-notice form-notice-error" role="alert">{query.error}</p> : null}

      {section === "workspace" ? (
        <div className="settings-grid settings-workspace-grid">
          <section className="content-section settings-wide">
            <PendingMeetButton
              operations={pendingMeetOperations.flatMap(({ operacionPendiente }) =>
                operacionPendiente ? [operacionPendiente] : []
              )}
            />
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
        <ProgramMembersConfig
          programs={programs.map((program) => ({
            id: program.id,
            nombre: program.nombre,
            codigo: program.codigo,
            activo: program.activo,
            unidadAcademicaId: program.unidadAcademicaId,
            unidadAcademica: program.unidadAcademica,
            members: program.docentes.map(({ docente }) => docente.usuario)
          }))}
          academicUnits={academicUnits}
          teachers={teachers.map((teacher) => ({
            id: teacher.id,
            nombres: teacher.nombres,
            apellidos: teacher.apellidos,
            emailPrincipal: teacher.emailPrincipal,
            activo: teacher.activo
          }))}
          expandedProgramId={query.programa}
          createProgramAction={crearProgramaAdmin}
          updateProgramAction={actualizarProgramaAdmin}
          deleteProgramAction={eliminarProgramaAdmin}
          addAction={agregarIntegrantePrograma}
          inviteAction={invitarIntegrantePrograma}
          removeAction={quitarIntegrantePrograma}
        />
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
