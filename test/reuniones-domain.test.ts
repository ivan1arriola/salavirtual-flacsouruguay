import { describe, expect, it } from "vitest";
import {
  crearReunionesSchema,
  diasDeReunion,
  puedeCrearReuniones
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

  it("exige asistente cuando la reunion requiere asistencia", () => {
    expect(() =>
      crearReunionesSchema.parse({
        titulo: "Clase",
        docenteProgramaId: "dp",
        cuentaHostId: "host",
        requiereAsistencia: true,
        modalidad: "VIRTUAL",
        timezone: "America/Montevideo",
        instancias: [
          {
            inicio: "2026-08-03T13:00:00Z",
            fin: "2026-08-03T14:00:00Z"
          }
        ]
      })
    ).toThrow();
  });

  it("permite a Administracion o al docente asociado crear reuniones", () => {
    expect(puedeCrearReuniones("ADMINISTRACION", "admin", "docente")).toBe(true);
    expect(puedeCrearReuniones("DOCENTE", "docente", "docente")).toBe(true);
    expect(puedeCrearReuniones("DOCENTE", "otro", "docente")).toBe(false);
  });
});
