import { buscarRolAnterior, type RolUsuario } from "../usuarios/roles";

export type CuentaGoogleLegacy = Readonly<{
  providerAccountId: string;
}>;

export type UsuarioLegacy = Readonly<{
  id: string;
  firstName: string | null;
  lastName: string | null;
  name: string | null;
  email: string;
  emailVerified: Date | null;
  image: string | null;
  passwordHash: string | null;
  role: string;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date | null;
  lastLoginIp: string | null;
  lastLoginUserAgent: string | null;
  lastLoginProvider: string | null;
  emailAliases: readonly Readonly<{ email: string }>[];
  accounts: readonly CuentaGoogleLegacy[];
  docenteProfile: Readonly<{
    documentoIdentidad: string | null;
    observaciones: string | null;
  }> | null;
  asistenteProfile: Readonly<{
    aliasOperativo: string | null;
    disponibleGeneral: boolean;
    datosPago: string | null;
  }> | null;
}>;

export type PlanUsuarioMigrado = Readonly<{
  legacyZoomUserId: string;
  usuarioId: string;
  nombres: string;
  apellidos: string | null;
  emailPrincipal: string;
  emailVerificadoAt: Date | null;
  imagenUrl: string | null;
  passwordHash: string | null;
  rol: RolUsuario;
  ultimoAccesoAt: Date | null;
  ultimoAccesoIp: string | null;
  ultimoAccesoAgente: string | null;
  ultimoProveedor: string | null;
  createdAt: Date;
  updatedAt: Date;
  aliases: readonly string[];
  cuentasGoogle: readonly CuentaGoogleLegacy[];
  docente: UsuarioLegacy["docenteProfile"];
  asistenteTecnico: UsuarioLegacy["asistenteProfile"];
  cuentasGoogleOmitidas: number;
}>;

function textoOpcional(value: string | null): string | null {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

export function crearUsuarioIdBase(email: string): string {
  const localPart = email.split("@")[0] ?? "";
  const normalized = localPart
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, ".")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 42);

  return normalized.length >= 3 ? normalized : `usuario.${normalized || "legacy"}`;
}

function siguienteUsuarioId(base: string, reservados: ReadonlySet<string>): string {
  if (!reservados.has(base)) {
    return base;
  }

  const suffix = Array.from({ length: 999 }, (_, index) => index + 2).find(
    (number) => !reservados.has(`${base}-${number}`)
  );
  if (!suffix) {
    throw new Error(`No se pudo generar un usuario unico para ${base}.`);
  }
  return `${base}-${suffix}`;
}

export function planificarMigracionUsuarios(
  usuarios: readonly UsuarioLegacy[],
  idsReservados: ReadonlySet<string>,
  idsExistentesPorLegacy: ReadonlyMap<string, string>
): readonly PlanUsuarioMigrado[] {
  return usuarios.reduce<
    Readonly<{
      planes: readonly PlanUsuarioMigrado[];
      reservados: ReadonlySet<string>;
    }>
  >(
    (state, usuario) => {
      const base = crearUsuarioIdBase(usuario.email);
      const usuarioId = idsExistentesPorLegacy.get(usuario.id) ?? siguienteUsuarioId(base, state.reservados);
      const emailPrincipal = usuario.email.trim().toLowerCase();
      const aliases = usuario.emailAliases.map(({ email }) => email.trim().toLowerCase());
      const emailsFlacso = [emailPrincipal, ...aliases].filter((email) => email.endsWith("@flacso.edu.uy"));
      const cuentasGoogle = usuario.accounts.filter((_, index) => Boolean(emailsFlacso[index]));
      const plan: PlanUsuarioMigrado = {
        legacyZoomUserId: usuario.id,
        usuarioId,
        nombres: textoOpcional(usuario.firstName) ?? textoOpcional(usuario.name) ?? usuarioId,
        apellidos: textoOpcional(usuario.lastName),
        emailPrincipal,
        emailVerificadoAt: usuario.emailVerified,
        imagenUrl: usuario.image,
        passwordHash: usuario.passwordHash,
        rol: buscarRolAnterior(usuario.role) ?? "DOCENTE",
        ultimoAccesoAt: usuario.lastLoginAt,
        ultimoAccesoIp: usuario.lastLoginIp,
        ultimoAccesoAgente: usuario.lastLoginUserAgent,
        ultimoProveedor: usuario.lastLoginProvider,
        createdAt: usuario.createdAt,
        updatedAt: usuario.updatedAt,
        aliases,
        cuentasGoogle,
        docente: usuario.docenteProfile,
        asistenteTecnico: usuario.asistenteProfile,
        cuentasGoogleOmitidas: usuario.accounts.length - cuentasGoogle.length
      };

      return {
        planes: [...state.planes, plan],
        reservados: new Set([...state.reservados, usuarioId])
      };
    },
    { planes: [], reservados: new Set(idsReservados) }
  ).planes;
}
