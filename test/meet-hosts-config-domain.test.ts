import { describe, expect, it } from "vitest";
import { filterMeetHosts, formatoLimiteConcurrente } from "../src/components/meet-hosts-config.domain";

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

describe("formato de límite concurrente", () => {
  it("muestra la cantidad máxima cuando es mayor a 1", () => {
    expect(formatoLimiteConcurrente(2)).toBe("Hasta 2 simultáneas");
    expect(formatoLimiteConcurrente(5)).toBe("Hasta 5 simultáneas");
  });

  it("indica 1 reunión simultánea por defecto cuando es 1 o nulo", () => {
    expect(formatoLimiteConcurrente(1)).toBe("1 reunión simultánea (predeterminado)");
    expect(formatoLimiteConcurrente(null)).toBe("1 reunión simultánea (predeterminado)");
    expect(formatoLimiteConcurrente(undefined)).toBe("1 reunión simultánea (predeterminado)");
  });
});
