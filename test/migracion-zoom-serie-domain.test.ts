import { describe, expect, it } from "vitest";
import {
  planificarMigracionZoomPorSerie,
  type EncuentroSerieMigracionZoom,
  type SerieMigracionZoom
} from "../src/modules/reuniones/migracion-zoom-preview.domain";

const ahora = new Date("2026-11-02T12:00:00.000Z");
const dia = (n: number) => new Date(`2026-11-${String(n).padStart(2, "0")}T12:00:00.000Z`);

function encuentro(
  id: string,
  diaDelMes: number,
  extra: Partial<EncuentroSerieMigracionZoom> = {}
): EncuentroSerieMigracionZoom {
  return {
    id,
    inicio: dia(diaDelMes),
    fin: new Date(dia(diaDelMes).getTime() + 3_600_000),
    estado: "PROGRAMADA",
    proveedorActivo: "GOOGLE_MEET",
    conservarGoogleMeet: false,
    meetPreparado: true,
    meetJoinUrl: `https://meet.google.com/${id}`,
    zoomSincronizado: false,
    reunionCompartidaId: null,
    ...extra
  };
}

const serie = (
  serieClave: string,
  encuentros: EncuentroSerieMigracionZoom[],
  cuentaZoomPreferidaId: string | null = null
): SerieMigracionZoom => ({ serieClave, encuentros, cuentaZoomPreferidaId });

const planificar = (
  series: SerieMigracionZoom[],
  extra: {
    hosts?: { id: string; prioridad: number; limiteConcurrente: number | null }[];
    reservasZoom?: { cuentaProveedorId: string; inicio: Date; fin: Date; instanciaId?: string }[];
  } = {}
) =>
  planificarMigracionZoomPorSerie({
    ahora,
    margenSeguridadHoras: 24,
    series,
    hosts: extra.hosts ?? [{ id: "sala01", prioridad: 1, limiteConcurrente: 1 }],
    reservasZoom: extra.reservasZoom ?? []
  });

