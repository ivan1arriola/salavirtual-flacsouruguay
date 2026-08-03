import { describe, expect, it } from "vitest";
import {
  crearReunionesSchema,
  diasDeReunion,
  puedeAbrirCreacionReuniones,
  puedeCrearReuniones,
  puedeVerAgendaCompleta,
  resolverAsignacionInicial
} from "../src/modules/reuniones/reuniones.domain";

describe("dias derivados de reuniones", () => {
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
