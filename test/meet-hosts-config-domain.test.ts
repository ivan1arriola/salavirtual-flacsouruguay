import { describe, expect, it } from "vitest";
import {
  avisoFueraDelGrupo,
  filterMeetHosts,
  formatoLimiteConcurrente
} from "../src/components/meet-hosts-config.domain";
import { esCuentaAsignable } from "../src/modules/reuniones/cuenta-asignable.domain";

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

describe("aviso de cuenta fuera del grupo de Zoom", () => {
  const FUERA = "2026-11-01T12:00:00.000Z";

  it("no muestra aviso para una cuenta del grupo o de Meet", () => {
    expect(avisoFueraDelGrupo({ fueraDelGrupoAt: null, reunionesFuturas: 4 })).toBeNull();
    expect(avisoFueraDelGrupo({})).toBeNull();
  });

  it("usa plural para varias reuniones futuras y singular para una", () => {
    expect(avisoFueraDelGrupo({ fueraDelGrupoAt: FUERA, reunionesFuturas: 3 })).toBe(
      "Fuera del grupo (3 reuniones futuras)"
    );
    expect(avisoFueraDelGrupo({ fueraDelGrupoAt: FUERA, reunionesFuturas: 1 })).toBe(
      "Fuera del grupo (1 reunión futura)"
    );
  });

  it("sin reuniones futuras solo indica que está fuera del grupo", () => {
    expect(avisoFueraDelGrupo({ fueraDelGrupoAt: FUERA, reunionesFuturas: 0 })).toBe("Fuera del grupo");
    expect(avisoFueraDelGrupo({ fueraDelGrupoAt: FUERA })).toBe("Fuera del grupo");
  });
});

describe("salas disponibles", () => {
  const base = { activa: true, tieneLicencia: true, fueraDelGrupoAt: null };

  it("cuenta solo las cuentas activas, con licencia y dentro del grupo", () => {
    const cuentas = [
      base,
      { ...base, fueraDelGrupoAt: new Date("2026-11-01T12:00:00.000Z") },
      { ...base, activa: false },
      { ...base, tieneLicencia: false },
      { activa: true, tieneLicencia: true }
    ];
    expect(cuentas.filter(esCuentaAsignable)).toHaveLength(2);
  });

  it("una cuenta fuera del grupo no está disponible aunque siga activa", () => {
    expect(esCuentaAsignable({ ...base, fueraDelGrupoAt: "2026-11-01T12:00:00.000Z" })).toBe(false);
    expect(esCuentaAsignable(base)).toBe(true);
  });
});
