import { SettingsNotices } from "@/src/components/settings-block";
import { SettingsCenterShell, SettingsSectionHeader } from "@/src/components/settings-center-shell";
import { db } from "@/src/lib/db";
import { AssistantReportConfigForm } from "@/src/modules/asistencia/presentation/components/assistant-report-config-form";
import { obtenerDatosPaginaConfiguracion } from "@/src/modules/configuracion/api";
import { actualizarReportesAsistenciaAdmin } from "../actions";
import { requireAdminPage } from "../require-admin-page";

export default async function ConfiguracionNotificacionesPage({
  searchParams
}: Readonly<{ searchParams: Promise<{ estado?: string; error?: string }> }>) {
  await requireAdminPage();
  const query = await searchParams;
  const { assistantConfiguration, adminReportRecipients } = await obtenerDatosPaginaConfiguracion(
    db,
    "notificaciones"
  );

  return (
    <SettingsCenterShell activeSection="notificaciones">
      <SettingsSectionHeader
        title="Notificaciones"
        description="Definí quién recibe los reportes mensuales de horas registradas."
      />
      <SettingsNotices
        error={query.error}
        estado={query.estado}
        mensajes={{
          "reportes-asistencia-actualizados": "Los destinatarios adicionales de los reportes fueron actualizados."
        }}
      />
      <AssistantReportConfigForm
        emails={assistantConfiguration?.correosCopiaReporteMensual ?? []}
        adminEmails={adminReportRecipients.flatMap(({ emailPrincipal }) =>
          emailPrincipal ? [emailPrincipal] : []
        )}
        action={actualizarReportesAsistenciaAdmin}
      />
    </SettingsCenterShell>
  );
}
