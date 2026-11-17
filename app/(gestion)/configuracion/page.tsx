import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AssistantReportConfigForm } from "@/src/modules/asistencia/presentation/components/assistant-report-config-form";
import { EmailTestForm } from "@/src/components/email-test-form";
import {
  MailDeliveryDiagnostics,
  type EstadoCorreoAuditado
} from "@/src/components/mail-delivery-diagnostics";
import { SesEmailSettingsForm } from "@/src/components/ses-email-settings-form";
import { HistoricalMeetingsTable } from "@/src/components/historical-meetings-table";
import { MeetHostsConfig } from "@/src/components/meet-hosts-config";
import { PendingMeetOperationsManager } from "@/src/components/pending-meet-operations-manager";
import { SettingsCenterShell, SettingsSectionHeader } from "@/src/components/settings-center-shell";
import { SettingsOverview } from "@/src/components/settings-overview";
import { WorkspaceConfigForm } from "@/src/components/workspace-config-form";
import { ZoomConfigForm } from "@/src/components/zoom-config-form";
import { ZoomWebhookConfig } from "@/src/components/zoom-webhook-config";
import { ZoomGrupoConfig } from "@/src/components/zoom-grupo-config";
import { SincronizarAgendaZoomBoton } from "@/src/components/sincronizar-agenda-zoom-boton";
import { db } from "@/src/lib/db";
import { descifrarConfiguracion } from "@/src/lib/config/encryption";
import { obtenerCredencialesZoom } from "@/src/modules/configuracion/zoom-config.service";
import { consultarRegistrosZoomImportados } from "@/src/modules/configuracion/registros-zoom-consulta.service";
import { formatDateTime } from "@/src/lib/ui/format";
import {
  obtenerDatosPaginaConfiguracion,
  legacySettingsRedirect,
  resolveSettingsSection,
  workspaceReadiness
} from "@/src/modules/configuracion/api";
import { actualizarReportesAsistenciaAdmin } from "./actions";

const ESTADO_CREDENCIALES_ZOOM: Readonly<Record<string, string>> = {
  AUSENTES: "Sin credenciales activas y completas"
};

function resumenCredencialesZoom(
  disponible: boolean | null,
  diagnostico: string | null | undefined
): string | undefined {
  if (disponible === null) {
    return undefined;
  }
  if (disponible) {
    return "Configuración disponible";
  }
  return diagnostico === "AUSENTES" ? "Sin credenciales activas y completas" : "No se pudo comprobar";
}

