import { describe, expect, it, vi } from "vitest";
import { crearReuniones } from "../src/modules/reuniones/crear-reuniones.service";

describe("crearReuniones - cohosts e invitados", () => {
  const baseInput = {
    titulo: "Seminario de Investigación",
    docenteProgramaId: "dp-123",
    modalidad: "VIRTUAL" as const,
    timezone: "America/Montevideo",
    instancias: [
      {
        inicio: new Date("2027-10-01T14:00:00-03:00"),
        fin: new Date("2027-10-01T16:00:00-03:00")
      }
    ]
  };

  function createMockDb({
    docenteUserId = "docente-user-1",
    actorUserId = "actor-user-admin",
    actorGoogleAccounts = [{ id: "google-actor-1", userId: "actor-user-admin", email: "admin@flacso.edu.uy" }],
    docenteGoogleAccounts = [{ id: "google-docente-1", userId: "docente-user-1", email: "docente@flacso.edu.uy" }],
    assistantGoogleAccounts = [{ id: "google-asistente-1", userId: "asistente-user-1", email: "asistente@flacso.edu.uy" }],
    docenteEmailPrincipal = "docente@flacso.edu.uy"
  }: {
    docenteUserId?: string;
    actorUserId?: string;
    actorGoogleAccounts?: { id: string; userId: string; email: string }[];
    docenteGoogleAccounts?: { id: string; userId: string; email: string }[];
    assistantGoogleAccounts?: { id: string; userId: string; email: string }[];
    docenteEmailPrincipal?: string;
  } = {}) {
    const createdCohostReuniones: { instanciaSalaId: string; cuentaGoogleId: string }[] = [];
    const createdCohostEmails: { instanciaSalaId: string; email: string }[] = [];
    const createdEventos: Record<string, unknown>[] = [];

    const tx = {
      $executeRaw: vi.fn(),
      solicitudSala: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: "solicitud-123" })
      },
      docentePrograma: {
        findUnique: vi.fn().mockResolvedValue({
          id: "dp-123",
          activo: true,
          docente: { usuarioId: docenteUserId },
          programa: { activo: true }
        })
      },
      proveedorReunion: {
        findUnique: vi.fn().mockResolvedValue({ id: "prov-zoom", tipo: "ZOOM" })
      },
      asistenteTecnico: {
        findUnique: vi.fn().mockResolvedValue({
          id: "asistente-1",
          usuarioId: "asistente-user-1",
          cesadoHastaProximoInicioSesion: false,
          usuario: { activo: true, rol: "ASISTENTE_TECNICO", emailPrincipal: "asistente@flacso.edu.uy" }
        })
      },
      asignacionAsistenciaTecnica: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({ id: "asig-1" })
      },
      tarifaAsistenciaTecnica: {
        findFirst: vi.fn().mockResolvedValue({ id: "tarifa-1", valorHora: 500, moneda: "UYU" })
      },
      cuentaGoogleFlacso: {
        findMany: vi.fn().mockImplementation(({ where }) => {
          const all = [...actorGoogleAccounts, ...docenteGoogleAccounts, ...assistantGoogleAccounts];
          if (where?.id?.in) {
            const ids = where.id.in as string[];
            return Promise.resolve(all.filter((account) => ids.includes(account.id)));
          }
          if (where?.userId?.in) {
            const userIds = where.userId.in as string[];
            return Promise.resolve(all.filter((account) => userIds.includes(account.userId)));
          }
          return Promise.resolve([]);
        })
      },
      usuario: {
        findUnique: vi.fn().mockImplementation(({ where }) => {
          if (where.id === docenteUserId) return Promise.resolve({ emailPrincipal: docenteEmailPrincipal });
          if (where.id === actorUserId) return Promise.resolve({ emailPrincipal: "admin@flacso.edu.uy" });
          return Promise.resolve(null);
        })
      },
      cuentaProveedor: {
        findMany: vi.fn().mockResolvedValue([{ id: "sala-01", prioridad: 1, limiteConcurrente: null }])
      },
      eventoProveedor: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockImplementation(({ data }) => {
          createdEventos.push(data);
          return Promise.resolve({ id: "evento-1" });
        })
      },
      reunionProveedor: {
        create: vi.fn().mockResolvedValue({ id: "reunion-1" })
      },
      instanciaSala: {
        create: vi.fn().mockResolvedValue({ id: "instancia-1" })
      },
      cohostReunion: {
        createMany: vi.fn().mockImplementation(({ data }) => {
          createdCohostReuniones.push(...data);
          return Promise.resolve({ count: data.length });
        })
      },
      cohostEmailReunion: {
        createMany: vi.fn().mockImplementation(({ data }) => {
          createdCohostEmails.push(...data);
          return Promise.resolve({ count: data.length });
        })
      }
    };

    const db = { $transaction: vi.fn().mockImplementation((fn) => fn(tx)) };
    return { db, createdCohostReuniones, createdCohostEmails, createdEventos, tx };
  }

  it("guarda el correo del docente sin exigir una cuenta Google", async () => {
    const { db, createdCohostReuniones, createdCohostEmails } = createMockDb({ docenteGoogleAccounts: [] });

    const result = await crearReuniones(
      db as never,
      { id: "actor-user-admin", rol: "ADMINISTRACION" },
      { ...baseInput, requiereAsistenciaTecnica: false }
    );

    expect(result.solicitudId).toBe("solicitud-123");
    expect(createdCohostReuniones).toHaveLength(0);
    expect(createdCohostEmails.map(({ email }) => email)).toContain("docente@flacso.edu.uy");
    expect(createdCohostEmails.map(({ email }) => email)).not.toContain("admin@flacso.edu.uy");
  });

  it("usa el correo principal del docente cuando no tiene cuenta Google vinculada", async () => {
    const { db, createdCohostReuniones, createdCohostEmails } = createMockDb({ docenteGoogleAccounts: [] });

    await crearReuniones(
      db as never,
      { id: "actor-user-admin", rol: "ADMINISTRACION" },
      { ...baseInput, requiereAsistenciaTecnica: false }
    );

    expect(createdCohostReuniones).toHaveLength(0);
    expect(createdCohostEmails.map(({ email }) => email)).toContain("docente@flacso.edu.uy");
  });

  it("con asistencia asignada guarda los correos del docente y asistente", async () => {
    const { db, createdCohostReuniones, createdCohostEmails } = createMockDb();

    await crearReuniones(
      db as never,
      { id: "actor-user-admin", rol: "ADMINISTRACION" },
      { ...baseInput, requiereAsistenciaTecnica: true, asistenteTecnicoId: "asistente-1" }
    );

    expect(createdCohostReuniones).toHaveLength(0);
    expect(createdCohostEmails.map(({ email }) => email)).toEqual(expect.arrayContaining(["docente@flacso.edu.uy", "asistente@flacso.edu.uy"]));
  });

  it("con asistencia abierta guarda el correo del docente", async () => {
    const { db, createdCohostEmails } = createMockDb();

    await crearReuniones(
      db as never,
      { id: "actor-user-admin", rol: "ADMINISTRACION" },
      { ...baseInput, requiereAsistenciaTecnica: true }
    );

    expect(createdCohostEmails.map(({ email }) => email)).toEqual(["docente@flacso.edu.uy"]);
  });

  it("guarda cohosts adicionales e invitados separados para Calendar", async () => {
    const { db, createdCohostEmails, createdEventos } = createMockDb();

    await crearReuniones(
      db as never,
      { id: "actor-user-admin", rol: "ADMINISTRACION" },
      {
        ...baseInput,
        cohostEmailsManual: ["EXTERNO@GMAIL.COM"],
        invitadosEmails: ["invitado@ejemplo.org", "externo@gmail.com"]
      }
    );

    expect(createdCohostEmails.map(({ email }) => email)).toContain("externo@gmail.com");
    expect(createdEventos[0]).toMatchObject({
      payloadUltimo: { salaVirtual: { invitadosEmails: ["invitado@ejemplo.org"] } }
    });
  });

  describe("crearReuniones - reunión Zoom compartida por serie", () => {
  const dia = (n: number) => ({
    inicio: new Date(`2027-10-0${n}T14:00:00-03:00`),
    fin: new Date(`2027-10-0${n}T16:00:00-03:00`)
  });
  const input = (cantidad: number) => ({
    titulo: "Seminario de Investigación",
    docenteProgramaId: "dp-123",
    modalidad: "VIRTUAL" as const,
    timezone: "America/Montevideo",
    requiereAsistenciaTecnica: false,
    instancias: Array.from({ length: cantidad }, (_, i) => dia(i + 1))
  });
  const admin = { id: "actor-user-admin", rol: "ADMINISTRACION" as const };

  it("siempre crea una sola reunión y todos los encuentros la comparten con la misma sala", async () => {
    const { db, tx, createdEventos } = createMockDb();
    await crearReuniones(db as never, admin, input(3));

    expect(tx.reunionProveedor.create).toHaveBeenCalledTimes(1);
    expect(tx.reunionProveedor.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        proveedorId: "prov-zoom",
        cuentaProveedorId: "sala-01",
        serieClave: expect.stringMatching(/^serie:/)
      })
    }));
    expect(createdEventos).toHaveLength(3);
    for (const evento of createdEventos) {
      expect(evento).toMatchObject({ reunionProveedorId: "reunion-1", cuentaProveedorId: "sala-01", operacionPendiente: "PROVISIONAR" });
    }
  });

  it("una reunión de un solo encuentro también crea la suya", async () => {
    const { db, tx, createdEventos } = createMockDb();
    await crearReuniones(db as never, admin, input(1));
    expect(tx.reunionProveedor.create).toHaveBeenCalledTimes(1);
    expect(createdEventos[0]).toMatchObject({ reunionProveedorId: "reunion-1" });
  });

  it("la disponibilidad de todos los horarios se sigue validando con la reunión compartida", async () => {
    const { db, tx } = createMockDb();
    tx.cuentaProveedor.findMany.mockResolvedValue([]);
    await expect(crearReuniones(db as never, admin, input(2))).rejects.toThrow();
    expect(tx.reunionProveedor.create).not.toHaveBeenCalled();
  });
});
});
