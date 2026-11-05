import { ArrowLeft, History, RefreshCw } from "lucide-react";
import Link from "next/link";
import { RefreshButton } from "@/src/components/refresh-button";
import { OperationalAutoRefresh } from "@/src/components/operational-auto-refresh";
import type { ReunionOperativaView } from "@/src/modules/reuniones/reunion-operativa.service";
import styles from "./reunion-zoom-operativa.module.css";

export function NavegacionEncuentroZoom({ reunion, rol, historica }: Readonly<{
  reunion: ReunionOperativaView;
  rol: "ADMINISTRACION" | "DOCENTE" | "ASISTENTE_TECNICO";
  historica: boolean;
}>) {
  const asistente = rol === "ASISTENTE_TECNICO";
  return (
    <nav className={styles.toolbar} aria-label="Navegación del encuentro">
      <Link href={asistente ? "/mi-agenda" : "/reuniones?proveedor=zoom"} className={styles.back}>
        <ArrowLeft size={17} aria-hidden="true" /> Volver a reuniones
      </Link>
      <div className={styles.refresh}>
        {!asistente ? <Link href={`/reuniones/${reunion.solicitudId}`} className={styles.back}>Ficha y encuentros</Link> : null}
        {historica ? <span className={styles.historyTag}><History size={15} aria-hidden="true" /> Historial</span> : <>
          <OperationalAutoRefresh enabled={reunion.estado === "ESPERANDO_INICIO" || reunion.estado === "EN_CURSO"} />
          <RefreshButton />
        </>}
      </div>
    </nav>
  );
}
