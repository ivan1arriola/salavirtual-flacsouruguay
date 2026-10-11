import { describe, expect, it } from "vitest";
import { evaluarSaludOperativa } from "../src/modules/operaciones/salud.domain";

describe("alertas operativas", () => {
  const base = { pendingGoogle: 0, googleErrors: 0, staleClaims: 0, oldestPendingMinutes: null };

  it("considera sano un evento recientemente encolado", () => {
    expect(evaluarSaludOperativa({ ...base, pendingGoogle: 2, oldestPendingMinutes: 12 }).status).toBe("ok");
  });

  it("marca retrasos y fallos de Google como degradación", () => {
    expect(evaluarSaludOperativa({ ...base, googleErrors: 1 }).status).toBe("degradado");
    expect(evaluarSaludOperativa({ ...base, pendingGoogle: 1, oldestPendingMinutes: 31 }).status).toBe("degradado");
  });

  it("alerta ante claims huérfanos o más de dos horas de retraso", () => {
    expect(evaluarSaludOperativa({ ...base, staleClaims: 1 }).status).toBe("critico");
    expect(evaluarSaludOperativa({ ...base, pendingGoogle: 1, oldestPendingMinutes: 121 }).status).toBe("critico");
  });
});
