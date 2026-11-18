import { Download } from "lucide-react";
import type { AsistenciaZoomFicha } from "@/src/bootstrap/zoom-asistencia-lectura.server";
import { ZoomAsistenciaOcurrencias } from "@/src/components/zoom-asistencia-ocurrencias";
import { ZoomAsistenciaConciliacion } from "@/src/components/zoom-asistencia-conciliacion";

const fecha = (valor: Date) =>
  new Intl.DateTimeFormat("es-UY", {
    timeZone: "America/Montevideo",
    dateStyle: "medium",
    timeStyle: "short"
  }).format(valor);

/**
 * Única vista de la asistencia de un encuentro Zoom (ficha y página de asistencia la comparten).
 * Los botones bajan el reporte tal como lo entrega Zoom, no los datos ya consolidados.
 */
export function ZoomAsistenciaVista({
  instanciaId,
  asistencia,
  puedeDescargar
}: Readonly<{ instanciaId: string; asistencia: AsistenciaZoomFicha; puedeDescargar: boolean }>) {
  const { registros, ocurrencias, estadoReporte } = asistencia;
  const conexiones = registros.reduce((total, r) => total + r.sesiones, 0);
  return (
    <section className="zoom-attendance" aria-label="Asistencia de Zoom">
      {estadoReporte === "ERROR" ? (
        <p className="attendance-empty" role="alert">
          La última sincronización con Zoom falló. Se conserva lo ya guardado.
        </p>
      ) : null}
      {puedeDescargar && ocurrencias.length > 0 ? (
        <section className="attendance-raw-export" aria-label="Datos originales de Zoom">
          <div className="attendance-raw-export-intro">
            <h2>Datos originales de Zoom</h2>
            <p>
              Reporte de participantes tal como lo entrega Zoom, en JSON y sin transformar. Se consulta a Zoom
              en el momento de la descarga.
            </p>
          </div>
          <div className="attendance-raw-export-buttons">
            {ocurrencias.map((o) => (
              <a
                className="attendance-raw-export-json"
                href={`/api/v1/reuniones/instancias/${encodeURIComponent(instanciaId)}/asistencia/zoom-original/${encodeURIComponent(o.id)}`}
                key={o.id}
              >
                <Download size={15} aria-hidden="true" />
                {ocurrencias.length > 1
                  ? `JSON original · ${fecha(o.inicioRealAt)}`
                  : "Descargar JSON original"}
              </a>
            ))}
          </div>
        </section>
      ) : null}
      <ZoomAsistenciaOcurrencias ocurrencias={ocurrencias} instanciaId={instanciaId} />
      <h2 className="zoom-attendance-title">Resumen consolidado del encuentro</h2>
      {registros.length === 0 ? (
        <p className="attendance-empty">
          {estadoReporte === "VACIO"
            ? "El reporte de Zoom no contiene conexiones."
            : "Zoom todavía no entregó un reporte para este encuentro. Esto no demuestra que no hubiera participantes."}
        </p>
      ) : (
        <>
          <p className="zoom-attendance-note">
            {registros.length} participantes · {conexiones} conexiones. Minutos y porcentaje sobre el horario
            programado, sin duplicar reingresos. Los correos son los informados por Zoom, no identidad
            confirmada.
          </p>
          <ZoomAsistenciaConciliacion
            instanciaId={instanciaId}
            registros={registros}
            invitados={asistencia.invitados}
            puedeConciliar={asistencia.puedeConciliar}
          />
        </>
      )}
    </section>
  );
}
