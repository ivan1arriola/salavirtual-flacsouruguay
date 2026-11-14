import Link from "next/link";
import type { ProveedorReunion } from "@/src/modules/reuniones/proveedor-reunion.domain";

const NOMBRES: Record<ProveedorReunion, string> = { GOOGLE_MEET: "Meet", ZOOM: "Zoom" };

/** Separa las reuniones por proveedor: las que siguen en Meet y las de Zoom (nuevas y migradas). */
export function ProveedorTabs({ activo }: Readonly<{ activo: ProveedorReunion }>) {
  const tabs = [
    { proveedor: "ZOOM", href: "/reuniones?proveedor=zoom" },
    { proveedor: "GOOGLE_MEET", href: "/reuniones?proveedor=meet" }
  ] as const;
  return (
    <nav className="proveedor-tabs" aria-label="Proveedor de reuniones">
      {tabs.map(({ proveedor, href }) => (
        <Link
          aria-current={proveedor === activo ? "page" : undefined}
          className={proveedor === activo ? "active" : ""}
          href={href}
          key={proveedor}
        >
          {NOMBRES[proveedor]}
        </Link>
      ))}
    </nav>
  );
}

/** Una serie migrada en parte se divide en dos paneles; este aviso lleva al otro. */
export function OtroProveedorAviso({
  proveedor,
  cantidad,
  href
}: Readonly<{ proveedor: ProveedorReunion; cantidad: number; href: string }>) {
  return (
    <p className="proveedor-aviso" role="note">
      Esta reunión también tiene {cantidad} {cantidad === 1 ? "encuentro" : "encuentros"} en{" "}
      {NOMBRES[proveedor]}. <Link href={href}>Ver los de {NOMBRES[proveedor]}</Link>
    </p>
  );
}
