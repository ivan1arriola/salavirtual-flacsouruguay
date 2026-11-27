import { describe, expect, it } from "vitest";
import { cohostMemberNamesToRemove } from "../src/modules/conferencias/domain/cohost-reconciliation.domain";

describe("reconciliación de cohosts administrados por Sala Virtual", () => {
  it("retira cohosts anteriores que se quitaron y conserva miembros agregados fuera de la aplicación", () => {
    expect(
      cohostMemberNamesToRemove(
        ["anterior@flacso.edu.uy", "docente@flacso.edu.uy"],
        ["docente@flacso.edu.uy"],
        [
          { name: "members/old", email: "anterior@flacso.edu.uy", role: "COHOST" },
          { name: "members/teacher", email: "docente@flacso.edu.uy", role: "COHOST" },
          { name: "members/manual", email: "manual@flacso.edu.uy", role: "COHOST" },
        ],
      ),
    ).toEqual(["members/old"]);
  });
});
