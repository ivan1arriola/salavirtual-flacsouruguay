import { describe, expect, it } from "vitest";
import {
  filtrarEncuentrosConArchivos,
  resolverEstadoVisualGrabacion,
  type GrupoEncuentroConArchivos
} from "../src/modules/meet/grabaciones-filtro.domain";

describe("grabaciones-filtro.domain", () => {
  it("determina el estado DISPONIBLE si existe archivo de video", () => {
    const estado = resolverEstadoVisualGrabacion({
      tieneArchivoGrabacion: true,
      archivosSincronizadosAt: new Date(),
      finProgramadoAt: new Date(Date.now() - 3600000),
      requiereGrabacion: true,
      ahora: new Date()
    });
    expect(estado).toBe("DISPONIBLE");
  });

  it("determina el estado PROCESANDO si no sincronizo y termino hace menos de 4 horas", () => {
    const estado = resolverEstadoVisualGrabacion({
      tieneArchivoGrabacion: false,
      archivosSincronizadosAt: null,
      finProgramadoAt: new Date(Date.now() - 1800000), // terminó hace 30 min
      requiereGrabacion: true,
      ahora: new Date()
    });
    expect(estado).toBe("PROCESANDO");
  });

  it("determina el estado NO_REGISTRADA si ya cerro el ciclo y requeria grabacion", () => {
    const estado = resolverEstadoVisualGrabacion({
      tieneArchivoGrabacion: false,
      archivosSincronizadosAt: new Date(),
      finProgramadoAt: new Date(Date.now() - 86400000),
      requiereGrabacion: true,
      ahora: new Date()
    });
    expect(estado).toBe("NO_REGISTRADA");
  });

  it("filtra encuentros por texto de busqueda en titulo, programa o docente", () => {
    const grupos: GrupoEncuentroConArchivos[] = [
      {
        instanciaId: "1",
        titulo: "Seminario de Políticas Públicas",
        programa: "Maestría en Políticas",
        docente: "María García",
        fechaInicio: new Date(),
        archivos: [{ tipo: "GRABACION", id: "a1" }]
      },
      {
        instanciaId: "2",
        titulo: "Taller de Metodología",
        programa: "Doctorado en Ciencias Sociales",
        docente: "Juan Pérez",
        fechaInicio: new Date(),
        archivos: [{ tipo: "LISTA_ASISTENCIA", id: "a2" }]
      }
    ];

    expect(filtrarEncuentrosConArchivos(grupos, "TODOS", "políticas")).toHaveLength(1);
    expect(filtrarEncuentrosConArchivos(grupos, "TODOS", "Juan")).toHaveLength(1);
    expect(filtrarEncuentrosConArchivos(grupos, "GRABACIONES", "")).toHaveLength(1);
    expect(filtrarEncuentrosConArchivos(grupos, "ASISTENCIAS", "")).toHaveLength(1);
  });
});

