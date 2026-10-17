import type { PrismaClient } from "@prisma/client";
import { normalizeCohostEmails } from "@/src/modules/conferencias/api";

export const COHOST_VERIFICATION_PAGE_SIZE = 6;

export type VerificacionGlobalEstado =
  | "CONFIRMADA" | "INCOMPLETA" | "NO_VERIFICABLE" | "SIN_COHOSTS";

export type CredencialCohost = Readonly<{
  serviceAccountEmail: string;
  privateKey: string;
}>;

export type CredencialLegacyCohost = CredencialCohost & Readonly<{ id: string }>;

export type ResultadoCohostReunion = Readonly<{
  instanciaSalaId: string;
  titulo: string;
  inicio: string;
  codigoReunion: string | null;
  organizador: string | null;
  estado: VerificacionGlobalEstado;
  total: number;
  confirmados: number;
  faltantes: readonly string[];
  origen: "PRINCIPAL" | "LEGACY" | null;
  intentosLegacy: number;
  error: string | null;
}>;

export type VerificacionGlobalPagina = Readonly<{
  resultados: readonly ResultadoCohostReunion[];
  siguienteCursor: string | null;
}>;

type GoogleMember = Readonly<{ email?: string; role?: string }>;
type Consulta = Readonly<{
  roles: ReadonlySet<string> | null;
  origen: "PRINCIPAL" | "LEGACY" | null;
  intentosLegacy: number;
  error: string | null;
}>;

export type VerificarCohostsGlobalDependencies = Readonly<{
  db: PrismaClient;
  descifrar: (secret: string) => string;
  listarLegacy: () => Promise<readonly CredencialLegacyCohost[]>;
  leerMiembros: (
    credencial: CredencialCohost, organizador: string, codigoReunion: string
  ) => Promise<readonly GoogleMember[]>;
}>;

function estadoHttp(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const candidate = error as { code?: unknown; response?: { status?: unknown } };
  const status = candidate.response?.status ?? candidate.code;
  return typeof status === "number" ? status : typeof status === "string" && /^\d{3}$/.test(status) ? Number(status) : null;
}

function errorLegible(status: number | null): string {
  if (status === 401 || status === 403) return "Google denegó acceso al espacio o a sus miembros.";
  if (status === 404) return "Google no encontró el espacio Meet para la cuenta organizadora.";
  if (status === 429) return "Google limitó temporalmente las consultas.";
  if (status !== null && status >= 500) return "Google Meet no respondió correctamente.";
  return "No se pudo leer la lista de coanfitriones en Google Meet.";
}

export async function verificarCohostsGlobalPagina(
  deps: VerificarCohostsGlobalDependencies,
  cursor?: string,
): Promise<VerificacionGlobalPagina> {
  const rows = await deps.db.instanciaSala.findMany({
    where: {
      estado: { in: ["PROGRAMADA", "EN_CURSO"] },
      finProgramadoAt: { gt: new Date() },
    },
    orderBy: [{ inicioProgramadoAt: "asc" }, { id: "asc" }],
    take: COHOST_VERIFICATION_PAGE_SIZE,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      inicioProgramadoAt: true,
      solicitud: { select: { titulo: true } },
      cohosts: { select: { cuentaGoogle: { select: { email: true } } } },
      cohostEmails: { select: { email: true } },
      eventosProveedor: {
        where: { proveedor: { tipo: "GOOGLE_MEET" } },
        select: { codigoReunion: true, cuentaProveedor: { select: { emailOrganizador: true } } },
        take: 1,
      },
    },
  });

  if (!rows.length) return { resultados: [], siguienteCursor: null };

  const config = await deps.db.configuracionGoogleWorkspace.findUnique({
    where: { id: "principal", activa: true },
    select: { serviceAccountEmail: true, privateKeyCifrada: true },
  });
  if (!config?.serviceAccountEmail || !config.privateKeyCifrada) {
    throw new Error("Google Workspace no tiene una credencial Principal activa.");
  }
  const principal: CredencialCohost = {
    serviceAccountEmail: config.serviceAccountEmail,
    privateKey: deps.descifrar(config.privateKeyCifrada),
  };
  const legacy = await deps.listarLegacy();
  // Meetings that share one space must share one read within the same page.
  const consultas = new Map<string, Promise<Consulta>>();

  async function consultar(organizador: string, codigo: string): Promise<Consulta> {
    const credenciales = [
      { origen: "PRINCIPAL" as const, credencial: principal },
      ...legacy.map((credencial) => ({ origen: "LEGACY" as const, credencial })),
    ];
    let intentosLegacy = 0;
    let lastStatus: number | null = null;
    for (const { origen, credencial } of credenciales) {
      if (origen === "LEGACY") intentosLegacy++;
      try {
        const members = await deps.leerMiembros(credencial, organizador, codigo);
        return {
          roles: new Set(members.filter(({ role }) => role === "COHOST")
            .flatMap(({ email }) => email ? [email.trim().toLowerCase()] : [])),
          origen,
          intentosLegacy,
          error: null,
        };
      } catch (error) {
        lastStatus = estadoHttp(error);
        // Legacy can help with permissions of spaces created by an older
        // project; it must not mask network failures, missing spaces or 5xx.
        if (lastStatus !== 403) break;
      }
    }
    return { roles: null, origen: null, intentosLegacy, error: errorLegible(lastStatus) };
  }

  const resultados = await Promise.all(rows.map(async (meeting): Promise<ResultadoCohostReunion> => {
    const event = meeting.eventosProveedor[0];
    const organizador = event?.cuentaProveedor?.emailOrganizador?.trim().toLowerCase() ?? null;
    const codigoReunion = event?.codigoReunion ?? null;
    const emails = normalizeCohostEmails([
      ...meeting.cohosts.map(({ cuentaGoogle }) => cuentaGoogle.email),
      ...meeting.cohostEmails.map(({ email }) => email),
    ]).filter((email) => email !== organizador);
    const base = {
      instanciaSalaId: meeting.id,
      titulo: meeting.solicitud.titulo,
      inicio: meeting.inicioProgramadoAt.toISOString(),
      codigoReunion,
      organizador,
      total: emails.length,
    };
    if (!emails.length) {
      return { ...base, estado: "SIN_COHOSTS", confirmados: 0, faltantes: [], origen: null, intentosLegacy: 0, error: null };
    }
    if (!organizador || !codigoReunion) {
      return {
        ...base, estado: "NO_VERIFICABLE", confirmados: 0, faltantes: [],
        origen: null, intentosLegacy: 0, error: "Falta el organizador o código Meet del encuentro.",
      };
    }
    const cacheKey = `${organizador}|${codigoReunion}`;
    let consulta = consultas.get(cacheKey);
    if (!consulta) {
      consulta = consultar(organizador, codigoReunion);
      consultas.set(cacheKey, consulta);
    }
    const result = await consulta;
    if (!result.roles) {
      // Unknown is NOT a rejection: we couldn't read Google.
      return {
        ...base, estado: "NO_VERIFICABLE", confirmados: 0, faltantes: [],
        origen: null, intentosLegacy: result.intentosLegacy, error: result.error,
      };
    }
    const faltantes = emails.filter((email) => !result.roles!.has(email));
    return {
      ...base, estado: faltantes.length ? "INCOMPLETA" : "CONFIRMADA",
      confirmados: emails.length - faltantes.length,
      faltantes, origen: result.origen, intentosLegacy: result.intentosLegacy, error: null,
    };
  }));

  return {
    resultados,
    siguienteCursor: rows.length === COHOST_VERIFICATION_PAGE_SIZE ? rows[rows.length - 1].id : null,
  };
}