describe("planificación de la migración por serie", () => {
  it("una serie de tres encuentros con una sala libre en todos los horarios es migrable con esa sala", () => {
    const [fila] = planificar([serie("s1", [encuentro("a", 10), encuentro("b", 11), encuentro("c", 12)])]);
    expect(fila).toEqual({
      serieClave: "s1",
      encuentroIds: ["a", "b", "c"],
      estado: "MIGRABLE",
      hostId: "sala01"
    });
  });

  it("elige otra sala si la primera solo está libre en parte de los horarios, o queda SIN_SALA", () => {
    const ocupada = [
      { cuentaProveedorId: "sala01", inicio: dia(11), fin: new Date(dia(11).getTime() + 3_600_000) }
    ];
    const hosts = [
      { id: "sala01", prioridad: 1, limiteConcurrente: 1 },
      { id: "sala02", prioridad: 2, limiteConcurrente: 1 }
    ];
    const [conOtra] = planificar([serie("s1", [encuentro("a", 10), encuentro("b", 11)])], {
      hosts,
      reservasZoom: ocupada
    });
    expect(conOtra).toMatchObject({ estado: "MIGRABLE", hostId: "sala02" });

    const [sinSala] = planificar([serie("s1", [encuentro("a", 10), encuentro("b", 11)])], {
      reservasZoom: ocupada
    });
    expect(sinSala).toMatchObject({ estado: "SIN_SALA", hostId: null });
  });

  it("dos series simultáneas no se asignan la misma sala", () => {
    const filas = planificar([serie("s1", [encuentro("a", 10)]), serie("s2", [encuentro("b", 10)])]);
    expect(filas.map(({ serieClave, estado }) => ({ serieClave, estado }))).toEqual([
      { serieClave: "s1", estado: "MIGRABLE" },
      { serieClave: "s2", estado: "SIN_SALA" }
    ]);
  });

  it("las reservas de los propios encuentros de la serie no cuentan como colisión", () => {
    const propias = [
      {
        cuentaProveedorId: "sala01",
        inicio: dia(10),
        fin: new Date(dia(10).getTime() + 3_600_000),
        instanciaId: "a"
      }
    ];
    const [fila] = planificar([serie("s1", [encuentro("a", 10), encuentro("b", 11)])], {
      reservasZoom: propias
    });
    expect(fila.estado).toBe("MIGRABLE");
  });

  it("una serie con excepciones solo en algunos encuentros queda en REVISAR", () => {
    const [fila] = planificar([
      serie("s1", [encuentro("a", 10, { conservarGoogleMeet: true }), encuentro("b", 11)])
    ]);
    expect(fila).toMatchObject({ estado: "REVISAR", hostId: null });
  });

  it("una serie con todos sus encuentros en Meet marcados como excepción es EXCEPCION", () => {
    const [fila] = planificar([
      serie("s1", [
        encuentro("a", 10, { conservarGoogleMeet: true }),
        encuentro("b", 11, { conservarGoogleMeet: true })
      ])
    ]);
    expect(fila.estado).toBe("EXCEPCION");
  });

  it("si cualquier encuentro comienza dentro del margen de seguridad, toda la serie es CERCANO", () => {
    const cercano = encuentro("a", 2, {
      inicio: new Date("2026-11-03T08:00:00.000Z"),
      fin: new Date("2026-11-03T09:00:00.000Z")
    });
    const [fila] = planificar([serie("s1", [cercano, encuentro("b", 11)])]);
    expect(fila).toMatchObject({ estado: "CERCANO", hostId: null });
  });

  it("una serie ya en Zoom es YA_ZOOM y una sin encuentros futuros es NO_FUTURO", () => {
    const yaZoom = planificar([
      serie("s1", [encuentro("a", 10, { proveedorActivo: "ZOOM", reunionCompartidaId: "r1" })])
    ]);
    expect(yaZoom[0].estado).toBe("YA_ZOOM");
    const pasada = planificar([
      serie("s2", [
        encuentro("a", 1, {
          inicio: new Date("2026-10-01T12:00:00Z"),
          fin: new Date("2026-10-01T13:00:00Z")
        }),
        encuentro("b", 12, { estado: "CANCELADA" })
      ])
    ]);
    expect(pasada[0]).toMatchObject({ estado: "NO_FUTURO", encuentroIds: [] });
  });

  it("los encuentros pasados y cancelados no se migran ni condicionan la sala", () => {
    const [fila] = planificar([
      serie("s1", [
        encuentro("pasado", 1, {
          inicio: new Date("2026-10-01T12:00:00Z"),
          fin: new Date("2026-10-01T13:00:00Z")
        }),
        encuentro("cancelado", 9, { estado: "CANCELADA" }),
        encuentro("a", 10)
      ])
    ]);
    expect(fila).toMatchObject({ estado: "MIGRABLE", encuentroIds: ["a"] });
  });

  it("un Meet sin enlace verificable, o con Zoom ya sincronizado a medias, queda en REVISAR", () => {
    const sinEnlace = planificar([serie("s1", [encuentro("a", 10, { meetPreparado: false })])]);
    expect(sinEnlace[0].estado).toBe("REVISAR");
    const aMedias = planificar([serie("s2", [encuentro("a", 10, { zoomSincronizado: true })])]);
    expect(aMedias[0].estado).toBe("REVISAR");
  });

  it("una serie mixta cuyos encuentros en Zoom comparten la misma reunión es migrable en la misma sala", () => {
    const hosts = [
      { id: "sala01", prioridad: 1, limiteConcurrente: 1 },
      { id: "sala02", prioridad: 2, limiteConcurrente: 1 }
    ];
    const [fila] = planificar(
      [
        serie(
          "s1",
          [encuentro("z", 10, { proveedorActivo: "ZOOM", reunionCompartidaId: "r1" }), encuentro("a", 11)],
          "sala02"
        )
      ],
      { hosts }
    );
    expect(fila).toMatchObject({ estado: "MIGRABLE", hostId: "sala02", encuentroIds: ["a"] });
  });

  it("una serie mixta con encuentros en Zoom de reuniones distintas queda en REVISAR (decisión pendiente)", () => {
    const [fila] = planificar([
      serie("s1", [
        encuentro("z1", 10, { proveedorActivo: "ZOOM", reunionCompartidaId: null }),
        encuentro("a", 11)
      ])
    ]);
    expect(fila.estado).toBe("REVISAR");
  });

  it("respeta la sala preferida cuando está libre", () => {
    const hosts = [
      { id: "sala01", prioridad: 1, limiteConcurrente: 1 },
      { id: "sala02", prioridad: 2, limiteConcurrente: 1 }
    ];
    const [fila] = planificar([serie("s1", [encuentro("a", 10)], "sala02")], { hosts });
    expect(fila.hostId).toBe("sala02");
  });

  it("es determinista: el orden de entrada no cambia el resultado", () => {
    const a = serie("sa", [encuentro("a", 10)]);
    const b = serie("sb", [encuentro("b", 10)]);
    const uno = planificar([a, b]);
    const dos = planificar([b, a]);
    expect(dos.map(({ serieClave, estado }) => [serieClave, estado])).toEqual(
      uno.map(({ serieClave, estado }) => [serieClave, estado])
    );
  });
});
