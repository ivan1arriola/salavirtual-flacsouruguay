import { HistoricalMeetingsTable } from "@/src/components/historical-meetings-table";
import { SettingsCenterShell, SettingsSectionHeader } from "@/src/components/settings-center-shell";
import { db } from "@/src/lib/db";
import { formatDateTime } from "@/src/lib/ui/format";
import { consultarRegistrosZoomImportados } from "@/src/modules/configuracion/registros-zoom-consulta.service";
import { requireAdminPage } from "../require-admin-page";

export default async function ConfiguracionHistoricoPage({
  searchParams
}: Readonly<{ searchParams: Promise<{ busqueda?: string | string[]; pagina?: string | string[] }> }>) {
  await requireAdminPage();
  const query = await searchParams;
  const registrosZoom = await consultarRegistrosZoomImportados(db, {
    busqueda: query.busqueda,
    pagina: query.pagina
  });

  return (
    <SettingsCenterShell activeSection="historico">
      <SettingsSectionHeader
        eyebrow="Solo consulta"
        title="Registros Zoom importados"
        description="Consultá reuniones migradas de la plataforma anterior."
        status={<span className="settings-section-status is-neutral">Consulta de Zoom</span>}
      />
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
    </SettingsCenterShell>
  );
}
