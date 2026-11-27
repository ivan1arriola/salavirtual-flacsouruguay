"use client";

import { useRouter } from "next/navigation";
import styles from "./reunion-zoom-operativa.module.css";

export function SelectorSeccionZoom({
  seccion,
  opciones
}: Readonly<{
  seccion: string;
  opciones: readonly { id: string; nombre: string }[];
}>) {
  const router = useRouter();
  return (
    <label className={styles.sectionSelector}>
      Sección de la reunión
      <select
        value={seccion}
        onChange={(event) =>
          router.push("?vista=historial&seccion=" + encodeURIComponent(event.target.value))
        }
      >
        {opciones.map((opcion) => (
          <option key={opcion.id} value={opcion.id}>
            {opcion.nombre}
          </option>
        ))}
      </select>
    </label>
  );
}
