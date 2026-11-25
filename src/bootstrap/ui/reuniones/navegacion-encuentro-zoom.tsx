import { ArrowLeft, History, List } from "lucide-react";
import Link from "next/link";
import { RefreshButton } from "@/src/components/refresh-button";
import { OperationalAutoRefresh } from "@/src/components/operational-auto-refresh";
import type { ReunionOperativaView } from "@/src/modules/reuniones/reunion-operativa.service";
import styles from "./reunion-zoom-operativa.module.css";

export function NavegacionEncuentroZoom({
  reunion,
  rol,
  historica,
  actualizarAutomaticamente
}: Readonly<{
  reunion: ReunionOperativaView;
  rol: "ADMINISTRACION" | "DOCENTE" | "ASISTENTE_TECNICO";
  historica: boolean;
  actualizarAutomaticamente?: boolean;
}>) {
  const asistente = rol === "ASISTENTE_TECNICO";
  return (
    <nav className={styles.toolbar} aria-label="Navegación del encuentro">
      <Link href={asistente ? "/mi-agenda" : "/reuniones?proveedor=zoom"} className={styles.back}>
        <ArrowLeft size={17} aria-hidden="true" /> Volver a reuniones
      </Link>
      <div className={styles.refresh}>
        <Link href={`/reuniones/${reunion.solicitudId}`} className={styles.back}>
          <List size={16} aria-hidden="true" /> Ver serie y encuentros
        </Link>
        {historica ? (
          <>
            <span className={styles.historyTag}>
              <History size={15} aria-hidden="true" /> Historial
            </span>
            <OperationalAutoRefresh enabled={actualizarAutomaticamente ?? false} />
            <RefreshButton />
          </>
        ) : (
          <>
            <OperationalAutoRefresh
              enabled={actualizarAutomaticamente ?? (reunion.estado === "ESPERANDO_INICIO" || reunion.estado === "EN_CURSO")}
            />
            <RefreshButton />
          </>
        )}
      </div>
    </nav>
  );
}
