"use client";

import { useEffect, useState } from "react";
import type { OcurrenciaAsistenciaZoomFicha } from "@/src/bootstrap/zoom-asistencia-lectura.server";
import { formatDateTime } from "@/src/lib/ui/format";
import styles from "./zoom-asistencia-ocurrencias.module.css";

type Resultado = Readonly<{
  inicio: string | null;
  fin: string | null;
  duracionSegundos: number | null;
  estadoGrabacion: "EN_ZOOM" | "PROCESANDO" | "SIN_ARCHIVOS" | "SIN_CONFIRMAR";
}>;

function duracion(segundos: number): string {
  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  const s = segundos % 60;
  const partes = [h ? `${h} h` : "", m ? `${m} min` : "", s || !segundos ? `${s} s` : ""];
  return partes.filter(Boolean).join(" ");
}

function estadoGrabacion(
  pendiente: boolean,
  conArchivosInventariados: boolean,
  resultado: Resultado | null | undefined
): string {
  if (pendiente || resultado?.estadoGrabacion === "PROCESANDO") {
    return "Grabación en procesamiento";
  }
  if (resultado?.estadoGrabacion === "EN_ZOOM") {
    return "Grabación en Zoom. Respaldo en Drive pendiente.";
  }
  if (resultado?.estadoGrabacion === "SIN_ARCHIVOS") {
    return conArchivosInventariados ? "Respaldo en Drive no disponible" : "Sin grabación en la nube de Zoom";
  }
  return "Grabación por verificar";
}

export function ZoomResultadosOcurrencia({
  instanciaId,
  ocurrenciaId,
  pendiente,
  archivos
}: Readonly<{
  instanciaId: string;
  ocurrenciaId: string;
  pendiente: boolean;
  archivos: OcurrenciaAsistenciaZoomFicha["grabaciones"];
}>) {
  const base = `/api/v1/reuniones/instancias/${encodeURIComponent(instanciaId)}/asistencia/original-zoom`;
  const href = `${base}/${encodeURIComponent(ocurrenciaId)}`;
  const [resultado, setResultado] = useState<Resultado | null>();

  useEffect(() => {
    const control = new AbortController();
    async function consultar() {
      try {
        const respuesta = await fetch(`${href}?detalle=1`, { signal: control.signal });
        const detalle = respuesta.ok ? ((await respuesta.json()) as Resultado) : null;
        if (!control.signal.aborted) {
          setResultado(detalle);
        }
      } catch {
        if (!control.signal.aborted) {
          setResultado(null);
        }
      }
    }
    void consultar();
    return () => control.abort();
  }, [href]);

  const segundos = resultado?.duracionSegundos;
  const grabaciones = archivos.filter(({ url }) => url !== null);
  return (
    <div className={styles.resultados}>
      <dl>
        <div>
          <dt>Duración real</dt>
          <dd>{segundos == null ? "Por confirmar" : duracion(segundos)}</dd>
          {resultado?.inicio && resultado.fin ? (
            <dd>
              {formatDateTime(new Date(resultado.inicio))} a {formatDateTime(new Date(resultado.fin))}
            </dd>
          ) : null}
        </div>
        <div>
          <dt>Grabación</dt>
          {grabaciones.length ? (
            <dd>
              <ul>
                {grabaciones.map(({ id, url, tipo }) => (
                  <li key={id}>
                    <a href={url ?? undefined} rel="noreferrer" target="_blank">
                      {tipo === "VIDEO" ? "Ver video" : "Escuchar audio"} en Drive
                    </a>
                  </li>
                ))}
              </ul>
            </dd>
          ) : (
            <dd>{estadoGrabacion(pendiente, archivos.length > 0, resultado)}</dd>
          )}
        </div>
      </dl>
      <a className="secondary-action" href={href} download>
        Descargar JSON original de Zoom
      </a>
      {resultado === undefined ? <p role="status">Consultando duración y grabación en Zoom…</p> : null}
    </div>
  );
}
