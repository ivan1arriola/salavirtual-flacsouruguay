import "server-only";
import { crearProveedorTokenZoom } from "../integrations/zoom/zoom-client";
import { listarAgendaCuentaZoom } from "../integrations/zoom/zoom-operations.client";
import { descifrarConfiguracion } from "../lib/config/encryption";
import { db } from "../lib/db";
import { obtenerCredencialesZoom } from "../modules/configuracion/zoom-config.service";
import { sincronizarAgendaZoom } from "../modules/operaciones/zoom-agenda-observada.service";

/**
 * Pull manual: consulta a Zoom la agenda de cada cuenta anfitriona activa y reconcilia el espejo local
 * (lo que los webhooks fueron registrando). Lo dispara una persona de administración desde el diagnóstico.
 */
export async function sincronizarAgendaZoomCompleta() {
  const credenciales = await obtenerCredencialesZoom(db, descifrarConfiguracion);
  if (!credenciales.disponible) {
    return { tipo: "ERROR", codigo: "ZOOM_NO_CONFIGURADO" } as const;
  }
  const auth = crearProveedorTokenZoom({
    accountId: credenciales.accountId,
    clientId: credenciales.clientId,
    clientSecret: credenciales.clientSecret,
  });
  const cuentas = await db.cuentaProveedor.findMany({
    where: { proveedor: { tipo: "ZOOM" }, activa: true, fueraDelGrupoAt: null },
    select: { id: true, nombre: true, externalAccountId: true, emailOrganizador: true },
    orderBy: { prioridad: "asc" },
  });
  const consultables = cuentas.flatMap(({ id, nombre, externalAccountId, emailOrganizador }) => {
    const usuarioZoomId = externalAccountId ?? emailOrganizador;
    return usuarioZoomId ? [{ id, nombre, usuarioZoomId, anfitrionZoomId: externalAccountId }] : [];
  });
  const resultados = await sincronizarAgendaZoom(db, {
    cuentaZoomId: credenciales.accountId,
    cuentas: consultables,
    listar: (usuarioZoomId) => listarAgendaCuentaZoom(auth, usuarioZoomId),
  });
  return {
    tipo: "OK",
    sinIdentidad: cuentas.length - consultables.length,
    resultados,
  } as const;
}
