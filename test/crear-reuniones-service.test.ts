import { describe, expect, it, vi } from "vitest";
import { crearReuniones } from "../src/modules/reuniones/crear-reuniones.service";

describe("crearReuniones - nueva lógica de anfitriones", () => {
  const baseInput = {
    titulo: "Seminario de Investigación",
    docenteProgramaId: "dp-123",
    modalidad: "VIRTUAL" as const,
    timezone: "America/Montevideo",
    instancias: [
      {
        inicio: new Date("2026-10-01T14:00:00-03:00"),
        fin: new Date("2026-10-01T16:00:00-03:00")
      }
    ]
  };

  function createMockDb({
    docenteUserId = "docente-user-1",
    actorUserId = "actor-user-admin",
    actorGoogleAccounts = [{ id: "google-actor-1", userId: "actor-user-admin", email: "admin@flacso.edu.uy" }],
    docenteGoogleAccounts = [{ id: "google-docente-1", userId: "docente-user-1", email: "docente@flacso.edu.uy" }],
    assistantGoogleAccounts = [{ id: "google-asistente-1", userId: "asistente-user-1", email: "asistente@flacso.edu.uy" }],
    actorEmailPrincipal = "admin@flacso.edu.uy",
    docenteEmailPrincipal = "docente@flacso.edu.uy"
  }: {
    docenteUserId?: string;
    actorUserId?: string;
    actorGoogleAccounts?: { id: string; userId: string; email: string }[];
    docenteGoogleAccounts?: { id: string; userId: string; email: string }[];
    assistantGoogleAccounts?: { id: string; userId: string; email: string }[];
    actorEmailPrincipal?: string;
    docenteEmailPrincipal?: string;
  } = {}) {
    const createdCohostReuniones: { instanciaSalaId: string; cuentaGoogleId: string }[] = [];
    const createdCohostEmails: { instanciaSalaId: string; email: string }[] = [];

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
        findUnique: vi.fn().mockResolvedValue({ id: "prov-google", tipo: "GOOGLE_MEET" })
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
          if (where?.id?.in) {
            const ids = where.id.in as string[];
            const all = [...actorGoogleAccounts, ...docenteGoogleAccounts, ...assistantGoogleAccounts];
            return Promise.resolve(all.filter((a) => ids.includes(a.id)));
          }
          if (where?.userId?.in) {
            const userIds = where.userId.in as string[];
            const all = [...actorGoogleAccounts, ...docenteGoogleAccounts, ...assistantGoogleAccounts];
            return Promise.resolve(all.filter((a) => userIds.includes(a.userId)));
          }
          if (where?.userId) {
            const all = [...actorGoogleAccounts, ...docenteGoogleAccounts, ...assistantGoogleAccounts];
            return Promise.resolve(all.filter((a) => a.userId === where.userId));
          }
          return Promise.resolve([]);
        })
      },
      usuario: {
        findUnique: vi.fn().mockImplementation(({ where }) => {
          if (where.id === actorUserId) return Promise.resolve({ emailPrincipal: actorEmailPrincipal });
          if (where.id === docenteUserId) return Promise.resolve({ emailPrincipal: docenteEmailPrincipal });
          return Promise.resolve(null);
        })
      },
      cuentaProveedor: {
        findMany: vi.fn().mockResolvedValue([{ id: "sala-01", prioridad: 1, limiteConcurrente: null }])
      },
      eventoProveedor: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({ id: "evento-1" })
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

    const db = {
      $transaction: vi.fn().mockImplementation((fn) => fn(tx))
    };

    return { db, tx, createdCohostReuniones, createdCohostEmails };
  }

  it("sin asistencia tecnica: agrega al docente designado y al solicitante (actor) como cohosts", async () => {
    const { db, createdCohostReuniones } = createMockDb();

    const result = await crearReuniones(
      db as never,
      { id: "actor-user-admin", rol: "ADMINISTRACION" },
      {
        ...baseInput,
        requiereAsistenciaTecnica: false,
        hostTipo: "DOCENTE"
      }
    );

    expect(result.solicitudId).toBe("solicitud-123");
    // Debe incluir tanto al docente como al solicitante
    const assignedIds = createdCohostReuniones.map((c) => c.cuentaGoogleId);
    expect(assignedIds).toContain("google-docente-1");
    expect(assignedIds).toContain("google-actor-1");
  });

  it("sin asistencia tecnica: agrega el email principal del solicitante si no tiene cuenta Google vinculada", async () => {
    const { db, createdCohostReuniones, createdCohostEmails } = createMockDb({
      actorGoogleAccounts: [] // actor sin cuentaGoogleFlacso
    });

    await crearReuniones(
      db as never,
      { id: "actor-user-admin", rol: "ADMINISTRACION" },
      {
        ...baseInput,
        requiereAsistenciaTecnica: false,
        hostTipo: "DOCENTE"
      }
    );

    // El docente tiene cuenta Google vinculada
    expect(createdCohostReuniones.map((c) => c.cuentaGoogleId)).toContain("google-docente-1");
    // El actor tiene email principal agregado a manual emails
    expect(createdCohostEmails.map((c) => c.email)).toContain("admin@flacso.edu.uy");
  });

  it("con asistencia tecnica y asistente asignado: agrega al solicitante y al asistente como cohosts", async () => {
    const { db, createdCohostReuniones, createdCohostEmails } = createMockDb();

    await crearReuniones(
      db as never,
      { id: "actor-user-admin", rol: "ADMINISTRACION" },
      {
        ...baseInput,
        requiereAsistenciaTecnica: true,
        asistenteTecnicoId: "asistente-1"
      }
    );

    const assignedIds = createdCohostReuniones.map((c) => c.cuentaGoogleId);
    expect(assignedIds).toContain("google-asistente-1");
    expect(assignedIds).toContain("google-actor-1");
    expect(assignedIds).not.toContain("google-docente-1");
    expect(createdCohostEmails).toHaveLength(0);
  });

  it("con asistencia tecnica pendiente: mantiene al solicitante como cohost", async () => {
    const { db, createdCohostReuniones, createdCohostEmails } = createMockDb();

    await crearReuniones(
      db as never,
      { id: "actor-user-admin", rol: "ADMINISTRACION" },
      {
        ...baseInput,
        requiereAsistenciaTecnica: true
        // sin asistenteTecnicoId -> abierta
      }
    );

    expect(createdCohostReuniones.map((c) => c.cuentaGoogleId)).toContain("google-actor-1");
    expect(createdCohostEmails).toHaveLength(0);
  });

  it("con asistencia tecnica: usa el email principal del solicitante como fallback", async () => {
    const { db, createdCohostReuniones, createdCohostEmails } = createMockDb({ actorGoogleAccounts: [] });

    await crearReuniones(
      db as never,
      { id: "actor-user-admin", rol: "ADMINISTRACION" },
      { ...baseInput, requiereAsistenciaTecnica: true, asistenteTecnicoId: "asistente-1" }
    );

    expect(createdCohostReuniones.map((c) => c.cuentaGoogleId)).toContain("google-asistente-1");
    expect(createdCohostEmails.map((c) => c.email)).toContain("admin@flacso.edu.uy");
  });
});
