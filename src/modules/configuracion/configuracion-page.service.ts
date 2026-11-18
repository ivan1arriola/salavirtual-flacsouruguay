import type { PrismaClient } from "@prisma/client";
import { esCuentaAsignable } from "../reuniones/cuenta-asignable.domain";
import { obtenerCredencialPrincipalGoogleWorkspace } from "./google-workspace.service";
import { contarReunionesFuturasZoom } from "./zoom-grupo-sincronizacion.service";

export async function obtenerDatosPaginaConfiguracion(
  db: PrismaClient,
  section: string,
  ahora: Date = new Date()
) {
  const [
    configuration,
    assistantConfiguration,
    accounts,
    programCount,
    activeProgramCount,
    futureMeetingsByAccount,
    zoomGrupo
  ] = await Promise.all([
    obtenerCredencialPrincipalGoogleWorkspace(db, (k) => k, { requireActiva: false }),
    db.configuracionAsistenciaTecnica.findUnique({ where: { id: "principal" } }),
    db.cuentaProveedor.findMany({
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
    }),
    db.programa.count(),
    db.programa.count({ where: { activo: true } }),
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
