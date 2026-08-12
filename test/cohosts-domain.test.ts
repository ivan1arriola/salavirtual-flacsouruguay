import { describe, expect, it } from "vitest";
import { normalizeCohostEmails } from "../src/modules/meet/cohosts.domain";

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
