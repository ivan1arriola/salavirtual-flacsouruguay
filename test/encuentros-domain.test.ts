import { describe, expect, it } from "vitest";
import {
  actualizarEncuentroSchema,
  elegirCuentaHost,
  elegirCuentaHostParaPeriodos,
  modalidadEfectivaEncuentro,
  periodoAsistenciaTecnica,
  puedeCambiarAsistenciaEncuentro,
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

  it("permite cambiar asistencia antes y durante el encuentro, pero no después", () => {
    const ahora = new Date("2026-08-18T21:25:00Z");

    expect(puedeCambiarAsistenciaEncuentro(
      "PROGRAMADA",
      new Date("2026-08-18T22:00:00Z"),
      ahora
    )).toBe(true);
    expect(puedeCambiarAsistenciaEncuentro(
      "PROGRAMADA",
      new Date("2026-08-18T21:25:00Z"),
      ahora
    )).toBe(false);
    expect(puedeCambiarAsistenciaEncuentro(
      "FINALIZADA",
      new Date("2026-08-18T22:00:00Z"),
      ahora
    )).toBe(false);
  });

  it("conserva la sala de la serie cuando está disponible", () => {
    expect(elegirCuentaHost("s2", [{ id: "s1", prioridad: 1 }, { id: "s2", prioridad: 2 }], [])).toBe("s2");
  });

  it("elige la sala disponible de mayor prioridad", () => {
    expect(elegirCuentaHost("s2", [{ id: "s2", prioridad: 2 }, { id: "s1", prioridad: 1 }], ["s2"])).toBe("s1");
  });

  it("deja la validación de timezone al servicio, que conoce la serie", () => {
    expect(actualizarEncuentroSchema.safeParse({
      accion: "EDITAR_FECHA",
      inicio: "2026-08-03T23:00:00-03:00",
      fin: "2026-08-04T00:30:00-03:00"
    }).success).toBe(true);
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
    expect(actualizarEncuentroSchema.safeParse({
      accion: "CAMBIAR_MODALIDAD",
      modalidad: "HIBRIDA"
    }).success).toBe(true);
    expect(actualizarEncuentroSchema.safeParse({
      accion: "CAMBIAR_MODALIDAD",
      modalidad: null
    }).success).toBe(true);
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
    expect(periodoAsistenciaTecnica({
      inicioProgramadoAt: new Date("2026-10-10T14:00:00Z"),
      finProgramadoAt: new Date("2026-10-10T16:30:00Z"),
      inicioAsistenciaTecnicaAt: new Date("2026-10-10T12:00:00Z"),
      finAsistenciaTecnicaAt: new Date("2026-10-10T17:00:00Z")
    })).toMatchObject({
      inicio: new Date("2026-10-10T12:00:00Z"),
      fin: new Date("2026-10-10T17:00:00Z"),
      personalizado: true
    });
  });

  it("acepta restablecer el horario técnico a la configuración de la serie", () => {
    expect(actualizarEncuentroSchema.safeParse({
      accion: "RESTABLECER_HORARIO_ASISTENCIA"
    }).success).toBe(true);
  });

  it("respeta el limite concurrente configurado de una sala", () => {
    const periodo = {
      inicio: new Date("2026-08-03T13:00:00Z"),
      fin: new Date("2026-08-03T15:00:00Z")
    };
    expect(elegirCuentaHostParaPeriodos(null, [
      { id: "s1", prioridad: 1, limiteConcurrente: 2 }
    ], [{ cuentaProveedorId: "s1", ...periodo }], [periodo])).toBe("s1");
    expect(elegirCuentaHostParaPeriodos(null, [
      { id: "s1", prioridad: 1, limiteConcurrente: 1 }
    ], [{ cuentaProveedorId: "s1", ...periodo }], [periodo])).toBeNull();
  });
});
