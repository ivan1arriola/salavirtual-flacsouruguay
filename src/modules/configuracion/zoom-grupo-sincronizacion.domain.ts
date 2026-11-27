import { esCuentaAsignable } from "../reuniones/cuenta-asignable.domain";

export type MiembroGrupoZoom = Readonly<{
  id: string;
  email: string;
  nombre: string;
  licenciado: boolean;
}>;

export type CuentaZoomActual = Readonly<{
  id: string;
  emailOrganizador: string | null;
  externalAccountId: string | null;
  activa: boolean;
  tieneLicencia: boolean;
  fueraDelGrupoAt: Date | null;
  prioridad: number;
}>;

export type PlanSincronizacionZoom = Readonly<{
  crear: readonly Readonly<{ miembro: MiembroGrupoZoom; prioridad: number }>[];
  actualizar: readonly Readonly<{
    cuentaId: string;
    miembro: MiembroGrupoZoom;
    reactivar: boolean;
  }>[];
  desactivar: readonly string[];
  marcarFuera: readonly Readonly<{ cuentaId: string; reunionesFuturas: number }>[];
  /** Miembros que Zoom no informa como licenciados: sus cuentas no reciben reuniones nuevas. */
  sinLicencia: readonly MiembroGrupoZoom[];
  /** Cuentas que hoy tienen licencia y con esta sincronización pasan a sin licencia. */
  pierdenLicencia: readonly Readonly<{ cuentaId: string; miembro: MiembroGrupoZoom }>[];
  resumen: string;
}>;

/** Cuántas de las cuentas que hoy reciben reuniones nuevas dejarían de recibirlas. */
export type RiesgoSincronizacionZoom = Readonly<{
  masivo: boolean;
  afectadas: number;
  asignables: number;
}>;

const PRIORIDAD_INICIAL = 100;

function normalizar(email: string): string {
  return email.trim().toLowerCase();
}

function plural(n: number, singular: string, pluralForma: string): string {
  return `${n} ${n === 1 ? singular : pluralForma}`;
}

/**
 * Plan para que las cuentas Zoom reflejen el grupo. Cada miembro se empareja primero por su id
 * de Zoom (`externalAccountId`, sobrevive a un cambio de correo) y si no, por correo (cuentas
 * cargadas antes de la sincronización); ninguna cuenta se empareja dos veces. El grupo vacío lo
 * rechaza quien llama: con cero miembros este plan desactivaría todas las cuentas.
 */
export function planificarSincronizacionGrupoZoom(
  miembros: readonly MiembroGrupoZoom[],
  cuentas: readonly CuentaZoomActual[],
  reunionesFuturasPorCuenta: Readonly<Record<string, number>>,
): PlanSincronizacionZoom {
  // Un correo repetido en el grupo cuenta una sola vez: gana el primero.
  const unicos = miembros.filter(
    (miembro, indice) =>
      miembros.findIndex((otro) => normalizar(otro.email) === normalizar(miembro.email)) === indice,
  );

  const porId = unicos.map((miembro) => ({
    miembro,
    cuenta: cuentas.find((cuenta) => cuenta.externalAccountId === miembro.id) ?? null,
  }));
  const tomadasPorId = new Set(porId.flatMap(({ cuenta }) => (cuenta ? [cuenta.id] : [])));
  const libres = cuentas.filter((cuenta) => !tomadasPorId.has(cuenta.id));
  const emparejados = porId.map(({ miembro, cuenta }) => ({
    miembro,
    cuenta:
      cuenta ??
      libres.find(
        (libre) =>
          libre.emailOrganizador !== null &&
          normalizar(libre.emailOrganizador) === normalizar(miembro.email),
      ) ??
      null,
  }));

  const primeraPrioridad =
    cuentas.reduce((max, c) => Math.max(max, c.prioridad), PRIORIDAD_INICIAL - 1) + 1;
  const crear = emparejados
    .filter(({ cuenta }) => cuenta === null)
    .map(({ miembro }, indice) => ({ miembro, prioridad: primeraPrioridad + indice }));
  const actualizar = emparejados.flatMap(({ miembro, cuenta }) =>
    cuenta ? [{ cuentaId: cuenta.id, miembro, reactivar: cuenta.fueraDelGrupoAt !== null }] : [],
  );
  const sinLicencia = unicos.filter(({ licenciado }) => !licenciado);
  const pierdenLicencia = emparejados.flatMap(({ miembro, cuenta }) =>
    cuenta?.tieneLicencia && !miembro.licenciado ? [{ cuentaId: cuenta.id, miembro }] : [],
  );

  const enElGrupo = new Set(actualizar.map(({ cuentaId }) => cuentaId));
  const salieron = cuentas
    .filter((cuenta) => !enElGrupo.has(cuenta.id))
    .filter((cuenta) => cuenta.activa || cuenta.fueraDelGrupoAt === null)
    .map((cuenta) => ({
      cuentaId: cuenta.id,
      reunionesFuturas: reunionesFuturasPorCuenta[cuenta.id] ?? 0,
    }));
  const desactivar = salieron
    .filter(({ reunionesFuturas }) => reunionesFuturas === 0)
    .map(({ cuentaId }) => cuentaId);
  const marcarFuera = salieron.filter(({ reunionesFuturas }) => reunionesFuturas > 0);

  const resumen = [
    plural(crear.length, "nueva", "nuevas"),
    plural(desactivar.length, "desactivada", "desactivadas"),
    `${marcarFuera.length} fuera del grupo con reuniones`,
    ...(sinLicencia.length > 0 ? [avisoLicencias(sinLicencia.length, pierdenLicencia.length)] : []),
  ].join(", ");

  return { crear, actualizar, desactivar, marcarFuera, sinLicencia, pierdenLicencia, resumen };
}

function avisoLicencias(sinLicencia: number, pierden: number): string {
  const detalle = pierden > 0 ? ` (${plural(pierden, "pasa", "pasan")} a sin licencia)` : "";
  return `${sinLicencia} sin licencia${detalle}`;
}

/**
 * Una sincronización es masiva cuando deja sin reuniones nuevas (desactiva o marca fuera del
 * grupo) a más de la mitad de las cuentas que hoy las reciben. Solo cuentan las cuentas
 * asignables ahora: las que ya estaban fuera del grupo con reuniones reaparecen en `marcarFuera`
 * en cada pasada y no deben volver masiva cada sincronización.
 */
export function evaluarRiesgoSincronizacion(
  plan: Pick<PlanSincronizacionZoom, "desactivar" | "marcarFuera">,
  cuentas: readonly CuentaZoomActual[],
): RiesgoSincronizacionZoom {
  const asignables = cuentas.filter(esCuentaAsignable).map(({ id }) => id);
  const salen = new Set([...plan.desactivar, ...plan.marcarFuera.map(({ cuentaId }) => cuentaId)]);
  const afectadas = asignables.filter((id) => salen.has(id)).length;
  return { masivo: afectadas * 2 > asignables.length, afectadas, asignables: asignables.length };
}

/** Aviso legible de una sincronización masiva: «… (X de Y).» */
export function avisoSincronizacionMasiva(riesgo: RiesgoSincronizacionZoom): string {
  return `Esta sincronización cambiaría muchas cuentas (${riesgo.afectadas} de ${riesgo.asignables}).`;
}
