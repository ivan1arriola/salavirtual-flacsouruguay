import { describe, expect, it } from "vitest";
import {
  claveSesionZoom,
  consolidarAsistenciaOcurrenciasZoom,
  consolidarAsistenciaZoom,
  resumirAsistenciaZoom,
  type SesionObservadaZoom
} from "../src/modules/archivos/domain/asistencia-zoom.domain";

const t = (hhmm: string) => new Date(`2026-11-09T${hhmm}:00Z`);
const VENTANA = { inicioAt: t("10:00"), finAt: t("11:00") };
const hash = (x: string) => `h:${x}`;

function ses(extra: Partial<SesionObservadaZoom> & { entra: string; sale: string }): SesionObservadaZoom {
  const { entra, sale, ...resto } = extra;
  return {
    claveSesion: `s-${entra}-${sale}-${resto.participanteId ?? resto.nombre ?? "x"}`,
    participanteId: "p1",
    userId: "u-cambiante",
    nombre: "Ana",
    email: null,
    entradaAt: t(entra),
    salidaAt: t(sale),
    status: "in_meeting",
    rol: null,
    ...resto
  };
}

describe("consolidarAsistenciaZoom: unión de intervalos", () => {
  it("[10:00–10:40] y [10:20–11:00] suman 60 minutos, no 80", () => {
    const [r] = consolidarAsistenciaZoom(
      [ses({ entra: "10:00", sale: "10:40" }), ses({ entra: "10:20", sale: "11:00" })],
      VENTANA
    );
    expect(r!.minutos).toBe(60);
    expect(r!.porcentaje).toBe(100);
  });

  it("reconexiones separadas se suman sin solapamiento y cuentan las sesiones", () => {
    const [r] = consolidarAsistenciaZoom(
      [ses({ entra: "10:00", sale: "10:10" }), ses({ entra: "10:30", sale: "10:45" })],
      VENTANA
    );
    expect(r!.minutos).toBe(25);
    expect(r!.sesiones).toBe(2);
    expect(r!.primeraEntradaAt).toEqual(t("10:00"));
    expect(r!.ultimaSalidaAt).toEqual(t("10:45"));
  });

  it("recorta al horario: antes del inicio y después del fin no cuenta", () => {
    const [r] = consolidarAsistenciaZoom(
      [ses({ entra: "09:30", sale: "10:15" }), ses({ entra: "10:50", sale: "11:30" })],
      VENTANA
    );
    expect(r!.minutos).toBe(25);
    expect(r!.porcentaje).toBeCloseTo(41.67, 2);
  });

  it("precisión decimal con segundos y porcentaje nunca mayor a 100", () => {
    const [r] = consolidarAsistenciaZoom(
      [{ ...ses({ entra: "10:00", sale: "10:01" }), salidaAt: new Date("2026-11-09T10:01:20Z") }],
      VENTANA
    );
    expect(r!.minutos).toBe(1.33);
    expect(r!.porcentaje).toBe(2.22);
    const [lleno] = consolidarAsistenciaZoom([ses({ entra: "09:00", sale: "12:00" })], VENTANA);
    expect(lleno!.porcentaje).toBe(100);
  });

  it("fechas inválidas o salida anterior a la entrada no producen NaN: se ignoran", () => {
    const rs = consolidarAsistenciaZoom(
      [
        { ...ses({ entra: "10:00", sale: "10:30" }), entradaAt: new Date("no-fecha") },
        ses({ entra: "10:40", sale: "10:30" }),
        ses({ entra: "10:00", sale: "10:10" })
      ],
      VENTANA
    );
    expect(rs).toHaveLength(1);
    expect(rs[0]!.minutos).toBe(10);
    expect(Number.isNaN(rs[0]!.porcentaje)).toBe(false);
  });

  it("una ventana inválida es un error de programación, no un NaN silencioso", () => {
    expect(() => consolidarAsistenciaZoom([], { inicioAt: t("11:00"), finAt: t("10:00") })).toThrow(
      RangeError
    );
    expect(() => consolidarAsistenciaZoom([], { inicioAt: new Date("x"), finAt: t("10:00") })).toThrow(
      RangeError
    );
  });
});

describe("consolidarAsistenciaZoom: identidad", () => {
  it("dos nombres iguales con IDs distintos permanecen separados", () => {
    const rs = consolidarAsistenciaZoom(
      [
        ses({ entra: "10:00", sale: "10:30", participanteId: "a", nombre: "Juan Pérez" }),
        ses({ entra: "10:00", sale: "10:30", participanteId: "b", nombre: "Juan Pérez" })
      ],
      VENTANA
    );
    expect(rs).toHaveLength(2);
  });

  it("user_id nunca identifica a una persona (cambia con cada reconexión): mismo participantId con distintos userId se une", () => {
    const rs = consolidarAsistenciaZoom(
      [
        ses({ entra: "10:00", sale: "10:10", userId: "u1" }),
        ses({ entra: "10:20", sale: "10:30", userId: "u2" })
      ],
      VENTANA
    );
    expect(rs).toHaveLength(1);
    expect(rs[0]!.minutos).toBe(20);
  });

  it("sin identificador fiable cada sesión queda diferenciada y sin conciliación automática aunque coincida el nombre", () => {
    const rs = consolidarAsistenciaZoom(
      [
        ses({ entra: "10:00", sale: "10:10", participanteId: null, nombre: "Invitado" }),
        ses({ entra: "10:20", sale: "10:30", participanteId: null, nombre: "Invitado" })
      ],
      VENTANA
    );
    expect(rs).toHaveLength(2);
    expect(rs.every((r) => r.estadoConciliacion === "SIN_CONCILIAR")).toBe(true);
    expect(new Set(rs.map((r) => r.claveParticipante)).size).toBe(2);
  });

  it("el correo informado por Zoom es observado, nunca identidad institucional confirmada", () => {
    const [r] = consolidarAsistenciaZoom(
      [ses({ entra: "10:00", sale: "10:30", email: "ana@gmail.com" })],
      VENTANA
    );
    expect(r!.emailObservado).toBe("ana@gmail.com");
    expect(r!.estadoConciliacion).toBe("SIN_CONCILIAR");
    expect(r).not.toHaveProperty("invitadoReunionId");
  });
});

