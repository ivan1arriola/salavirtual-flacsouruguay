import { createHash } from "node:crypto";
import { seleccionarEventoProveedorActivo } from "@/src/modules/reuniones/evento-proveedor-activo.domain";

type InstanciaZoom = Parameters<typeof seleccionarEventoProveedorActivo>[0] & {
  id: string;
  inicioProgramadoAt: Date;
  finProgramadoAt: Date;
  inicioAsistenciaTecnicaAt: Date | null;
  finAsistenciaTecnicaAt: Date | null;
  modalidadOverride: string | null;
  solicitud: { titulo: string; modalidad: string };
};

export type EventoCoberturaZoom = NonNullable<ReturnType<typeof eventoCoberturaZoom>>;

function sha256(texto: string): string {
  return createHash("sha256").update(texto).digest("hex");
}

export function eventoCoberturaZoom(instancia: InstanciaZoom, baseUrl: string) {
  if (seleccionarEventoProveedorActivo(instancia)?.proveedor.tipo !== "ZOOM") {
    return null;
  }
  const modalidad = instancia.modalidadOverride ?? instancia.solicitud.modalidad;
  const faltaHorario = !instancia.inicioAsistenciaTecnicaAt || !instancia.finAsistenciaTecnicaAt;
  if (modalidad === "HIBRIDA" && faltaHorario) {
    return null;
  }
  const inicio = instancia.inicioAsistenciaTecnicaAt ?? instancia.inicioProgramadoAt;
  const fin = instancia.finAsistenciaTecnicaAt ?? instancia.finProgramadoAt;
  const href = new URL(`/operacion/${encodeURIComponent(instancia.id)}`, baseUrl).href;
  const id = sha256(`flacso-cobertura-zoom:${instancia.id}`);
  const contenido = {
    summary: `Cobertura Zoom · ${instancia.solicitud.titulo}`,
    description: `Abrir la cobertura en Sala Virtual FLACSO: ${href}`,
    start: { dateTime: inicio.toISOString() },
    end: { dateTime: fin.toISOString() },
    transparency: "opaque"
  };
  return {
    id,
    ...contenido,
    extendedProperties: {
      private: {
        flacsoCoberturaZoom: "1",
        flacsoClave: id,
        flacsoHuella: sha256(JSON.stringify(contenido))
      }
    }
  };
}
