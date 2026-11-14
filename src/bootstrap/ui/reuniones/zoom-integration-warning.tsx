import Link from "next/link";
import styles from "./reunion-zoom-operativa.module.css";

export function ZoomIntegrationWarning({
  error,
  rol
}: Readonly<{ error: string; rol: "ADMINISTRACION" | "DOCENTE" | "ASISTENTE_TECNICO" }>) {
  return (
    <div className={styles.warning}>
      <p role="alert">
        No se pudo completar la sincronización con Zoom. Esto no confirma que el enlace haya dejado de
        funcionar.
      </p>
      <p>
        {rol === "ADMINISTRACION" ? (
          <Link href="/centro-operaciones/zoom">Revisar el diagnóstico de Zoom</Link>
        ) : (
          <a href="#incidencias">Registrá una incidencia para que administración pueda revisarla</a>
        )}
      </p>
      <details>
        <summary>Ver detalle técnico</summary>
        <p>{error}</p>
      </details>
    </div>
  );
}
