import { describe, expect, it } from "vitest";
import {
  crearReunionesSchema,
  diasDeReunion,
  puedeAbrirCreacionReuniones,
  puedeCrearReuniones,
  puedeVerAgendaCompleta,
  resolverAsignacionInicial
} from "../src/modules/reuniones/reuniones.domain";
import { detectarPosiblesReunionesDuplicadas } from "../src/modules/reuniones/duplicados.domain";

describe("dias derivados de reuniones", () => {
  it("detecta coincidencias exactas y horarios superpuestos del mismo docente", () => {
    const base = {
      solicitudId: "request-1",
      titulo: "Clase de Género",
      programaId: "program-1",
      programaNombre: "Diploma",
      docenteId: "teacher-1",
      docenteNombre: "Ana Pérez",
      inicio: new Date("2026-08-03T13:00:00Z"),
      fin: new Date("2026-08-03T14:00:00Z")
    };
    const risks = detectarPosiblesReunionesDuplicadas([
      { ...base, id: "meeting-1" },
      { ...base, id: "meeting-2", solicitudId: "request-2", titulo: "Clase de Genero" },
      { ...base, id: "meeting-3", solicitudId: "request-3", titulo: "Tutoría", inicio: new Date("2026-08-03T13:30:00Z"), fin: new Date("2026-08-03T14:30:00Z") }
    ]);

    expect(risks.map(({ motivo }) => motivo)).toEqual([
      "COINCIDENCIA_EXACTA",
      "HORARIO_SUPERPUESTO",
      "HORARIO_SUPERPUESTO"
    ]);
  });

  it("no marca docentes distintos ni reuniones consecutivas", () => {
    const shared = {
      solicitudId: "request",
      titulo: "Clase",
      programaId: "program",
      programaNombre: "Diploma",
      docenteNombre: "Docente",
      inicio: new Date("2026-08-03T13:00:00Z"),
      fin: new Date("2026-08-03T14:00:00Z")
    };
    expect(detectarPosiblesReunionesDuplicadas([
      { ...shared, id: "one", docenteId: "teacher-1" },
      { ...shared, id: "two", docenteId: "teacher-2" },
      { ...shared, id: "three", docenteId: "teacher-1", inicio: new Date("2026-08-03T14:00:00Z"), fin: new Date("2026-08-03T15:00:00Z") }
    ])).toEqual([]);
  });

  it("calcula dias unicos respetando la zona horaria", () => {
    expect(
      diasDeReunion(
        [
          { inicioProgramadoAt: new Date("2026-08-03T13:00:00Z") },
          { inicioProgramadoAt: new Date("2026-08-05T13:00:00Z") },
          { inicioProgramadoAt: new Date("2026-08-10T13:00:00Z") }
        ],
        "America/Montevideo"
      )
    ).toEqual(["lunes", "miercoles"]);
  });

  it("permite crear una reunion abierta sin asignacion inicial", () => {
    expect(
      crearReunionesSchema.parse({
        titulo: "Clase",
        docenteProgramaId: "dp",
        requiereAsistencia: true,
        modalidad: "VIRTUAL",
        timezone: "America/Montevideo",
        instancias: [
          {
            inicio: "2026-08-03T13:00:00Z",
            fin: "2026-08-03T14:00:00Z"
          }
        ]
      }).asistenteId
    ).toBeUndefined();
  });

  it("rechaza encuentros que terminan otro dia en Montevideo", () => {
    const result = crearReunionesSchema.safeParse({
      titulo: "Clase",
      docenteProgramaId: "dp",
      modalidad: "VIRTUAL",
      timezone: "America/Montevideo",
      instancias: [{ inicio: "2026-08-03T23:00:00-03:00", fin: "2026-08-04T00:30:00-03:00" }]
    });
    expect(result.success).toBe(false);
  });

  it("rechaza encuentros superpuestos dentro de una serie con Meet compartido", () => {
    const result = crearReunionesSchema.safeParse({
      titulo: "Clase",
      docenteProgramaId: "dp",
      modalidad: "VIRTUAL",
      timezone: "America/Montevideo",
      instancias: [
        { inicio: "2026-08-03T13:00:00Z", fin: "2026-08-03T15:00:00Z" },
        { inicio: "2026-08-03T14:00:00Z", fin: "2026-08-03T16:00:00Z" }
      ]
    });
    expect(result.success).toBe(false);
  });

  it("normaliza cohosts manuales sin exigir sala elegida a mano", () => {
    const result = crearReunionesSchema.parse({
      titulo: "Clase",
      docenteProgramaId: "dp",
      modalidad: "VIRTUAL",
      timezone: "America/Montevideo",
      cohostEmailsManual: "DOCENTE@FLACSO.EDU.UY, apoyo@flacso.edu.uy",
      instancias: [
        {
          inicio: "2026-08-03T13:00:00Z",
          fin: "2026-08-03T14:00:00Z"
        }
      ]
    });

    expect(result.cohostEmailsManual).toEqual([
      "docente@flacso.edu.uy",
      "apoyo@flacso.edu.uy"
    ]);
  });

  it("reserva la asignacion inicial a Administracion", () => {
    expect(resolverAsignacionInicial("ADMINISTRACION", true, "assistant")).toBe("assistant");
    expect(resolverAsignacionInicial("ADMINISTRACION", true)).toBeNull();
    expect(resolverAsignacionInicial("DOCENTE", true)).toBeNull();
    expect(() => resolverAsignacionInicial("DOCENTE", true, "assistant")).toThrow(
      "Solo Administración"
    );
    expect(() => resolverAsignacionInicial("ADMINISTRACION", false, "assistant")).toThrow(
      "no requiere asistencia"
    );
  });

  it("permite a Administracion o al docente asociado crear reuniones", () => {
    expect(puedeCrearReuniones("ADMINISTRACION", "admin", "docente")).toBe(true);
    expect(puedeCrearReuniones("DOCENTE", "docente", "docente")).toBe(true);
    expect(puedeCrearReuniones("DOCENTE", "otro", "docente")).toBe(false);
  });

  it("reserva el formulario de creacion a Administracion y Docente", () => {
    expect(puedeAbrirCreacionReuniones("ADMINISTRACION")).toBe(true);
    expect(puedeAbrirCreacionReuniones("DOCENTE")).toBe(true);
    expect(puedeAbrirCreacionReuniones("ASISTENTE")).toBe(false);
  });

  it("impide que Asistente vea la agenda completa", () => {
    expect(puedeVerAgendaCompleta("ADMINISTRACION")).toBe(true);
    expect(puedeVerAgendaCompleta("DOCENTE")).toBe(true);
    expect(puedeVerAgendaCompleta("ASISTENTE")).toBe(false);
  });
});
