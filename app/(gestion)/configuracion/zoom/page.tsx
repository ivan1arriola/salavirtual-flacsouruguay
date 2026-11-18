import { SettingsBlock, SettingsNotices } from "@/src/components/settings-block";
import { SettingsCenterShell, SettingsSectionHeader } from "@/src/components/settings-center-shell";
import { ZoomAgendaBlock } from "@/src/components/zoom-agenda-block";
import { ZoomConfigForm } from "@/src/components/zoom-config-form";
import { ZoomGrupoConfig } from "@/src/components/zoom-grupo-config";
import { ZoomWebhookConfig } from "@/src/components/zoom-webhook-config";
import { db } from "@/src/lib/db";
import { descifrarConfiguracion } from "@/src/lib/config/encryption";
import { formatDateTime } from "@/src/lib/ui/format";
import { obtenerDatosPaginaConfiguracion } from "@/src/modules/configuracion/api";
import { obtenerCredencialesZoom } from "@/src/modules/configuracion/zoom-config.service";
import { requireAdminPage } from "../require-admin-page";

const TEXTO_DIAGNOSTICO: Readonly<Record<string, string>> = {
  AUSENTES: "Sin credenciales activas y completas."
};

export default async function ConfiguracionZoomPage({
  searchParams
}: Readonly<{ searchParams: Promise<{ estado?: string; error?: string }> }>) {
  await requireAdminPage();
  const query = await searchParams;
  const [{ zoomGrupo }, zoomConfig, credenciales] = await Promise.all([
    obtenerDatosPaginaConfiguracion(db, "zoom"),
    db.configuracionZoom.findUnique({ where: { id: "principal" } }),
    obtenerCredencialesZoom(db, descifrarConfiguracion)
  ]);
  const credencialesOk = credenciales.disponible;
  const resumenCredenciales = credencialesOk
    ? "Credenciales disponibles. La conexión con Zoom no se verificó aquí."
    : (TEXTO_DIAGNOSTICO[credenciales.diagnostico] ?? "No se pudieron comprobar las credenciales.");
  const webhookOk = Boolean(zoomConfig?.webhookSecretCifrado);
  const ultimaSincronizacion = zoomGrupo?.ultimaSincronizacionAt
    ? formatDateTime(zoomGrupo.ultimaSincronizacionAt)
    : null;
  const sufijoSincronizacion = ultimaSincronizacion ? ` · última sincronización ${ultimaSincronizacion}` : "";
  const resumenGrupo = zoomGrupo?.grupoNombre
    ? `${zoomGrupo.grupoNombre}${sufijoSincronizacion}`
    : "Todavía no hay un grupo de Zoom seleccionado.";

  return (
    <SettingsCenterShell activeSection="zoom">
      <SettingsSectionHeader
        title="Zoom"
        description="Conexión, grupo de cuentas, avisos y agenda de Zoom."
      />
      <SettingsNotices error={query.error} estado={query.estado} mensajes={{}} />
      <div className="settings-workspace-flow">
        <SettingsBlock
          title="Conexión"
          summary={resumenCredenciales}
          status={{
            tone: credencialesOk ? "neutral" : "warning",
            label: credencialesOk ? "Guardada" : "Falta configurar"
          }}
          defaultOpen={!credencialesOk}
        >
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
        </SettingsBlock>
        <SettingsBlock
          title="Grupo de cuentas"
          summary={resumenGrupo}
        >
          <ZoomGrupoConfig
            grupoId={zoomGrupo?.grupoId ?? null}
            grupoNombre={zoomGrupo?.grupoNombre ?? null}
            ultimaSincronizacionFecha={ultimaSincronizacion}
            ultimaSincronizacionResultado={zoomGrupo?.ultimaSincronizacionResultado ?? null}
          />
        </SettingsBlock>
        <SettingsBlock
          title="Notificaciones de Zoom"
          summary={webhookOk ? "Secreto del webhook configurado." : "El secreto del webhook no está configurado."}
          status={{ tone: webhookOk ? "ok" : "warning", label: webhookOk ? "Configurado" : "Pendiente" }}
        >
          <ZoomWebhookConfig initialConfigured={webhookOk} />
        </SettingsBlock>
        <SettingsBlock title="Agenda" summary="Sincronización de la agenda de Zoom.">
          <ZoomAgendaBlock />
        </SettingsBlock>
      </div>
    </SettingsCenterShell>
  );
}
