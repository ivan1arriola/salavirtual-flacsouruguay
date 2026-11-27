import type { OcurrenciaAsistenciaZoomFicha } from "@/src/bootstrap/zoom-asistencia-lectura.server";
import styles from "./zoom-asistencia-ocurrencias.module.css";

const fecha = new Intl.DateTimeFormat("es-UY", {
  timeZone: "America/Montevideo",
  dateStyle: "full",
  timeStyle: "short",
});
const hora = new Intl.DateTimeFormat("es-UY", {
  timeZone: "America/Montevideo",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function estadoReporte(estado: string): string {
  if (estado === "DISPONIBLE") {
    return "Reporte disponible";
  }
  if (estado === "VACIO") {
    return "Reporte sin conexiones";
  }
  if (estado === "ERROR") {
    return "Error al sincronizar";
  }
  if (estado === "NO_DISPONIBLE") {
    return "Zoom aún no entregó el reporte";
  }
  return "Reporte pendiente";
}

/** Cada UUID de Zoom conserva su propio reporte, incluso si una clase se inició más de una vez. */
export function ZoomAsistenciaOcurrencias({
  ocurrencias,
}: Readonly<{ ocurrencias: readonly OcurrenciaAsistenciaZoomFicha[] }>) {
  return (
    <section className={styles["section"]} aria-label="Asistencia por cada reunión Zoom">
      <div>
        <h2>Resultados por ejecución de Zoom</h2>
        <p>Los correos de la asistencia son los informados por Zoom.</p>
      </div>
      {ocurrencias.length === 0 ? (
        <p>
          No hay ejecuciones de Zoom vinculadas a esta clase. Esto no demuestra que no hubiera
          asistentes.
        </p>
      ) : (
        ocurrencias.map((ocurrencia, indice) => (
          <details
            className={styles["occurrence"]}
            id={`ocurrencia-${ocurrencia.id}`}
            key={ocurrencia.id}
            open={ocurrencias.length === 1}
          >
            <summary>
              <strong>
                Zoom {indice + 1} · {fecha.format(ocurrencia.inicioRealAt)}
              </strong>
              <span>
                {estadoReporte(ocurrencia.estadoReporte)} · {ocurrencia.registros.length} registros
                con tiempo en reunión
              </span>
            </summary>
            {ocurrencia.registros.length ? (
              <div
                className={styles["scroll"]}
                tabIndex={0}
                aria-label="Desplazar participantes de esta reunión Zoom"
              >
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Participante</th>
                      <th scope="col">Entrada (UY)</th>
                      <th scope="col">Salida (UY)</th>
                      <th scope="col">Minutos</th>
                      <th scope="col">Conexiones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ocurrencia.registros.map((r) => (
                      <tr key={r.clave}>
                        <td>
                          <strong>{r.nombre}</strong>
                          <small>{r.email ?? "Sin correo informado"}</small>
                        </td>
                        <td>{r.primeraEntradaAt ? hora.format(r.primeraEntradaAt) : "—"}</td>
                        <td>{r.ultimaSalidaAt ? hora.format(r.ultimaSalidaAt) : "—"}</td>
                        <td>{r.minutos.toLocaleString("es-UY")}</td>
                        <td>{r.conexiones}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>
                {ocurrencia.estadoReporte === "VACIO"
                  ? "El reporte disponible no contiene conexiones dentro de la reunión."
                  : "Todavía no hay datos verificables de participación para esta ejecución."}
              </p>
            )}
          </details>
        ))
      )}
    </section>
  );
}
