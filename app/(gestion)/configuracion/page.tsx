import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AssistantReportConfigForm } from "@/src/modules/asistencia/presentation/components/assistant-report-config-form";
import { EmailTestForm } from "@/src/components/email-test-form";
import { MailDeliveryDiagnostics, type EstadoCorreoAuditado } from "@/src/components/mail-delivery-diagnostics";
import { SesEmailSettingsForm } from "@/src/components/ses-email-settings-form";
import { HistoricalMeetingsTable } from "@/src/components/historical-meetings-table";
import { MeetHostsConfig } from "@/src/components/meet-hosts-config";
import { PendingMeetOperationsManager } from "@/src/components/pending-meet-operations-manager";
import { SettingsCenterShell, SettingsSectionHeader } from "@/src/components/settings-center-shell";
import { SettingsOverview } from "@/src/components/settings-overview";
import { WorkspaceConfigForm } from "@/src/components/workspace-config-form";
import { ZoomSettings } from "@/src/components/zoom-settings";
import { db } from "@/src/lib/db";
import { formatDateTime } from "@/src/lib/ui/format";
import {
  obtenerDatosPaginaConfiguracion,
  obtenerEstadoConfiguracionZoom,
  listarSalasZoom,
  legacySettingsRedirect,
  resolveSettingsSection,
} from "@/src/modules/configuracion/api";
import { actualizarReportesAsistenciaAdmin } from "./actions";

export default async function ConfiguracionPage({
  searchParams
}: Readonly<{ searchParams: Promise<{ seccion?: string; estado?: string; error?: string }> }>) {
  const session = await auth();
  if (session?.user.role !== "ADMINISTRACION") redirect("/");
  const query = await searchParams;
  const legacyRedirect = legacySettingsRedirect(query.seccion);
  if (legacyRedirect) redirect(legacyRedirect);
  const section = resolveSettingsSection(query.seccion);
  const {
    configuration,
    assistantConfiguration,
    hosts,
    programCount,
    activeProgramCount,
    pendingMeetOperations,
    adminReportRecipients,
    historicalMeetings,
    availableHosts,
    pendingOperationItems
  } = await obtenerDatosPaginaConfiguracion(db, section);

  const zoomConfig = section === "zoom" ? await obtenerEstadoConfiguracionZoom(db) : null;
  const zoomRooms = section === "zoom" ? await listarSalasZoom(db) : [];

  const sesConfig = section === "correo"
    ? await db.configuracionCorreoSes.findUnique({ where: { id: "principal" } })
    : null;
  const recentDeliveryAudits = section === "correo"
    ? await db.auditoria.findMany({
        where: { accion: "NOTIFICACION_CORREO_ESTADO" },
        orderBy: { createdAt: "desc" },
        take: 75,
        select: { id: true, createdAt: true, valorNuevo: true }
      })
    : [];

  const mailAttempts: readonly EstadoCorreoAuditado[] = recentDeliveryAudits.map((audit) => {
    const raw = audit.valorNuevo;
    const details = raw && typeof raw === "object" && !Array.isArray(raw)
      ? raw as Record<string, unknown> : {};
    const estado = details.estado === "ACEPTADO" || details.estado === "OMITIDO" || details.estado === "ERROR"
      ? details.estado : "ERROR";
    return {
      id: audit.id,
      fecha: audit.createdAt.toISOString().replace("T", " ").slice(0, 19),
      tipo: typeof details.tipo === "string" ? details.tipo : "desconocido",
      estado,
      transporte: typeof details.transporte === "string" ? details.transporte : null,
      motivo: typeof details.motivo === "string" ? details.motivo : null
    };
  });

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

      {section === "zoom" ? (
        <SettingsSectionHeader
          title="Zoom"
          description="Conectá la cuenta Zoom institucional y elegí qué usuarios con licencia alojan reuniones."
          status={<span className={`settings-section-status ${zoomConfig?.activa ? "is-ok" : "is-neutral"}`}>{zoomConfig?.activa ? "Activo" : "Inactivo"}</span>}
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

      {section === "zoom" && query.estado ? (
        <p className="form-notice" role="status">{mensajeEstadoZoom(query.estado)}</p>
      ) : null}
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

      {section === "zoom" && zoomConfig ? (
        <ZoomSettings config={zoomConfig} salas={zoomRooms} />
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
          <SesEmailSettingsForm config={sesConfig} />
          {query.estado === "correo-ses-actualizado" ? <p className="form-notice" role="status">La configuración de Amazon SES fue actualizada.</p> : null}
          <EmailTestForm defaultRecipient={session.user.email ?? ""} />
          <MailDeliveryDiagnostics attempts={mailAttempts} sesEnabled={sesConfig?.activa ?? false} />
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

function mensajeEstadoZoom(estado: string): string {
  if (estado === "zoom-actualizado") return "La configuración de Zoom fue guardada.";
  if (estado === "sala-zoom-actualizada") return "La sala Zoom fue actualizada.";
  const importadas = estado.match(/^salas-zoom-importadas-(\d+)-(\d+)$/);
  if (importadas) {
    return `Conexión correcta. Salas nuevas: ${importadas[1]}; actualizadas: ${importadas[2]}. Activá las que quieras usar.`;
  }
  return "Cambios guardados.";
}