describe("consolidarAsistenciaZoom: sala de espera", () => {
  it("espera sin admisión suma 0 minutos pero se conserva como traza", () => {
    const [r] = consolidarAsistenciaZoom(
      [ses({ entra: "10:00", sale: "10:30", status: "in_waiting_room" })],
      VENTANA
    );
    expect(r!.minutos).toBe(0);
    expect(r!.porcentaje).toBe(0);
    expect(r!.sesiones).toBe(1);
    expect(r!.primeraEntradaAt).toBeNull();
  });

  it("espera seguida de entrada: solo cuenta el tiempo dentro de la reunión", () => {
    const [r] = consolidarAsistenciaZoom(
      [
        ses({ entra: "10:00", sale: "10:10", status: "in_waiting_room" }),
        ses({ entra: "10:10", sale: "10:40", status: "in_meeting" })
      ],
      VENTANA
    );
    expect(r!.minutos).toBe(30);
    expect(r!.primeraEntradaAt).toEqual(t("10:10"));
  });

  it("estado desconocido (reportes antiguos) se trata como dentro de la reunión", () => {
    const [r] = consolidarAsistenciaZoom([ses({ entra: "10:00", sale: "10:30", status: null })], VENTANA);
    expect(r!.minutos).toBe(30);
  });
});

describe("resumen sin veredicto", () => {
  it("expone solo minutos y porcentaje sobre la ventana: no hay umbral ni cumple/no cumple", () => {
    const [r] = consolidarAsistenciaZoom([ses({ entra: "10:00", sale: "10:30" })], VENTANA);
    expect(Object.keys(r!).some((k) => /cumple|normativa|umbral|aprob/i.test(k))).toBe(false);
  });

  it("hosts y cohosts con rol comprobado se excluyen del conteo de estudiantes", () => {
    const rs = consolidarAsistenciaZoom(
      [
        ses({ entra: "10:00", sale: "11:00", participanteId: "d", nombre: "Docente", rol: "HOST" }),
        ses({ entra: "10:00", sale: "11:00", participanteId: "c", nombre: "Asistente", rol: "COHOST" }),
        ses({ entra: "10:00", sale: "10:50", participanteId: "e1", nombre: "Est 1" }),
        ses({ entra: "10:10", sale: "10:50", participanteId: "e2", nombre: "Est 2" })
      ],
      VENTANA
    );
    expect(resumirAsistenciaZoom(rs)).toEqual({ participantes: 4, estudiantes: 2, anfitriones: 2 });
  });

  it("un rol sugerido (no comprobado) no excluye a nadie", () => {
    const rs = consolidarAsistenciaZoom(
      [ses({ entra: "10:00", sale: "10:50", rol: null, nombre: "Docente" })],
      VENTANA
    );
    expect(resumirAsistenciaZoom(rs).estudiantes).toBe(1);
  });
});

describe("varias ocurrencias de un mismo encuentro", () => {
  it("une los intervalos de cada ocurrencia recortados a su propio horario y calcula sobre la suma de ventanas", () => {
    const rs = consolidarAsistenciaOcurrenciasZoom([
      {
        sesiones: [ses({ entra: "10:00", sale: "10:30" })],
        ventana: { inicioAt: t("10:00"), finAt: t("10:40") }
      },
      {
        sesiones: [ses({ entra: "10:30", sale: "11:30", participanteId: "p1" })],
        ventana: { inicioAt: t("11:00"), finAt: t("11:20") }
      }
    ]);
    expect(rs).toHaveLength(1);
    // 30 min en la primera + 20 recortados en la segunda (11:00–11:20) = 50 de 60.
    expect(rs[0]!.minutos).toBe(50);
    expect(rs[0]!.porcentaje).toBe(83.33);
    expect(rs[0]!.sesiones).toBe(2);
  });
});

describe("claveSesionZoom", () => {
  const base = {
    participanteId: "p",
    userId: "u",
    nombre: "Ana",
    entradaAt: t("10:00"),
    salidaAt: t("10:10")
  };
  it("es estable ante reintentos y distinta entre ocurrencias, entradas o salidas", () => {
    expect(claveSesionZoom(hash, "uuid-1", base)).toBe(claveSesionZoom(hash, "uuid-1", { ...base }));
    expect(claveSesionZoom(hash, "uuid-1", base)).not.toBe(claveSesionZoom(hash, "uuid-2", base));
    expect(claveSesionZoom(hash, "uuid-1", base)).not.toBe(
      claveSesionZoom(hash, "uuid-1", { ...base, salidaAt: t("10:11") })
    );
  });
});