export default async function ConfiguracionPage({
  searchParams
}: Readonly<{
  searchParams: Promise<{
    seccion?: string;
    estado?: string;
    error?: string;
    busqueda?: string | string[];
    pagina?: string | string[];
  }>;
}>) {
  const session = await auth();
  if (session?.user.role !== "ADMINISTRACION") {
    redirect("/");
  }
  const query = await searchParams;
  const legacyRedirect = legacySettingsRedirect(query.seccion);
  if (legacyRedirect) {
    redirect(legacyRedirect);
  }
  const section = resolveSettingsSection(query.seccion);
  const {
    configuration,
    assistantConfiguration,
    hosts,
    programCount,
    activeProgramCount,
    pendingMeetOperations,
    adminReportRecipients,
    availableHosts,
    zoomAvailableHosts,
    pendingOperationItems,
    zoomGrupo
  } = await obtenerDatosPaginaConfiguracion(db, section);

  const registrosZoom =
    section === "historico"
      ? await consultarRegistrosZoomImportados(db, { busqueda: query.busqueda, pagina: query.pagina })
      : null;

  const zoomConfig =
    section === "zoom" ? await db.configuracionZoom.findUnique({ where: { id: "principal" } }) : null;
  const zoomCredentials =
    section === "resumen" || section === "zoom"
      ? await obtenerCredencialesZoom(db, descifrarConfiguracion)
      : null;
  const zoomCredentialsAvailable = zoomCredentials?.disponible ?? null;
  const zoomCredentialsDiagnostic =
    zoomCredentials && !zoomCredentials.disponible ? zoomCredentials.diagnostico : undefined;

  const sesConfig =
    section === "correo" ? await db.configuracionCorreoSes.findUnique({ where: { id: "principal" } }) : null;
  const recentDeliveryAudits =
    section === "correo"
      ? await db.auditoria.findMany({
          where: { accion: "NOTIFICACION_CORREO_ESTADO" },
          orderBy: { createdAt: "desc" },
          take: 75,
          select: { id: true, createdAt: true, valorNuevo: true }
        })
      : [];

  const mailAttempts: readonly EstadoCorreoAuditado[] = recentDeliveryAudits.map((audit) => {
    const raw = audit.valorNuevo;
    const details =
      raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
    const estado =
      details.estado === "ACEPTADO" || details.estado === "OMITIDO" || details.estado === "ERROR"
        ? details.estado
        : "ERROR";
    return {
      id: audit.id,
      fecha: audit.createdAt.toISOString().replace("T", " ").slice(0, 19),
      tipo: typeof details.tipo === "string" ? details.tipo : "desconocido",
      estado,
      transporte: typeof details.transporte === "string" ? details.transporte : null,
      motivo: typeof details.motivo === "string" ? details.motivo : null
    };
  });

  const readiness = workspaceReadiness({
    serviceAccountEmail: configuration?.serviceAccountEmail ?? null,
    privateKeyConfigurada: Boolean(configuration?.privateKeyCifrada || configuration?.privateKey),
    serviceAccountSubject: configuration?.serviceAccountSubject ?? null,
    driveDestinationId: configuration?.driveDestinationId ?? null,
    activa: configuration?.activa ?? false
  });

  return (
    <SettingsCenterShell
      activeSection={section}
      navigationDetails={{
        salas: `${availableHosts} de ${hosts.length} cuentas habilitadas`,
        programas: `${activeProgramCount} de ${programCount} activos`,
        zoom: resumenCredencialesZoom(zoomCredentialsAvailable, zoomCredentialsDiagnostic)
      }}
    >
      {section === "resumen" ? (
        <>
          <SettingsSectionHeader
            eyebrow="Estado general"
            title="Resumen"
            description="Consultá lo que necesita atención o entrá al área que querés administrar."
          />
          <SettingsOverview
            data={{
              workspaceReady: Boolean(
                configuration?.serviceAccountEmail &&
                (configuration.privateKey || configuration.privateKeyCifrada) &&
                configuration.serviceAccountSubject &&
                configuration.driveDestinationId
              ),
              integrationActive: configuration?.activa ?? false,
              zoomAvailableHosts,
              zoomCredentialsAvailable: zoomCredentialsAvailable === true,
              zoomCredentialsDiagnostic,
              totalHosts: hosts.length,
              activePrograms: activeProgramCount,
              totalPrograms: programCount,
              pendingOperations: pendingMeetOperations.length
            }}
          />
          {pendingOperationItems.length > 0 ? (
            <section id="operaciones-pendientes" className="content-section settings-workspace-health">
              <PendingMeetOperationsManager items={pendingOperationItems} />
            </section>
          ) : null}
        </>
      ) : null}

      {section === "workspace" ? (
        <SettingsSectionHeader
          title="Google Workspace"
          description="Revisá la salud de la integración, sus credenciales, permisos y archivos."
          status={
            <span className={`settings-section-status ${readiness.ready ? "is-ok" : "is-warning"}`}>
              {readiness.readyCount} de {readiness.totalCount} requisitos
            </span>
          }
        />
      ) : null}

      {section === "zoom" ? (
        <SettingsSectionHeader
          title="Zoom"
          description="Credenciales, webhook y grupo de cuentas de Zoom."
          status={
            <span
              className={`settings-section-status ${zoomCredentialsAvailable ? "is-neutral" : "is-warning"}`}
            >
              {zoomCredentialsAvailable
                ? "Credenciales disponibles · conexión sin verificar"
                : (ESTADO_CREDENCIALES_ZOOM[zoomCredentialsDiagnostic ?? ""] ??
                  "No se pudieron comprobar las credenciales")}
            </span>
          }
        />
      ) : null}

      {section === "salas" ? (
        <SettingsSectionHeader
          title="Salas"
          description="Cuentas de Zoom y Meet que alojan reuniones."
          status={
            <span className="settings-section-status is-neutral">
              {availableHosts} de {hosts.length} cuentas habilitadas
            </span>
          }
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
          title="Registros Zoom importados"
          description="Consultá reuniones migradas de la plataforma anterior."
          status={<span className="settings-section-status is-neutral">Consulta de Zoom</span>}
        />
      ) : null}

      {query.estado === "reportes-asistencia-actualizados" ? (
        <p className="form-notice" role="status">
          Los destinatarios adicionales de los reportes fueron actualizados.
        </p>
      ) : null}
      {query.error ? (
        <p className="form-notice form-notice-error" role="alert">
          {query.error}
        </p>
      ) : null}

      {section === "workspace" ? (
        <div className="settings-workspace-flow">
          <WorkspaceConfigForm
            initial={
              configuration
                ? {
                    serviceAccountEmail: configuration.serviceAccountEmail,
                    serviceAccountSubject: configuration.serviceAccountSubject,
                    driveDestinationId: configuration.driveDestinationId,
                    privateKeyConfigurada: Boolean(
                      configuration.privateKeyCifrada || configuration.privateKey
                    ),
                    activa: configuration.activa
                  }
                : null
            }
          />
        </div>
      ) : null}

      {section === "zoom" ? (
        <div className="settings-workspace-flow">
          <ZoomConfigForm
            initial={
              zoomConfig
                ? {
                    accountId: zoomConfig.accountId,
                    clientId: zoomConfig.clientId,
                    clientSecretConfigurado: Boolean(zoomConfig.clientSecretCifrado),
                    activa: zoomConfig.activa
                  }
                : null
            }
          />
          <ZoomWebhookConfig initialConfigured={Boolean(zoomConfig?.webhookSecretCifrado)} />
          <section className="content-section" aria-labelledby="zoom-agenda-title">
            <div className="section-heading">
              <div>
                <h2 id="zoom-agenda-title">Agenda de Zoom</h2>
                <p>
                  Se sincroniza sola cada 30 minutos y con los avisos de Zoom. Forzá una sincronización
                  completa si creaste o cambiaste reuniones en Zoom y necesitás verlas ya. No modifica
                  reuniones en curso ni transcurridas.
                </p>
              </div>
            </div>
            <SincronizarAgendaZoomBoton />
          </section>
          <ZoomGrupoConfig
            grupoId={zoomGrupo?.grupoId ?? null}
            grupoNombre={zoomGrupo?.grupoNombre ?? null}
            ultimaSincronizacionFecha={
              zoomGrupo?.ultimaSincronizacionAt ? formatDateTime(zoomGrupo.ultimaSincronizacionAt) : null
            }
            ultimaSincronizacionResultado={zoomGrupo?.ultimaSincronizacionResultado ?? null}
          />
        </div>
      ) : null}

      {section === "salas" ? (
        <div className="settings-workspace-flow">
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
              enUso: host._count.eventosProveedor > 0,
              proveedorTipo: (host.proveedor?.tipo as "GOOGLE_MEET" | "ZOOM") ?? "GOOGLE_MEET",
              fueraDelGrupoAt: host.fueraDelGrupoAt?.toISOString() ?? null,
              reunionesFuturas: host.reunionesFuturas
            }))}
          />
        </div>
      ) : null}

      {section === "asistencia" ? (
        <AssistantReportConfigForm
          emails={assistantConfiguration?.correosCopiaReporteMensual ?? []}
          adminEmails={adminReportRecipients.flatMap(({ emailPrincipal }) =>
            emailPrincipal ? [emailPrincipal] : []
          )}
          action={actualizarReportesAsistenciaAdmin}
        />
      ) : null}

      {section === "correo" ? (
        <>
          <SesEmailSettingsForm config={sesConfig} />
          {query.estado === "correo-ses-actualizado" ? (
            <p className="form-notice" role="status">
              La configuración de Amazon SES fue actualizada.
            </p>
          ) : null}
          <h3 className="settings-subsection-title">Pruebas y diagnóstico</h3>
          <EmailTestForm defaultRecipient={session.user.email ?? ""} />
          <MailDeliveryDiagnostics attempts={mailAttempts} sesEnabled={sesConfig?.activa ?? false} />
        </>
      ) : null}

      {registrosZoom ? (
        <HistoricalMeetingsTable
          busqueda={registrosZoom.busqueda}
          pagina={registrosZoom.pagina}
          totalPaginas={registrosZoom.totalPaginas}
          total={registrosZoom.total}
          meetings={registrosZoom.registros.map((event) => ({
            id: event.id,
            date: formatDateTime(event.instancia.inicioProgramadoAt),
            title: event.instancia.solicitud.titulo,
            teacher:
              `${event.instancia.solicitud.docentePrograma.docente.usuario.nombres} ${event.instancia.solicitud.docentePrograma.docente.usuario.apellidos ?? ""}`.trim(),
            program: event.instancia.solicitud.docentePrograma.programa.nombre,
            account: event.cuentaProveedor?.emailOrganizador ?? event.cuentaProveedor?.nombre ?? "Sin cuenta",
            code: event.codigoReunion ?? "No disponible"
          }))}
        />
      ) : null}
    </SettingsCenterShell>
  );
}
