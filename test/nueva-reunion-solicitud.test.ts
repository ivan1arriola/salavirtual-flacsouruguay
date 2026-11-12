import { describe, expect, it } from "vitest";
import {
  construirSolicitudReunion,
  localMontevideoToIso,
  resolverAsistenteTecnicoId,
  type EntradaSolicitud
} from "../src/modules/reuniones/presentation/components/nueva-reunion/solicitud-reunion";
import { asistenciaLocalAIso } from "../src/modules/reuniones/horarios-asistencia.adapter";
import { sugerirHorarioAsistencia } from "../src/modules/reuniones/horarios-asistencia.domain";

const fecha = {
  id: 7,
  fecha: "2026-11-10",
  horaInicio: "10:00",
  horaFin: "17:00",
  horaAsistenciaInicio: "09:30",
  horaAsistenciaFin: "17:30",
  descripcion: ""
};
const entrada: EntradaSolicitud = {
  titulo: "Seminario",
  descripcion: "Descripción general",
  docenteProgramaId: "programa",
  requiereAsistencia: false,
  requiereGrabacion: true,
  modalidad: "HIBRIDA",
  fechas: [fecha]
};

describe("construcción de la solicitud de reunión", () => {
  it("convierte el horario de Montevideo a ISO sin depender del navegador", () => {
    expect(localMontevideoToIso("2026-11-10", "09:30")).toBe("2026-11-10T12:30:00.000Z");
  });

  it("conserva la precondición original: una fecha vacía lanza error y la validación del formulario debe impedirlo", () => {
    expect(() => localMontevideoToIso("", "09:30")).toThrow(RangeError);
  });
  it("conserva los datos generales y los horarios del encuentro", () => {
    expect(construirSolicitudReunion(entrada)).toMatchObject({
      titulo: "Seminario",
      descripcion: "Descripción general",
      docenteProgramaId: "programa",
      requiereAsistenciaTecnica: false,
      requiereGrabacion: true,
      plataforma: "ZOOM",
      timezone: "America/Montevideo",
      instancias: [{ inicio: "2026-11-10T13:00:00.000Z", fin: "2026-11-10T20:00:00.000Z" }]
    });
  });
  it("sin asistencia fuerza modalidad virtual y omite la cobertura", () => {
    const solicitud = construirSolicitudReunion(entrada);
    expect(solicitud.modalidad).toBe("VIRTUAL");
    expect(solicitud.instancias[0].asistenciaInicio).toBeUndefined();
    expect(solicitud.instancias[0].asistenciaFin).toBeUndefined();
  });
  it("calcula la cobertura virtual fija aunque la fila tenga otros horarios", () => {
    const instancia = construirSolicitudReunion({
      ...entrada,
      requiereAsistencia: true,
      modalidad: "VIRTUAL"
    }).instancias[0];
    const horario = sugerirHorarioAsistencia(fecha.horaInicio, fecha.horaFin, "VIRTUAL");
    expect(instancia.asistenciaInicio).toBe(
      asistenciaLocalAIso(fecha.fecha, fecha.horaInicio, horario.llegada, "LLEGADA")
    );
    expect(instancia.asistenciaFin).toBe(
      asistenciaLocalAIso(fecha.fecha, fecha.horaFin, fecha.horaFin, "SALIDA")
    );
  });
  it("respeta los horarios editables de cobertura híbrida", () => {
    const instancia = construirSolicitudReunion({ ...entrada, requiereAsistencia: true }).instancias[0];
    expect(instancia.asistenciaInicio).toBe("2026-11-10T12:30:00.000Z");
    expect(instancia.asistenciaFin).toBe("2026-11-10T20:30:00.000Z");
  });
  it("delega el desfase de cobertura que cruza medianoche", () => {
    const instancia = construirSolicitudReunion({
      ...entrada,
      requiereAsistencia: true,
      fechas: [
        {
          ...fecha,
          horaInicio: "22:00",
          horaFin: "23:45",
          horaAsistenciaInicio: "21:30",
          horaAsistenciaFin: "00:30"
        }
      ]
    }).instancias[0];
    expect(instancia.asistenciaFin).toBe("2026-11-11T03:30:00.000Z");
  });
  it("omite el identificador y la descripción vacía de la fila", () => {
    const instancia = construirSolicitudReunion(entrada).instancias[0];
    expect(instancia).not.toHaveProperty("id");
    expect(instancia.descripcion).toBeUndefined();
    expect(JSON.parse(JSON.stringify(instancia))).not.toHaveProperty("descripcion");
    expect(
      construirSolicitudReunion({ ...entrada, fechas: [{ ...fecha, descripcion: "Notas" }] }).instancias[0]
        .descripcion
    ).toBe("Notas");
  });
  it("propaga el asistente solo cuando viene resuelto en la entrada", () => {
    expect(construirSolicitudReunion(entrada).asistenteTecnicoId).toBeUndefined();
    expect(
      construirSolicitudReunion({ ...entrada, asistenteTecnicoId: "asistente" }).asistenteTecnicoId
    ).toBe("asistente");
  });
});

describe("asignación directa de asistente", () => {
  const base = {
    puedeAsignar: true,
    requiereAsistencia: true,
    modoAsistencia: "ASSIGN",
    valorSeleccionado: "asistente-1"
  } as const;

  it("asigna solo con permiso, monitoreo solicitado y modo «Asignar ahora»", () => {
    expect(resolverAsistenteTecnicoId(base)).toBe("asistente-1");
  });

  it.each([
    ["sin permiso de Administración", { puedeAsignar: false }],
    ["sin monitoreo solicitado", { requiereAsistencia: false }],
    ["en modo abierto a postulaciones", { modoAsistencia: "OPEN" }],
    ["con selección vacía", { valorSeleccionado: "" }],
    ["sin campo en el formulario", { valorSeleccionado: null }]
  ] as const)("no asigna %s", (_nombre, cambio) => {
    expect(resolverAsistenteTecnicoId({ ...base, ...cambio })).toBeUndefined();
  });
});
