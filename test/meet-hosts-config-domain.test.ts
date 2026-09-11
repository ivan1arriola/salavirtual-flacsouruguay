import { describe, expect, it } from "vitest";
import { filterMeetHosts } from "../src/components/meet-hosts-config.domain";

const hosts = [
  { id: "1", nombre: "Sala Principal", emailOrganizador: "sala01@flacso.edu.uy" },
  { id: "2", nombre: "Aula Posgrados", emailOrganizador: "aula@flacso.edu.uy" },
  { id: "3", nombre: "Sin correo", emailOrganizador: null }
];

describe("filtro de salas", () => {
  it("encuentra una sala por nombre sin distinguir mayúsculas", () => {
    expect(filterMeetHosts(hosts, " principal ").map(({ id }) => id)).toEqual(["1"]);
  });

  it("encuentra una sala por correo y conserva todas ante una búsqueda vacía", () => {
    expect(filterMeetHosts(hosts, "AULA@").map(({ id }) => id)).toEqual(["2"]);
    expect(filterMeetHosts(hosts, "")).toHaveLength(3);
  });
});
