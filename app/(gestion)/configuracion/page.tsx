import { redirect } from "next/navigation";
import { SettingsCenterShell, SettingsSectionHeader } from "@/src/components/settings-center-shell";
import { SettingsOverview } from "@/src/components/settings-overview";
import { db } from "@/src/lib/db";
import { descifrarConfiguracion } from "@/src/lib/config/encryption";
import { obtenerDatosPaginaConfiguracion } from "@/src/modules/configuracion/api";
import { legacySettingsRedirect } from "@/src/modules/configuracion/settings-navigation.domain";
import { obtenerCredencialesZoom } from "@/src/modules/configuracion/zoom-config.service";
import { requireAdminPage } from "./require-admin-page";

export default async function ConfiguracionInicioPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ seccion?: string; busqueda?: string; pagina?: string }>;
}>) {
  await requireAdminPage();
  const query = await searchParams;
  const legacy = legacySettingsRedirect(query.seccion, {
    ...(query.busqueda !== undefined ? { busqueda: query.busqueda } : {}),
    ...(query.pagina !== undefined ? { pagina: query.pagina } : {}),
  });
  if (legacy) {
    redirect(legacy);
  }

  const [
    { configuration, hosts, programCount, activeProgramCount, zoomAvailableHosts },
    credenciales,
  ] = await Promise.all([
    obtenerDatosPaginaConfiguracion(db, "resumen"),
    obtenerCredencialesZoom(db, descifrarConfiguracion),
  ]);

  return (
    <SettingsCenterShell activeSection="resumen">
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
            configuration.driveDestinationId,
          ),
          integrationActive: configuration?.activa ?? false,
          zoomAvailableHosts,
          zoomCredentialsAvailable: credenciales.disponible,
          ...(!credenciales.disponible
            ? { zoomCredentialsDiagnostic: credenciales.diagnostico }
            : {}),
          totalHosts: hosts.length,
          activePrograms: activeProgramCount,
          totalPrograms: programCount,
        }}
      />
    </SettingsCenterShell>
  );
}
