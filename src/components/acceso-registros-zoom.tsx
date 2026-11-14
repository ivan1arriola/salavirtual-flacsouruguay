import Link from "next/link";
import type { RolUsuario } from "@/src/modules/usuarios/roles";

export function AccesoRegistrosZoom({ rol }: Readonly<{ rol: RolUsuario }>) {
  if (rol !== "ADMINISTRACION") {
    return null;
  }
  return (
    <Link className="secondary-action" href="/configuracion?seccion=historico">
      Registros Zoom importados · solo consulta
    </Link>
  );
}
