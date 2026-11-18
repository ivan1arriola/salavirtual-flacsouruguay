import type { PrismaClient } from "@prisma/client";
import { esCuentaAsignable } from "../reuniones/cuenta-asignable.domain";
import { obtenerCredencialPrincipalGoogleWorkspace } from "./google-workspace.service";
import { contarReunionesFuturasZoom } from "./zoom-grupo-sincronizacion.service";

export async function obtenerDatosPaginaConfiguracion(
  db: PrismaClient,
  section: string,
  ahora: Date = new Date()
) {
  const necesitaGoogle = section === "resumen" || section === "google";
  const necesitaCuentas = section === "resumen" || section === "salas";
  const [
    configuration,
    assistantConfiguration,
    accounts,
    programCount,
    activeProgramCount,
    futureMeetingsByAccount,
    zoomGrupo
  ] = await Promise.all([
    necesitaGoogle
      ? obtenerCredencialPrincipalGoogleWorkspace(db, (k) => k, { requireActiva: false })
      : Promise.resolve(null),
    section === "notificaciones"
      ? db.configuracionAsistenciaTecnica.findUnique({ where: { id: "principal" } })
      : Promise.resolve(null),
    necesitaCuentas
      ? db.cuentaProveedor.findMany({
          where: { proveedor: { tipo: "ZOOM" } },
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
            origenGrupoZoom: true,
            fueraDelGrupoAt: true,
            proveedor: { select: { tipo: true, nombre: true } },
            _count: { select: { eventosProveedor: true } }
          }
        })
      : Promise.resolve([]),
    section === "resumen" ? db.programa.count() : Promise.resolve(0),
    section === "resumen" ? db.programa.count({ where: { activo: true } }) : Promise.resolve(0),
    section === "salas" ? contarReunionesFuturasZoom(db, ahora) : Promise.resolve<Record<string, number>>({}),
    section === "zoom"
      ? db.configuracionZoom.findUnique({
          where: { id: "principal" },
          select: {
            grupoId: true,
            grupoNombre: true,
            ultimaSincronizacionAt: true,
            ultimaSincronizacionResultado: true
          }
        })
      : Promise.resolve(null)
  ]);

  const hosts = accounts.map((account) => ({
    ...account,
    reunionesFuturas: futureMeetingsByAccount[account.id] ?? 0
  }));

  const adminReportRecipients =
    section === "notificaciones"
      ? await db.usuario.findMany({
          where: { rol: "ADMINISTRACION", activo: true, emailPrincipal: { not: null } },
          orderBy: [{ apellidos: "asc" }, { nombres: "asc" }],
          select: { emailPrincipal: true }
        })
      : [];

  const availableHosts = hosts.filter(esCuentaAsignable).length;
  const zoomAvailableHosts = hosts.filter(
    (host) => host.proveedor?.tipo === "ZOOM" && esCuentaAsignable(host)
  ).length;

  return {
    configuration,
    assistantConfiguration,
    hosts,
    programCount,
    activeProgramCount,
    adminReportRecipients,
    availableHosts,
    zoomAvailableHosts,
    zoomGrupo
  };
}
