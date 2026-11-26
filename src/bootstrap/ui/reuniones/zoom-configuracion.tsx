import type { ConfiguracionZoom } from "@/src/integrations/zoom/zoom-client";
import styles from "./reunion-zoom-operativa.module.css";

function estado(valor: boolean | null | undefined): string {
  if (valor == null) {
    return "Sin verificar";
  }
  return valor ? "Sí" : "No";
}

export function ZoomConfiguracion({
  configuracion,
  anfitrion
}: Readonly<{
  configuracion?: ConfiguracionZoom;
  anfitrion: string | null;
}>) {
  const grabaciones: Record<string, string> = { none: "No", cloud: "En la nube", local: "Local" };
  const datos = [
    ["Sala de espera", estado(configuracion?.salaEspera)],
    ["Inscripción obligatoria", estado(configuracion?.inscripcion)],
    ["Código de acceso", estado(configuracion?.clave)],
    ["Autenticación obligatoria", estado(configuracion?.autenticacion)],
    ["Ingreso antes del anfitrión", estado(configuracion?.ingresoAntes)],
    ["Silenciar al ingresar", estado(configuracion?.silencio)],
    ["Grabación automática", grabaciones[configuracion?.grabacion ?? ""] ?? "Sin verificar"],
    ["Cuenta anfitriona en Zoom", configuracion?.anfitrion ?? "Sin verificar"],
    ["Cuenta asignada en Sala Virtual", anfitrion ?? "Sin asignar"],
    ["Anfitriones alternativos", configuracion?.alternativos === "" ? "Ninguno" : (configuracion?.alternativos ?? "Sin verificar")]
  ];
  return (
    <section className={styles.card} aria-label="Configuración efectiva de Zoom">
      <h2 className={styles.sectionTitle}>Configuración de Zoom</h2>
      <p className={styles.note}>Configuración de la reunión consultada en Zoom, no el estado de la ejecución.</p>
      <dl className={styles.facts}>
        {datos.map(([nombre, valor]) => (
          <div key={nombre}>
            <dt>{nombre}</dt>
            <dd>{valor}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
