import { describe, expect, it, vi } from "vitest";
import { comprobarSaludWorkerZoom } from "../src/modules/archivos/application/comprobar-salud-worker-zoom";

const base = {
  activa: true,
  serviceAccountEmail: "sa@x",
  driveDestinationId: "raiz",
  serviceAccountSubject: "admin@flacso.edu.uy",
};

describe("comprobarSaludWorkerZoom", () => {
  it("sano si hay identidad general, carpeta destino con permiso de escritura y credenciales Zoom", async () => {
    const verificar = vi.fn(async () => true);
    expect(
      await comprobarSaludWorkerZoom({
        workspace: base,
        zoomDisponible: true,
        driveHistoricoId: "admin",
        verificarEscritura: verificar,
      }),
    ).toMatchObject({ ok: true, motivos: [] });
    expect(verificar).toHaveBeenCalledWith("raiz");
    expect(verificar).toHaveBeenCalledWith("admin");
  });

  it("sin serviceAccountSubject no arranca (es opcional en el esquema, pero obligatorio aquí)", async () => {
    const r = await comprobarSaludWorkerZoom({
      workspace: { ...base, serviceAccountSubject: null },
      zoomDisponible: true,
      driveHistoricoId: null,
      verificarEscritura: async () => true,
    });
    expect(r.ok).toBe(false);
    expect(r.motivos.join(" ")).toMatch(/serviceAccountSubject/);
  });

  it("falla y lo informa sin Workspace activo, sin credenciales Zoom o sin permiso de escritura", async () => {
    expect(
      (
        await comprobarSaludWorkerZoom({
          workspace: null,
          zoomDisponible: true,
          driveHistoricoId: null,
          verificarEscritura: async () => true,
        })
      ).motivos.join(" "),
    ).toMatch(/Workspace/);
    expect(
      (
        await comprobarSaludWorkerZoom({
          workspace: base,
          zoomDisponible: false,
          driveHistoricoId: null,
          verificarEscritura: async () => true,
        })
      ).motivos.join(" "),
    ).toMatch(/Zoom/);
    const r = await comprobarSaludWorkerZoom({
      workspace: base,
      zoomDisponible: true,
      driveHistoricoId: "admin",
      verificarEscritura: async (id) => id !== "admin",
    });
    expect(r.ok).toBe(false);
    expect(r.motivos.join(" ")).toMatch(/histórica/);
  });

  it("sin carpeta de administración sigue sano, pero avisa que los históricos sin vincular esperarán", async () => {
    const r = await comprobarSaludWorkerZoom({
      workspace: base,
      zoomDisponible: true,
      driveHistoricoId: null,
      verificarEscritura: async () => true,
    });
    expect(r.ok).toBe(true);
    expect(r.avisos).toEqual([expect.stringMatching(/HISTORICO_ID/)]);
  });

  it("un error al consultar Drive es un fallo de salud, no una excepción que tumba el chequeo", async () => {
    const r = await comprobarSaludWorkerZoom({
      workspace: base,
      zoomDisponible: true,
      driveHistoricoId: null,
      verificarEscritura: async () => {
        throw new Error("red");
      },
    });
    expect(r.ok).toBe(false);
  });
});
