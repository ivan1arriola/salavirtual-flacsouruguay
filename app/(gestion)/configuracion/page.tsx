import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AssistantReportConfigForm } from "@/src/modules/asistencia/presentation/components/assistant-report-config-form";
import { EmailTestForm } from "@/src/components/email-test-form";
import { SesEmailSettingsForm } from "@/src/components/ses-email-settings-form";
import { HistoricalMeetingsTable } from "@/src/components/historical-meetings-table";
import { MeetHostsConfig } from "@/src/components/meet-hosts-config";
import { PendingMeetOperationsManager } from "@/src/components/pending-meet-operations-manager";
import { ProgramMembersConfig } from "@/src/components/program-members-config";
import { SettingsCenterShell, SettingsSectionHeader } from "@/src/components/settings-center-shell";
import { SettingsOverview } from "@/src/components/settings-overview";
import { WorkspaceConfigForm } from "@/src/components/workspace-config-form";
import { db } from "@/src/lib/db";
import { formatDateTime } from "@/src/lib/ui/format";
import {
  obtenerDatosPaginaConfiguracion,
  resolveSettingsSection,
} from "@/src/modules/configuracion/api";
import {
  actualizarProgramaAdmin,
  actualizarReportesAsistenciaAdmin,
  agregarIntegrantePrograma,
  crearProgramaAdmin,
  eliminarProgramaAdmin,
  invitarIntegrantePrograma,
  quitarIntegrantePrograma
} from "./actions";

