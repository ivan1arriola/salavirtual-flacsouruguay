import { MeetHostsConfig } from "@/src/components/meet-hosts-config";
import { SettingsCenterShell, SettingsSectionHeader } from "@/src/components/settings-center-shell";
import { db } from "@/src/lib/db";
import { obtenerDatosPaginaConfiguracion } from "@/src/modules/configuracion/api";
import { requireAdminPage } from "../require-admin-page";

export default async function ConfiguracionSalasPage() {
  await requireAdminPage();
  const { hosts, availableHosts } = await obtenerDatosPaginaConfiguracion(db, "salas");

  return (
    <SettingsCenterShell activeSection="salas">
      <SettingsSectionHeader
        title="Salas"
        description="Cuentas de Zoom que alojan reuniones."
        status={
          <span className="settings-section-status is-neutral">
            {availableHosts} de {hosts.length} cuentas habilitadas
          </span>
        }
      />
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
            proveedorTipo: "ZOOM" as const,
            fueraDelGrupoAt: host.fueraDelGrupoAt?.toISOString() ?? null,
            reunionesFuturas: host.reunionesFuturas
          }))}
        />
      </div>
    </SettingsCenterShell>
  );
}
