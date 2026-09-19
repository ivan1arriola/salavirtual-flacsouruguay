import { describe, expect, it } from "vitest";
import {
  cuentasCalendarioDeseadas,
  hayErroresSincronizacionCalendarioAsistente,
  idEventoCalendarioAsistente,
  planificarSincronizacionCalendarioAsistente,
} from "../src/modules/asistencia/domain";
import * as facade from "../src/modules/asistencia/calendario-asistente.domain";

const linkedAccount = {
  id: "google-1",
  email: "asistente@flacso.edu.uy",
  dominio: "flacso.edu.uy",
  providerAccountId: "subject-1",
  emailVerificadoAt: new Date("2026-09-01T12:00:00Z"),
};

function assignment(overrides: Record<string, unknown> = {}) {
  return {
    id: "assignment-1",
    estado: "ASIGNADO",
    asistenteTecnico: {
      usuario: {
        rol: "ASISTENTE_TECNICO",
        activo: true,
        fusionadoEnId: null,
        cuentasGoogle: [linkedAccount],
      },
    },
    ...overrides,
  } as never;
}

describe("calendario de asistentes técnicos", () => {
  it("genera un id de evento determinístico y compatible con Calendar", () => {
    const first = idEventoCalendarioAsistente("instancia-1", "google-1");
    const second = idEventoCalendarioAsistente("instancia-1", "google-1");

    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
  });

  it("sincroniza únicamente cuentas Google vinculadas de asistentes técnicos activos", () => {
    const accounts = cuentasCalendarioDeseadas({
      estado: "PROGRAMADA",
      requiereAsistenciaTecnica: true,
      asignaciones: [assignment()],
    });

    expect(accounts).toEqual([linkedAccount]);
  });

  it("no sincroniza otros roles aunque tengan una cuenta vinculada", () => {
    const accounts = cuentasCalendarioDeseadas({
      estado: "PROGRAMADA",
      requiereAsistenciaTecnica: true,
      asignaciones: [assignment({
        asistenteTecnico: {
          usuario: {
            rol: "DOCENTE",
            activo: true,
            fusionadoEnId: null,
            cuentasGoogle: [linkedAccount],
          },
        },
      })],
    });

    expect(accounts).toEqual([]);
  });

  it("no sincroniza cuentas preautorizadas que todavía no fueron vinculadas", () => {
    const accounts = cuentasCalendarioDeseadas({
      estado: "PROGRAMADA",
      requiereAsistenciaTecnica: true,
      asignaciones: [assignment({
        asistenteTecnico: {
          usuario: {
            rol: "ASISTENTE_TECNICO",
            activo: true,
            fusionadoEnId: null,
            cuentasGoogle: [{ ...linkedAccount, providerAccountId: null, emailVerificadoAt: null }],
          },
        },
      })],
    });

    expect(accounts).toEqual([]);
  });

  it("no vuelve a publicar encuentros que ya finalizaron", () => {
    const accounts = cuentasCalendarioDeseadas({
      estado: "PROGRAMADA",
      requiereAsistenciaTecnica: true,
      vigente: false,
      asignaciones: [assignment()],
    });

    expect(accounts).toEqual([]);
  });

  it("al reasignar elimina el evento del asistente anterior y publica el del nuevo", () => {
    const previous = { ...linkedAccount, id: "google-old", email: "anterior@flacso.edu.uy" };
    const current = { ...linkedAccount, id: "google-new", email: "nuevo@flacso.edu.uy", providerAccountId: "subject-2" };
    const plan = planificarSincronizacionCalendarioAsistente({
      instanciaId: "instancia-1",
      estado: "PROGRAMADA",
      requiereAsistenciaTecnica: true,
      asignaciones: [
        assignment({
          id: "old",
          estado: "CANCELADO",
          asistenteTecnico: { usuario: { rol: "ASISTENTE_TECNICO", activo: true, fusionadoEnId: null, cuentasGoogle: [previous] } },
        }),
        assignment({
          id: "new",
          estado: "ASIGNADO",
          asistenteTecnico: { usuario: { rol: "ASISTENTE_TECNICO", activo: true, fusionadoEnId: null, cuentasGoogle: [current] } },
        }),
      ],
    });

    expect(plan.publicar.map(({ cuenta }) => cuenta.id)).toEqual(["google-new"]);
    expect(plan.eliminar.map(({ cuenta }) => cuenta.id)).toEqual(["google-old"]);
  });

  it("si la reunión se cancela elimina todos los eventos previamente posibles", () => {
    const plan = planificarSincronizacionCalendarioAsistente({
      instanciaId: "instancia-1",
      estado: "CANCELADA",
      requiereAsistenciaTecnica: true,
      asignaciones: [assignment()],
    });

    expect(plan.publicar).toEqual([]);
    expect(plan.eliminar).toHaveLength(1);
  });

  it("detecta presencia o ausencia de errores en resultados de sincronizacion", () => {
    expect(hayErroresSincronizacionCalendarioAsistente([
      { cuentaGoogleId: "g1", email: "a@flacso.edu.uy", accion: "PUBLICAR", estado: "SINCRONIZADA" },
    ])).toBe(false);

    expect(hayErroresSincronizacionCalendarioAsistente([
      { cuentaGoogleId: "g1", email: "a@flacso.edu.uy", accion: "PUBLICAR", estado: "SINCRONIZADA" },
      { cuentaGoogleId: "g2", email: "b@flacso.edu.uy", accion: "ELIMINAR", estado: "ERROR", error: "fail" },
    ])).toBe(true);
  });

  it("la fachada calendario-asistente.domain preserva las mismas funciones", () => {
    expect(facade.idEventoCalendarioAsistente).toBe(idEventoCalendarioAsistente);
    expect(facade.cuentasCalendarioDeseadas).toBe(cuentasCalendarioDeseadas);
    expect(facade.planificarSincronizacionCalendarioAsistente).toBe(planificarSincronizacionCalendarioAsistente);
    expect(facade.hayErroresSincronizacionCalendarioAsistente).toBe(hayErroresSincronizacionCalendarioAsistente);
  });
});
