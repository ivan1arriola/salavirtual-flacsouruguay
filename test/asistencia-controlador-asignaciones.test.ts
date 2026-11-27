import { describe, expect, it, vi } from "vitest";
import { crearControladorAsignaciones } from "@/src/modules/asistencia/application";
import type { AsistenciaRepositoryPort } from "@/src/modules/asistencia/ports";

const admin = { id: "admin-1", rol: "ADMINISTRACION", activo: true };
const fila = {
  id: "asig-1",
  instanciaSalaId: "inst-1",
  asistenteTecnicoId: "asist-1",
  estado: "ASIGNADO",
  asistenteUsuarioId: "u-1",
  asistenteEmail: "ana@flacso.edu.uy",
  googleAccountIds: [],
};

function crear(repo: Partial<AsistenciaRepositoryPort>) {
  const sincronizar = vi.fn().mockResolvedValue({ calendarioAsistente: [], warning: null });
  const controlador = crearControladorAsignaciones({
    repo: repo as AsistenciaRepositoryPort,
    sincronizar,
  });
  return { controlador, sincronizar };
}

describe("controlador de asignaciones", () => {
  it("asigna delegando en el repositorio con el administrador como actor", async () => {
    const reservarYAsignarAsistente = vi.fn().mockResolvedValue(fila);
    const { controlador } = crear({ reservarYAsignarAsistente });

    const res = await controlador.asignar(admin, {
      instanciaSalaId: "inst-1",
      asistenteTecnicoId: "asist-1",
    });

    expect(res).toBe(fila);
    expect(reservarYAsignarAsistente).toHaveBeenCalledWith("inst-1", "asist-1", "admin-1");
  });

  it("permite reasignar al mismo asistente tras una cancelación (A → B → A)", async () => {
    const reservarYAsignarAsistente = vi.fn().mockResolvedValue(fila);
    const { controlador } = crear({ reservarYAsignarAsistente });
    const input = { instanciaSalaId: "inst-1", asistenteTecnicoId: "asist-1" };

    await controlador.asignar(admin, input);
    await controlador.asignar(admin, { ...input, asistenteTecnicoId: "asist-2" });
    await controlador.asignar(admin, input);

    expect(reservarYAsignarAsistente).toHaveBeenCalledTimes(3);
  });

  it("rechaza a quien no es Administración sin tocar el repositorio", async () => {
    const reservarYAsignarAsistente = vi.fn();
    const { controlador } = crear({ reservarYAsignarAsistente });

    await expect(
      controlador.asignar(
        { id: "d-1", rol: "DOCENTE", activo: true },
        { instanciaSalaId: "i", asistenteTecnicoId: "a" },
      ),
    ).rejects.toThrow("Solo Administración puede asignar asistentes de monitoreo.");
    expect(reservarYAsignarAsistente).not.toHaveBeenCalled();
  });

  it("desvincula y expone la sincronización posterior al commit", async () => {
    const desvincularAsistente = vi.fn().mockResolvedValue({ ...fila, estado: "CANCELADO" });
    const { controlador, sincronizar } = crear({ desvincularAsistente });

    const res = await controlador.desvincular(admin, { asignacionId: "asig-1" });
    await controlador.sincronizar(res.instanciaSalaId, "aviso");

    expect(desvincularAsistente).toHaveBeenCalledWith("asig-1", "admin-1");
    expect(sincronizar).toHaveBeenCalledWith("inst-1", "aviso");
  });
});

describe("adaptador Prisma: reasignación", () => {
  it("reutiliza la fila única (instancia, asistente) y limpia la confirmación previa", async () => {
    const { crearPrismaAsistenciaRepositoryAdapter } =
      await import("@/src/modules/asistencia/infrastructure");
    const upsert = vi.fn().mockResolvedValue({
      id: "asig-1",
      instanciaSalaId: "inst-1",
      asistenteTecnicoId: "asist-1",
      estado: "ASIGNADO",
    });
    const tx = {
      $executeRaw: vi.fn(),
      usuario: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ id: "admin-1", activo: true, rol: "ADMINISTRACION" }),
      },
      instanciaSala: {
        findUnique: vi.fn().mockResolvedValue({
          id: "inst-1",
          requiereAsistenciaTecnica: true,
          estado: "PROGRAMADA",
          inicioProgramadoAt: new Date(Date.now() + 3_600_000),
          finProgramadoAt: new Date(Date.now() + 7_200_000),
          modalidadOverride: null,
          inicioAsistenciaTecnicaAt: null,
          finAsistenciaTecnicaAt: null,
          solicitud: { id: "s-1", titulo: "Clase", modalidad: "VIRTUAL" },
          asignaciones: [{ id: "asig-2", asistenteTecnicoId: "asist-2" }],
        }),
      },
      asistenteTecnico: {
        findUnique: vi.fn().mockResolvedValue({
          id: "asist-1",
          usuarioId: "u-1",
          cesadoHastaProximoInicioSesion: false,
          usuario: {
            activo: true,
            rol: "ASISTENTE_TECNICO",
            emailPrincipal: "ana@flacso.edu.uy",
            cuentasGoogle: [],
          },
        }),
      },
      asignacionAsistenciaTecnica: {
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn(),
        upsert,
      },
      tarifaAsistenciaTecnica: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: "t-1", valorHora: { toNumber: () => 100 }, moneda: "UYU" }),
      },
      auditoria: { create: vi.fn() },
    };
    const db = { $transaction: (fn: (t: typeof tx) => unknown) => fn(tx) };

    await crearPrismaAsistenciaRepositoryAdapter(db as never).reservarYAsignarAsistente(
      "inst-1",
      "asist-1",
      "admin-1",
    );

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          instanciaSalaId_asistenteTecnicoId: {
            instanciaSalaId: "inst-1",
            asistenteTecnicoId: "asist-1",
          },
        },
        update: expect.objectContaining({
          estado: "ASIGNADO",
          minutosConfirmados: null,
          montoConfirmado: null,
        }),
      }),
    );
  });
});
