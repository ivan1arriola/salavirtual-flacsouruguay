import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import type { PeriodoMes } from "@/src/modules/asistencia/resumen-administracion.domain";

export function AssistantPeriodNav({
  period,
  basePath,
}: Readonly<{ period: PeriodoMes; basePath: string }>) {
  return (
    <nav className="assistant-period-nav" aria-label="Cambiar período">
      <Link
        className="icon-button"
        href={`${basePath}?mes=${period.anterior}`}
        title="Mes anterior"
      >
        <ChevronLeft size={19} />
        <span className="sr-only">Mes anterior</span>
      </Link>
      <form>
        <input aria-label="Mes" name="mes" type="month" defaultValue={period.clave} />
        <button className="secondary-action" type="submit">
          Ver
        </button>
      </form>
      <Link
        className="icon-button"
        href={`${basePath}?mes=${period.siguiente}`}
        title="Mes siguiente"
      >
        <ChevronRight size={19} />
        <span className="sr-only">Mes siguiente</span>
      </Link>
    </nav>
  );
}
