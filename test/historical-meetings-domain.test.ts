import { describe, expect, it } from "vitest";
import { filterHistoricalMeetings } from "../src/components/historical-meetings.domain";

const meetings = [
  { id: "1", title: "Seminario de Educación", program: "Maestría", account: "zoom01@flacso.edu.uy" },
  { id: "2", title: "Defensa final", program: "Doctorado", account: "Sala histórica" }
];

describe("filtro del histórico", () => {
  it("busca por reunión, programa o cuenta", () => {
    expect(filterHistoricalMeetings(meetings, "educacion").map(({ id }) => id)).toEqual(["1"]);
    expect(filterHistoricalMeetings(meetings, "doctorado").map(({ id }) => id)).toEqual(["2"]);
    expect(filterHistoricalMeetings(meetings, "ZOOM01").map(({ id }) => id)).toEqual(["1"]);
  });
});
