import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  planificarCorreccionSerie,
  type EncuentroSerieParaCorregir
} from "../src/modules/reuniones/corregir-serie-enlaces.domain";

const ahora = new Date("2026-11-03T12:00:00Z");
const hora = (n: number) => new Date(ahora.getTime() + n * 3_600_000);
const dia = (n: number) => hora(n * 24);
const hosts = [
  { id: "c1", prioridad: 1, limiteConcurrente: 1 },
  { id: "c2", prioridad: 2, limiteConcurrente: 1 }
];
const enc = (n: number, extra: Partial<EncuentroSerieParaCorregir> = {}): EncuentroSerieParaCorregir => ({
  instanciaId: `i${n}`,
  inicio: dia(n),
  fin: new Date(dia(n).getTime() + 3_600_000),
  joinUrl: `https://zoom.us/j/${n}`,
  externalEventId: `${n}`,
  cuentaProveedorId: "c1",
  calendarId: "cal@x",
  calendarEventId: `ev${n}`,
  ...extra
});
const plan = (
  encuentros: EncuentroSerieParaCorregir[],
  reservasZoom: Parameters<typeof planificarCorreccionSerie>[0]["reservasZoom"] = []
) => planificarCorreccionSerie({ ahora, margenSeguridadHoras: 24, encuentros, hosts, reservasZoom });

describe("planificarCorreccionSerie", () => {
  it("(a) elige la cuenta más usada de la serie y lista las reuniones a retirar", () => {
    const resultado = plan([
      enc(2, { cuentaProveedorId: "c2" }),
      enc(3, { cuentaProveedorId: "c2" }),
      enc(4)
    ]);
    expect(resultado).toMatchObject({
      estado: "CORREGIBLE",
      hostId: "c2",
      reunionesARetirar: ["2", "3", "4"]
    });
    expect(resultado.encuentroIds).toEqual(["i2", "i3", "i4"]);
  });

  it("(b) si la cuenta preferida está ocupada en algún horario usa otra libre, o SIN_SALA si no hay", () => {
    const ocupaC1 = {
      cuentaProveedorId: "c1",
      inicio: dia(3),
      fin: new Date(dia(3).getTime() + 3_600_000),
      instanciaId: "ajena"
    };
    expect(plan([enc(2), enc(3), enc(4)], [ocupaC1])).toMatchObject({ estado: "CORREGIBLE", hostId: "c2" });
    const ocupaC2 = { ...ocupaC1, cuentaProveedorId: "c2" };
    expect(plan([enc(2), enc(3), enc(4)], [ocupaC1, ocupaC2])).toMatchObject({
      estado: "SIN_SALA",
      hostId: null
    });
  });

  it("(c) un encuentro dentro del margen de seguridad deja toda la serie en CERCANO", () => {
    expect(plan([enc(3), { ...enc(1), inicio: hora(5), fin: hora(6) }])).toMatchObject({
      estado: "CERCANO",
      hostId: null
    });
  });

  it("(c2) un encuentro ya en curso también deja la serie en CERCANO", () => {
    expect(plan([enc(3), { ...enc(1), inicio: hora(-1), fin: hora(1) }]).estado).toBe("CERCANO");
  });

  it("(d) un encuentro sin cita no bloquea y se informa aparte", () => {
    const resultado = plan([enc(2), enc(3, { calendarId: null, calendarEventId: null })]);
    expect(resultado).toMatchObject({ estado: "CORREGIBLE", encuentrosSinCalendar: ["i3"] });
  });

  it("(e) las reservas de la propia serie no bloquean", () => {
    const propia = {
      cuentaProveedorId: "c1",
      inicio: dia(2),
      fin: new Date(dia(2).getTime() + 3_600_000),
      instanciaId: "i2"
    };
    expect(plan([enc(2), enc(3)], [propia])).toMatchObject({ estado: "CORREGIBLE", hostId: "c1" });
  });

  it("sin encuentros vigentes queda en REVISAR y no repite reuniones a retirar", () => {
    expect(plan([]).estado).toBe("REVISAR");
    expect(
      plan([
        enc(2, { externalEventId: "9" }),
        enc(3, { externalEventId: "9" }),
        enc(4, { externalEventId: null })
      ]).reunionesARetirar
    ).toEqual(["9"]);
  });

  it("(f) es una función pura: sin let ni mutación", () => {
    const fuente = readFileSync(
      new URL("../src/modules/reuniones/corregir-serie-enlaces.domain.ts", import.meta.url),
      "utf8"
    );
    expect(fuente).not.toMatch(/\blet\b|\bvar\b|\.push\(|\.sort\(|\.set\(|\.add\(|\bclass\b/);
  });
});
