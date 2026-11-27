import { resolverProveedorReunion } from "@/src/modules/reuniones/proveedor-reunion.domain";
import ReunionesPage from "./reuniones-lista-meet-page.server";
import ReunionesZoomPage from "./reuniones-lista-zoom-page.server";

/** Lista de reuniones en dos pestañas: Meet (sin migrar) y Zoom (nuevas y migradas). Abre Zoom por defecto. */
export default async function ReunionesListaPage(
  props: Readonly<{
    searchParams: Promise<Record<string, string | undefined>>;
  }>,
) {
  const { proveedor } = await props.searchParams;
  return resolverProveedorReunion(proveedor) === "GOOGLE_MEET" ? (
    <ReunionesPage searchParams={props.searchParams} />
  ) : (
    <ReunionesZoomPage searchParams={props.searchParams} />
  );
}
