import { SettingsBlock } from "@/src/components/settings-block";
import { SettingsCenterShell, SettingsSectionHeader } from "@/src/components/settings-center-shell";
import { WorkspaceConfigForm } from "@/src/components/workspace-config-form";
import { db } from "@/src/lib/db";
import { obtenerDatosPaginaConfiguracion } from "@/src/modules/configuracion/api";
import { workspaceReadiness } from "@/src/modules/configuracion/settings-navigation.domain";
import { requireAdminPage } from "../require-admin-page";

export default async function ConfiguracionGooglePage() {
  await requireAdminPage();
  const { configuration } = await obtenerDatosPaginaConfiguracion(db, "google");
  const privateKeyConfigurada = Boolean(configuration?.privateKeyCifrada || configuration?.privateKey);
  const readiness = workspaceReadiness({
    serviceAccountEmail: configuration?.serviceAccountEmail ?? null,
    privateKeyConfigurada,
    serviceAccountSubject: configuration?.serviceAccountSubject ?? null,
    driveDestinationId: configuration?.driveDestinationId ?? null,
    activa: configuration?.activa ?? false
  });

  return (
    <SettingsCenterShell activeSection="google">
      <SettingsSectionHeader
        title="Google"
        description="Cuenta de servicio con delegación y destino de Drive."
        status={
          <span className={`settings-section-status ${readiness.ready ? "is-ok" : "is-warning"}`}>
            {readiness.readyCount} de {readiness.totalCount} requisitos
          </span>
        }
      />
      <div className="settings-workspace-flow">
        <SettingsBlock
          title="Cuenta de servicio, delegación y Drive"
          summary={
            configuration
              ? `${configuration.serviceAccountEmail ?? "Sin cuenta de servicio"} · delegación: ${configuration.serviceAccountSubject ?? "sin definir"}`
              : "Todavía no hay una configuración guardada."
          }
          status={{
            tone: readiness.ready ? "ok" : "warning",
            label: readiness.ready ? "Lista" : "Incompleta"
          }}
          defaultOpen={!readiness.ready}
        >
          <WorkspaceConfigForm
            initial={
              configuration
                ? {
                    serviceAccountEmail: configuration.serviceAccountEmail,
                    serviceAccountSubject: configuration.serviceAccountSubject,
                    driveDestinationId: configuration.driveDestinationId,
                    privateKeyConfigurada,
                    activa: configuration.activa
                  }
                : null
            }
          />
        </SettingsBlock>
      </div>
    </SettingsCenterShell>
  );
}
