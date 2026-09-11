import { describe, expect, it } from "vitest";
import { cohostAccountGuidance, normalizeCohostEmails } from "../src/modules/meet/cohosts.domain";

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