export default async function ConfiguracionPage({
  searchParams
}: Readonly<{ searchParams: Promise<{ seccion?: string; programa?: string; estado?: string; error?: string }> }>) {
  const session = await auth();
  if (session?.user.role !== "ADMINISTRACION") redirect("/");
  const query = await searchParams;
  const section = resolveSettingsSection(query.seccion);
  const {
    configuration,
    assistantConfiguration,
    hosts,
    programCount,
    activeProgramCount,
    pendingMeetOperations,
    programs,
    teachers,
    academicUnits,
    adminReportRecipients,
    historicalMeetings,
    availableHosts,
    pendingOperationItems
  } = await obtenerDatosPaginaConfiguracion(db, section);

  return (
    <SettingsCenterShell
      activeSection={section}
      navigationDetails={{
        salas: `${availableHosts} de ${hosts.length} disponibles`,
        programas: `${activeProgramCount} de ${programCount} activos`,
        workspace: pendingMeetOperations.length > 0
          ? `${pendingMeetOperations.length} pendientes`
          : "Integración y permisos"
      }}
    >
      {section === "resumen" ? (
        <>
          <SettingsSectionHeader
            eyebrow="Estado general"
            title="Resumen"
            description="Consultá lo que necesita atención o entrá al área que querés administrar."
          />
          <SettingsOverview data={{
            workspaceReady: Boolean(
              configuration?.serviceAccountEmail
              && (configuration.privateKey || configuration.privateKeyCifrada)
              && configuration.serviceAccountSubject
              && configuration.driveDestinationId
            ),
            integrationActive: configuration?.activa ?? false,
            availableHosts,
            totalHosts: hosts.length,
            activePrograms: activeProgramCount,
            totalPrograms: programCount,
            pendingOperations: pendingMeetOperations.length
          }} />
        </>
      ) : null}

      {section === "workspace" ? (
        <SettingsSectionHeader
          title="Google Workspace"
          description="Revisá la salud de la integración, sus credenciales, permisos y archivos."
          status={<span className={`settings-section-status ${pendingMeetOperations.length > 0 ? "is-warning" : "is-ok"}`}>{pendingMeetOperations.length > 0 ? `${pendingMeetOperations.length} pendientes` : "Sin pendientes"}</span>}
        />
      ) : null}

      {section === "salas" ? (
        <SettingsSectionHeader
          title="Salas"
          description="Administrá las cuentas institucionales que alojan las reuniones."
          status={<span className="settings-section-status is-neutral">{availableHosts} de {hosts.length} disponibles</span>}
        />
      ) : null}

      {section === "programas" ? (
        <SettingsSectionHeader
          title="Programas"
          description="Organizá los programas y las personas docentes que pueden crear reuniones."
          status={<span className="settings-section-status is-neutral">{activeProgramCount} activos</span>}
        />
      ) : null}

      {section === "asistencia" ? (
        <SettingsSectionHeader
          title="Monitoreo"
          description="Definí quién recibe los reportes mensuales de horas registradas."
        />
      ) : null}

      {section === "correo" ? (
        <SettingsSectionHeader
          title="Correo"
          description="Comprobá el canal utilizado para invitaciones y notificaciones."
        />
      ) : null}

      {section === "historico" ? (
        <SettingsSectionHeader
          eyebrow="Solo consulta"
          title="Histórico Zoom"
          description="Consultá reuniones migradas de la plataforma anterior."
          status={<span className="settings-section-status is-neutral">Últimos 100 registros</span>}
        />
      ) : null}

      {query.estado === "programa-creado" ? <p className="form-notice" role="status">El programa fue creado.</p> : null}
      {query.estado === "programa-actualizado" ? <p className="form-notice" role="status">Los datos del programa fueron actualizados.</p> : null}
      {query.estado === "programa-eliminado" ? <p className="form-notice" role="status">El programa fue eliminado.</p> : null}
      {query.estado === "integrante-agregado" ? <p className="form-notice" role="status">La persona fue agregada al programa.</p> : null}
      {query.estado === "integrante-quitado" ? <p className="form-notice" role="status">La persona fue quitada del programa. Su usuario y su historial se conservaron.</p> : null}
      {query.estado === "invitacion-enviada" ? <p className="form-notice" role="status">La persona fue creada, asociada al programa e invitada por correo.</p> : null}
      {query.estado === "invitacion-creada" ? <p className="form-notice" role="status">La persona fue creada y asociada. El correo de invitación no pudo enviarse.</p> : null}
      {query.estado === "reportes-asistencia-actualizados" ? <p className="form-notice" role="status">Los destinatarios adicionales de los reportes fueron actualizados.</p> : null}
      {query.error ? <p className="form-notice form-notice-error" role="alert">{query.error}</p> : null}

      {section === "workspace" ? (
        <div className="settings-workspace-flow">
          <section className="content-section settings-workspace-health">
            <PendingMeetOperationsManager items={pendingOperationItems} />
          </section>
          <WorkspaceConfigForm
            initial={configuration ? {
              serviceAccountEmail: configuration.serviceAccountEmail,
              serviceAccountSubject: configuration.serviceAccountSubject,
              driveDestinationId: configuration.driveDestinationId,
              privateKeyConfigurada: Boolean(configuration.privateKeyCifrada || configuration.privateKey),
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

      {section === "asistencia" ? (
        <AssistantReportConfigForm
          emails={assistantConfiguration?.correosCopiaReporteMensual ?? []}
          adminEmails={adminReportRecipients.flatMap(({ emailPrincipal }) => emailPrincipal ? [emailPrincipal] : [])}
          action={actualizarReportesAsistenciaAdmin}
        />
      ) : null}

      {section === "correo" ? (
        <>
          <SesEmailSettingsForm config={await db.configuracionCorreoSes.findUnique({ where: { id: "principal" } })} />
          {query.estado === "correo-ses-actualizado" ? <p className="form-notice" role="status">La configuración de Amazon SES fue actualizada.</p> : null}
          <EmailTestForm defaultRecipient={session.user.email ?? ""} />
        </>
      ) : null}

      {section === "historico" ? (
        <HistoricalMeetingsTable meetings={historicalMeetings.map((event) => ({
          id: event.id,
          date: formatDateTime(event.instancia.inicioProgramadoAt),
          title: event.instancia.solicitud.titulo,
          teacher: `${event.instancia.solicitud.docentePrograma.docente.usuario.nombres} ${event.instancia.solicitud.docentePrograma.docente.usuario.apellidos ?? ""}`.trim(),
          program: event.instancia.solicitud.docentePrograma.programa.nombre,
          account: event.cuentaProveedor?.emailOrganizador ?? event.cuentaProveedor?.nombre ?? "Sin cuenta",
          code: event.codigoReunion ?? "No disponible"
        }))} />
      ) : null}
    </SettingsCenterShell>
  );
}
