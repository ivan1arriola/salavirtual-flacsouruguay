import type { EntradaActividadZoom } from "@/src/modules/reuniones/presentation/actividad-encuentro-zoom";
import { ItemActividad } from "./zoom-actividad-item";
import styles from "./reunion-zoom-operativa.module.css";

const categorias = [
  "Ejecución",
  "Participación",
  "Sala de espera",
  "Anfitriones y roles",
  "Grabaciones",
  "Pantalla compartida",
  "Calidad técnica",
  "Grupos pequeños",
  "Inscripciones",
  "Configuración",
  "Transmisión",
  "Otros"
] as const;

function categoria(tipo: string): (typeof categorias)[number] {
  if (tipo.startsWith("recording.")) return "Grabaciones";
  if (tipo.includes("registration_")) return "Inscripciones";
  if (tipo.includes("breakout_room")) return "Grupos pequeños";
  if (tipo.includes("waiting") || tipo === "meeting.participant_admitted") return "Sala de espera";
  if (tipo.includes("role_changed")) return "Anfitriones y roles";
  if (tipo.startsWith("meeting.participant_")) return "Participación";
  if (tipo.includes("sharing_")) return "Pantalla compartida";
  if (tipo === "meeting.alert") return "Calidad técnica";
  if (tipo === "meeting.started" || tipo === "meeting.ended") return "Ejecución";
  if (tipo.includes("live_streaming")) return "Transmisión";
  if (/^meeting\.(created|updated|deleted|recovered|permanently_deleted)$/.test(tipo)) return "Configuración";
  return "Otros";
}

export function ZoomActividadCategorias({
  actividad,
  id
}: Readonly<{ actividad: readonly EntradaActividadZoom[]; id: string }>) {
  return (
    <section className={styles.card} aria-labelledby={id}>
      <h2 id={id} className={styles.sectionTitle}>
        Actividad por categoría
      </h2>
      <p className={styles.note}>
        Avisos recibidos de Zoom. La ausencia de avisos no confirma ausencia de actividad.
      </p>
      <div className={styles.categoryList}>
        {categorias.map((nombre) => {
          const avisos = actividad.filter((a) => categoria(a.tipo) === nombre).reverse();
          const total = avisos.reduce((n, a) => n + a.cantidad, 0);
          return (
            <details key={nombre}>
              <summary>
                {nombre} <span>· {total} avisos</span>
              </summary>
              {avisos.length ? (
                <ol className={styles.timeline}>
                  {avisos.map((a, i) => (
                    <ItemActividad key={a.huella ?? a.tipo + "-" + a.desde.toISOString() + "-" + i} a={a} />
                  ))}
                </ol>
              ) : (
                <p className={styles.note}>Sin avisos recibidos.</p>
              )}
            </details>
          );
        })}
      </div>
    </section>
  );
}
