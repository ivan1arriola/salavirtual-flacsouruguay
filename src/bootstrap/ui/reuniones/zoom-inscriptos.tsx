import { Users } from "lucide-react";
import type { EstadoAsistenciaZoomEnVivo } from "@/src/integrations/zoom/zoom-live-participants.client";
import styles from "./reunion-zoom-operativa.module.css";

type Invitado = Readonly<{ id: string; nombre: string | null; email: string }>;

function estadoDeInscripto(email: string, asistencia: EstadoAsistenciaZoomEnVivo): string {
  if (asistencia.estado !== "DISPONIBLE") {
    return "Conexión no verificable";
  }
  const normalizado = email.trim().toLocaleLowerCase("en");
  const coincidencias = asistencia.participantes.filter(
    (p) => p.email?.trim().toLocaleLowerCase("en") === normalizado
  );
  if (coincidencias.some((p) => p.estado === "EN_REUNION")) {
    return "En reunión";
  }
  if (coincidencias.some((p) => p.estado === "EN_ESPERA")) {
    return "En sala de espera";
  }
  if (coincidencias.some((p) => p.estado === "DESCONECTADO")) {
    return "Conexión detectada; ya salió";
  }
  if (coincidencias.length) {
    return "Detectado; estado sin informar";
  }
  return "Sin coincidencia por correo en esta consulta";
}

/** Invitados programados del encuentro, separados de la asistencia y de los participantes de Zoom. */
export function ZoomInscriptos({
  invitados,
  asistenciaEnVivo
}: Readonly<{
  invitados: readonly Invitado[];
  asistenciaEnVivo: EstadoAsistenciaZoomEnVivo;
}>) {
  return (
    <section className={styles.card} aria-label="Personas inscriptas">
      <div className={styles.heading}>
        <Users size={19} aria-hidden="true" />
        <h2>Personas inscriptas</h2>
      </div>
      <p className={styles.registeredCount}>
        {invitados.length}{" "}
        {invitados.length === 1 ? "persona inscripta" : "personas inscriptas"} para este encuentro.
      </p>
      {invitados.length ? (
        <ul className={styles.registeredList}>
          {invitados.map((invitado) => (
            <li className={styles.registeredRow} key={invitado.id}>
              <div className={styles.registeredIdentity}>
                <strong>{invitado.nombre?.trim() || invitado.email}</strong>
                <span>{invitado.email}</span>
              </div>
              <span className={styles.registeredStatus}>
                {estadoDeInscripto(invitado.email, asistenciaEnVivo)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p>No hay personas inscriptas registradas para este encuentro.</p>
      )}
      <p className={styles.note}>
        El estado de conexión se estima por coincidencia exacta de correo con la consulta de Zoom.
        Si no hay coincidencia, no significa que la persona no haya participado: Zoom puede no informar
        su correo o usar otra identidad.
      </p>
    </section>
  );
}
