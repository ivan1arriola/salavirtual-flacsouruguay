import { describe, expect, it } from "vitest";
import {
  actualizarEncuentroSchema,
  elegirCuentaHost,
  elegirCuentaHostParaPeriodos,
  idsCancelacionesGooglePendientes,
  modalidadEfectivaEncuentro,
  periodoAsistenciaTecnica,
  puedeCambiarAsistenciaEncuentro,
  puedeCorregirModalidadHistorica,
  puedeGestionarEncuentros,
  resolverEstadoSolicitudPorIntegraciones
} from "../src/modules/reuniones/encuentros.domain";

describe("gestión funcional de encuentros", () => {
  it("deriva el estado general desde la integración de todos los eventos", () => {
    expect(resolverEstadoSolicitudPorIntegraciones([])).toBe("REGISTRADA");
    expect(resolverEstadoSolicitudPorIntegraciones(["PENDIENTE"])).toBe("PROVISIONANDO");
    expect(resolverEstadoSolicitudPorIntegraciones(["SINCRONIZADA", "HISTORICA"])).toBe("PROVISIONADA");
    expect(resolverEstadoSolicitudPorIntegraciones(["SINCRONIZADA", "ERROR"])).toBe("REQUIERE_REVISION");
  });

  it("permite Administracion y al docente titular", () => {
    expect(puedeGestionarEncuentros("ADMINISTRACION", "a", "d")).toBe(true);
    expect(puedeGestionarEncuentros("DOCENTE", "d", "d")).toBe(true);
    expect(puedeGestionarEncuentros("DOCENTE", "otro", "d")).toBe(false);
  });

  it("permite a Administración corregir la modalidad de registros históricos no cancelados", () => {
    expect(puedeCorregirModalidadHistorica("ADMINISTRACION", "FINALIZADA")).toBe(true);
    expect(puedeCorregirModalidadHistorica("ADMINISTRACION", "PROGRAMADA")).toBe(true);
    expect(puedeCorregirModalidadHistorica("ADMINISTRACION", "CANCELADA")).toBe(false);
    expect(puedeCorregirModalidadHistorica("DOCENTE", "FINALIZADA")).toBe(false);
  });

  it("permite cambiar asistencia antes y durante el encuentro, pero no después", () => {
    const ahora = new Date("2026-08-18T21:25:00Z");

    expect(puedeCambiarAsistenciaEncuentro("PROGRAMADA", new Date("2026-08-18T22:00:00Z"), ahora)).toBe(true);
    expect(puedeCambiarAsistenciaEncuentro("PROGRAMADA", new Date("2026-08-18T21:25:00Z"), ahora)).toBe(
      false
    );
    expect(puedeCambiarAsistenciaEncuentro("FINALIZADA", new Date("2026-08-18T22:00:00Z"), ahora)).toBe(
      false
    );
  });

  it("conserva la sala de la serie cuando está disponible", () => {
    expect(
      elegirCuentaHost(
        "s2",
        [
          { id: "s1", prioridad: 1 },
          { id: "s2", prioridad: 2 }
        ],
        []
      )
    ).toBe("s2");
  });

  it("elige la sala disponible de mayor prioridad", () => {
    expect(
      elegirCuentaHost(
        "s2",
        [
          { id: "s2", prioridad: 2 },
          { id: "s1", prioridad: 1 }
        ],
        ["s2"]
      )
    ).toBe("s1");
  });

  it("deja la validación de timezone al servicio, que conoce la serie", () => {
    expect(
      actualizarEncuentroSchema.safeParse({
        accion: "EDITAR_FECHA",
        inicio: "2026-08-03T23:00:00-03:00",
        fin: "2026-08-04T00:30:00-03:00"
      }).success
    ).toBe(true);
  });

  it("permite editar la descripción propia de un encuentro", () => {
    const result = actualizarEncuentroSchema.parse({
      accion: "EDITAR_ENCUENTRO",
      inicio: "2026-08-03T13:00:00Z",
      fin: "2026-08-03T14:00:00Z",
      descripcion: "Tema específico de esta fecha"
    });

    expect("descripcion" in result ? result.descripcion : null).toBe("Tema específico de esta fecha");
  });

  it("acepta cambiar la modalidad de una única reunión y restablecer la serie", () => {
    expect(
      actualizarEncuentroSchema.safeParse({
        accion: "CAMBIAR_MODALIDAD",
        modalidad: "HIBRIDA"
      }).success
    ).toBe(true);
    expect(
      actualizarEncuentroSchema.safeParse({
        accion: "CAMBIAR_MODALIDAD",
        modalidad: null
      }).success
    ).toBe(true);
    expect(modalidadEfectivaEncuentro("VIRTUAL", "HIBRIDA")).toBe("HIBRIDA");
    expect(modalidadEfectivaEncuentro("VIRTUAL", null)).toBe("VIRTUAL");
  });

  it("acepta horario exacto de llegada y salida para una reunión puntual", () => {
    const result = actualizarEncuentroSchema.safeParse({
      accion: "EDITAR_HORARIO_ASISTENCIA",
      inicioAsistenciaTecnica: "2026-10-10T09:00:00-03:00",
      finAsistenciaTecnica: "2026-10-10T14:00:00-03:00"
    });
    expect(result.success).toBe(true);
    expect(
      periodoAsistenciaTecnica({
        inicioProgramadoAt: new Date("2026-10-10T14:00:00Z"),
        finProgramadoAt: new Date("2026-10-10T16:30:00Z"),
        inicioAsistenciaTecnicaAt: new Date("2026-10-10T12:00:00Z"),
        finAsistenciaTecnicaAt: new Date("2026-10-10T17:00:00Z")
      })
    ).toMatchObject({
      inicio: new Date("2026-10-10T12:00:00Z"),
      fin: new Date("2026-10-10T17:00:00Z"),
      personalizado: true
    });
  });

  it("acepta restablecer el horario técnico a la configuración de la serie", () => {
    expect(
      actualizarEncuentroSchema.safeParse({
        accion: "RESTABLECER_HORARIO_ASISTENCIA"
      }).success
    ).toBe(true);
  });

  it("respeta el limite concurrente configurado de una sala", () => {
    const periodo = {
      inicio: new Date("2026-08-03T13:00:00Z"),
      fin: new Date("2026-08-03T15:00:00Z")
    };
    expect(
      elegirCuentaHostParaPeriodos(
        null,
        [{ id: "s1", prioridad: 1, limiteConcurrente: 2 }],
        [{ cuentaProveedorId: "s1", ...periodo }],
        [periodo]
      )
    ).toBe("s1");
    expect(
      elegirCuentaHostParaPeriodos(
        null,
        [{ id: "s1", prioridad: 1, limiteConcurrente: 1 }],
        [{ cuentaProveedorId: "s1", ...periodo }],
        [periodo]
      )
    ).toBeNull();
  });
  it("reintenta solo cancelaciones pendientes de Google y Zoom sin reencolar eventos completados", () => {
    expect(
      idsCancelacionesGooglePendientes([
        {
          eventosProveedor: [
            { id: "pendiente", proveedor: { tipo: "GOOGLE_MEET" }, operacionPendiente: "CANCELAR" },
            { id: "completo", proveedor: { tipo: "GOOGLE_MEET" }, operacionPendiente: null },
            { id: "zoom", proveedor: { tipo: "ZOOM" }, operacionPendiente: "CANCELAR" }
          ]
        },
        {
          eventosProveedor: [
            { id: "otro", proveedor: { tipo: "GOOGLE_MEET" }, operacionPendiente: "CANCELAR" }
          ]
        }
      ])
    ).toEqual(["pendiente", "zoom", "otro"]);
    expect(
      idsCancelacionesGooglePendientes([
        {
          eventosProveedor: [{ id: "completo", proveedor: { tipo: "GOOGLE_MEET" }, operacionPendiente: null }]
        }
      ])
    ).toEqual([]);
  });

  it("permite reservas consecutivas dentro de un intervalo largo si no exceden el pico concurrente", () => {
    const fecha = (hora: string) => new Date(`2026-10-12T${hora}:00Z`);
    const host = [{ id: "sala01", prioridad: 1, limiteConcurrente: 2 }];
    const existentes = [
      { cuentaProveedorId: "sala01", inicio: fecha("09:00"), fin: fecha("10:00") },
      { cuentaProveedorId: "sala01", inicio: fecha("10:00"), fin: fecha("11:00") }
    ];
    expect(
      elegirCuentaHostParaPeriodos(null, host, existentes, [{ inicio: fecha("09:00"), fin: fecha("11:00") }])
    ).toBe("sala01");
  });

  it("rechaza cuando tres encuentros coinciden con capacidad de dos", () => {
    const fecha = (hora: string) => new Date(`2026-10-12T${hora}:00Z`);
    const host = [{ id: "sala01", prioridad: 1, limiteConcurrente: 2 }];
    expect(
      elegirCuentaHostParaPeriodos(
        null,
        host,
        [{ cuentaProveedorId: "sala01", inicio: fecha("09:00"), fin: fecha("10:30") }],
        [
          { inicio: fecha("09:30"), fin: fecha("10:30") },
          { inicio: fecha("10:00"), fin: fecha("11:00") }
        ]
      )
    ).toBeNull();
  });

  it("considera las reuniones consecutivas como no simultáneas", () => {
    const fecha = (hora: string) => new Date(`2026-10-12T${hora}:00Z`);
    expect(
      elegirCuentaHostParaPeriodos(
        null,
        [{ id: "sala01", prioridad: 1, limiteConcurrente: 1 }],
        [{ cuentaProveedorId: "sala01", inicio: fecha("09:00"), fin: fecha("10:00") }],
        [{ inicio: fecha("10:00"), fin: fecha("11:00") }]
      )
    ).toBe("sala01");
  });

  it("no bloquea una reserva por sobreocupación antigua fuera del nuevo horario", () => {
    const fecha = (hora: string) => new Date(`2026-10-12T${hora}:00Z`);
    expect(
      elegirCuentaHostParaPeriodos(
        null,
        [{ id: "sala01", prioridad: 1, limiteConcurrente: 1 }],
        [
          { cuentaProveedorId: "sala01", inicio: fecha("09:00"), fin: fecha("10:00") },
          { cuentaProveedorId: "sala01", inicio: fecha("09:30"), fin: fecha("10:30") }
        ],
        [{ inicio: fecha("11:00"), fin: fecha("12:00") }]
      )
    ).toBe("sala01");
  });

  describe("balanceo de cuentas Zoom", () => {
    const fecha = (hora: string) => new Date(`2030-10-12T${hora}:00Z`);
    const hosts = [
      { id: "s1", prioridad: 1, limiteConcurrente: 1 },
      { id: "s2", prioridad: 2, limiteConcurrente: 1 },
      { id: "s3", prioridad: 3, limiteConcurrente: 1 }
    ];
    const solicitado = [{ inicio: fecha("16:00"), fin: fecha("17:00") }];
    const reserva = (cuentaProveedorId: string, inicio: string, fin: string) => ({
      cuentaProveedorId,
      inicio: fecha(inicio),
      fin: fecha(fin)
    });

    it("distribuye reuniones consecutivas entre cuentas, incluso sin solapamiento", () => {
      const primera = elegirCuentaHostParaPeriodos(null, hosts, [], solicitado, "MENOR_CARGA");
      expect(primera).toBe("s1");
      const existentes = [reserva("s1", "09:00", "10:00")];
      expect(elegirCuentaHostParaPeriodos(null, hosts, existentes, solicitado, "MENOR_CARGA")).toBe("s2");
      expect(
        elegirCuentaHostParaPeriodos(
          null,
          hosts,
          [...existentes, reserva("s2", "10:00", "11:00")],
          solicitado,
          "MENOR_CARGA"
        )
      ).toBe("s3");
    });

    it("desempata por duración antes que prioridad y respeta una cuenta preferida disponible", () => {
      const existentes = [
        reserva("s1", "09:00", "12:00"),
        reserva("s2", "09:00", "10:00"),
        reserva("s3", "09:00", "10:00")
      ];
      expect(elegirCuentaHostParaPeriodos(null, hosts, existentes, solicitado, "MENOR_CARGA")).toBe("s2");
      expect(elegirCuentaHostParaPeriodos("s1", hosts, existentes, solicitado, "MENOR_CARGA")).toBe("s1");
    });

    it("descarta una sala si cualquiera de los encuentros de la serie se solapa", () => {
      const existentes = [
        reserva("s1", "16:00", "17:00"),
        reserva("s2", "09:00", "10:00"),
        reserva("s2", "11:00", "12:00"),
        reserva("s3", "18:00", "19:00")
      ];
      const serie = [...solicitado, { inicio: fecha("18:00"), fin: fecha("19:00") }];
      expect(elegirCuentaHostParaPeriodos(null, hosts, existentes, serie, "MENOR_CARGA")).toBe("s2");
    });

    it("conserva la prioridad en los flujos que no solicitan balanceo", () => {
      expect(
        elegirCuentaHostParaPeriodos(null, hosts, [reserva("s1", "09:00", "10:00")], solicitado)
      ).toBe("s1");
    });
  });

  it("descarta salas con una capacidad configurada inválida", () => {
    const fecha = (hora: string) => new Date(`2026-10-12T${hora}:00Z`);
    expect(
      elegirCuentaHostParaPeriodos(
        null,
        [{ id: "sala01", prioridad: 1, limiteConcurrente: 0 }],
        [],
        [{ inicio: fecha("09:00"), fin: fecha("10:00") }]
      )
    ).toBeNull();
  });
});
