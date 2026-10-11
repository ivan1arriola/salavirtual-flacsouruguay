import { describe, expect, it, vi } from "vitest";
import { asignarAsistenteUseCase } from "../src/modules/asistencia/application/asignar-asistente.use-case";
import { desvincularAsistenteUseCase } from "../src/modules/asistencia/application/desvincular-asistente.use-case";
import { actualizarPostulacionUseCase } from "../src/modules/asistencia/application/actualizar-postulacion.use-case";
import { reportarDuracionUseCase } from "../src/modules/asistencia/application/reportar-duracion.use-case";
import type { AsistenciaRepositoryPort } from "../src/modules/asistencia/ports";

describe("F9: el servicio real de asistencia distingue denegaciones", () => {
  const repo = {
    reservarYAsignarAsistente: vi.fn(),
    desvincularAsistente: vi.fn(),
    obtenerPerfilAsistentePorUsuarioId: vi.fn(),
    reportarDuracion: vi.fn()
  } as unknown as AsistenciaRepositoryPort;

  it("impide que un docente asigne a un asistente (403)", async () => {
    await expect(asignarAsistenteUseCase({ repo },
      { id: "docente", rol: "DOCENTE", activo: true }, {}
    )).rejects.toMatchObject({ status: 403 });
  });
  it("impide que un docente desvincule asistencia (403)", async () => {
    await expect(desvincularAsistenteUseCase({ repo },
      { id: "docente", rol: "DOCENTE", activo: true }, {}
    )).rejects.toMatchObject({ status: 403 });
  });
  it("impide que una cuenta desactivada se postule (403)", async () => {
    await expect(actualizarPostulacionUseCase({ repo },
      { id: "asistente", rol: "ASISTENTE_TECNICO", activo: false }, {}
    )).rejects.toMatchObject({ status: 403 });
  });
  it("impide que un administrador reporte duración como asistente (403)", async () => {
    await expect(reportarDuracionUseCase({ repo },
      { id: "admin", rol: "ADMINISTRACION", activo: true }, {}
    )).rejects.toMatchObject({ status: 403 });
  });
});
