import { describe, expect, it } from "vitest";
import {
  normalizarCuentasRecordadas,
  olvidarCuenta,
  recordarCuenta,
  type CuentaRecordada
} from "../src/modules/usuarios/cuentas-recordadas.domain";

const ana: CuentaRecordada = { id: "ana", nombre: "Ana", identificador: "ana@flacso.edu.uy" };
const leo: CuentaRecordada = { id: "leo", nombre: "Leo", identificador: "leo@flacso.edu.uy" };

describe("cuentas recordadas en el navegador", () => {
  it("coloca la cuenta reciente primero sin duplicar ni mutar", () => {
    const original = Object.freeze([ana, leo]);
    expect(recordarCuenta(original, leo)).toEqual([leo, ana]);
    expect(original).toEqual([ana, leo]);
  });

  it("limita, valida y permite olvidar cuentas", () => {
    const many = Array.from({ length: 7 }, (_, index) => ({
      id: `u${index}`,
      nombre: `Usuario ${index}`,
      identificador: `u${index}@flacso.edu.uy`
    }));
    expect(normalizarCuentasRecordadas([...many, null])).toHaveLength(5);
    expect(olvidarCuenta([ana, leo], "ana")).toEqual([leo]);
  });
});
