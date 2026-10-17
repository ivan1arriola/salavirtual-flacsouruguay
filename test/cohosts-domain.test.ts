import { describe, expect, it } from "vitest";
import {
  cohostAccountGuidance,
  extraerCohostEmailsDeInstancia,
  extraerCohostsUnificadosDeInstancia,
  normalizeCohostEmails,
} from "@/src/modules/conferencias/api";

describe("normalizeCohostEmails", () => {
  it("no agrega un cohost predeterminado", () => {
    expect(normalizeCohostEmails([])).toEqual([]);
  });

  it("normaliza y elimina correos repetidos", () => {
    expect(normalizeCohostEmails([
      "DOCENTE@FLACSO.EDU.UY",
      "docente@flacso.edu.uy",
      "apoyo@flacso.edu.uy"
    ])).toEqual(["docente@flacso.edu.uy", "apoyo@flacso.edu.uy"]);
  });
});

describe("cohostAccountGuidance", () => {
  it("devuelve cadena vacía si no hay cohosts", () => {
    expect(cohostAccountGuidance([])).toBe("");
  });

  it("devuelve 'ingresar con cuenta FLACSO' si todos los correos son institucionales", () => {
    expect(cohostAccountGuidance([
      "docente@flacso.edu.uy",
      "asistente@flacso.edu.uy"
    ])).toBe("ingresar con cuenta FLACSO");
  });

  it("devuelve 'ingresar con cuenta Google' si al menos un cohost es Gmail o externo", () => {
    expect(cohostAccountGuidance([
      "docente@flacso.edu.uy",
      "avrilarias160504@gmail.com"
    ])).toBe("ingresar con cuenta Google");
  });

  it("devuelve 'ingresar con cuenta Google' si todos los cohosts son externos", () => {
    expect(cohostAccountGuidance([
      "profesor@gmail.com"
    ])).toBe("ingresar con cuenta Google");
  });
});

describe("extraerCohostsUnificadosDeInstancia y extraerCohostEmailsDeInstancia", () => {
  it("devuelve arrays vacíos si el argumento es nulo o indefinido", () => {
    expect(extraerCohostsUnificadosDeInstancia(null)).toEqual([]);
    expect(extraerCohostsUnificadosDeInstancia(undefined)).toEqual([]);
    expect(extraerCohostEmailsDeInstancia(null)).toEqual([]);
    expect(extraerCohostEmailsDeInstancia(undefined)).toEqual([]);
  });

  it("unifica cohosts de ambas tablas y deduplica por correo", () => {
    const meeting = {
      cohosts: [
        {
          cuentaGoogleId: "cg-1",
          cuentaGoogle: {
            id: "cg-1",
            email: "DOCENTE@FLACSO.EDU.UY",
            user: { nombres: "Juan", apellidos: "Pérez" }
          }
        }
      ],
      cohostEmails: [
        { email: "docente@flacso.edu.uy" },
        { email: "externo@gmail.com" }
      ]
    };

    const unificados = extraerCohostsUnificadosDeInstancia(meeting);
    expect(unificados).toEqual([
      {
        email: "docente@flacso.edu.uy",
        name: "Juan Pérez",
        cuentaGoogleId: "cg-1"
      },
      {
        email: "externo@gmail.com",
        name: undefined,
        cuentaGoogleId: null
      }
    ]);

    const emails = extraerCohostEmailsDeInstancia(meeting);
    expect(emails).toEqual(["docente@flacso.edu.uy", "externo@gmail.com"]);
  });

  it("ignora entradas vacías o nulas de forma robusta", () => {
    const meeting = {
      cohosts: [
        { cuentaGoogle: null },
        { cuentaGoogle: { email: "   " } },
        { cuentaGoogle: { email: "valido@flacso.edu.uy" } }
      ],
      cohostEmails: [
        { email: "" },
        { email: "  " },
        { email: "valido2@flacso.edu.uy" }
      ]
    };

    expect(extraerCohostEmailsDeInstancia(meeting)).toEqual([
      "valido@flacso.edu.uy",
      "valido2@flacso.edu.uy"
    ]);
  });
});
