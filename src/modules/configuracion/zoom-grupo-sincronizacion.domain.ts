export type MiembroGrupoZoom = Readonly<{ id: string; email: string; nombre: string; licenciado: boolean }>;

export type CuentaZoomActual = Readonly<{
  id: string;
  emailOrganizador: string | null;
  externalAccountId: string | null;
  activa: boolean;
  fueraDelGrupoAt: Date | null;
  prioridad: number;
}>;

export type PlanSincronizacionZoom = Readonly<{
  crear: readonly Readonly<{ miembro: MiembroGrupoZoom; prioridad: number }>[];
  actualizar: readonly Readonly<{ cuentaId: string; miembro: MiembroGrupoZoom; reactivar: boolean }>[];
  desactivar: readonly string[];
  marcarFuera: readonly Readonly<{ cuentaId: string; reunionesFuturas: number }>[];
  resumen: string;
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
  reunionesFuturasPorCuenta: Readonly<Record<string, number>>
): PlanSincronizacionZoom {
  // Un correo repetido en el grupo cuenta una sola vez: gana el primero.
  const unicos = miembros.filter(
    (miembro, indice) => miembros.findIndex((otro) => normalizar(otro.email) === normalizar(miembro.email)) === indice
  );

  const porId = unicos.map((miembro) => ({
    miembro,
    cuenta: cuentas.find((cuenta) => cuenta.externalAccountId === miembro.id) ?? null
  }));
  const tomadasPorId = new Set(porId.flatMap(({ cuenta }) => (cuenta ? [cuenta.id] : [])));
  const libres = cuentas.filter((cuenta) => !tomadasPorId.has(cuenta.id));
  const emparejados = porId.map(({ miembro, cuenta }) => ({
    miembro,
    cuenta:
      cuenta ??
      libres.find(
        (libre) => libre.emailOrganizador !== null && normalizar(libre.emailOrganizador) === normalizar(miembro.email)
      ) ??
      null
  }));

  const primeraPrioridad = cuentas.reduce((max, c) => Math.max(max, c.prioridad), PRIORIDAD_INICIAL - 1) + 1;
  const crear = emparejados
    .filter(({ cuenta }) => cuenta === null)
    .map(({ miembro }, indice) => ({ miembro, prioridad: primeraPrioridad + indice }));
  const actualizar = emparejados.flatMap(({ miembro, cuenta }) =>
    cuenta ? [{ cuentaId: cuenta.id, miembro, reactivar: cuenta.fueraDelGrupoAt !== null }] : []
  );

  const enElGrupo = new Set(actualizar.map(({ cuentaId }) => cuentaId));
  const salieron = cuentas
    .filter((cuenta) => !enElGrupo.has(cuenta.id))
    .filter((cuenta) => cuenta.activa || cuenta.fueraDelGrupoAt === null)
    .map((cuenta) => ({ cuentaId: cuenta.id, reunionesFuturas: reunionesFuturasPorCuenta[cuenta.id] ?? 0 }));
  const desactivar = salieron.filter(({ reunionesFuturas }) => reunionesFuturas === 0).map(({ cuentaId }) => cuentaId);
  const marcarFuera = salieron.filter(({ reunionesFuturas }) => reunionesFuturas > 0);

  const resumen = [
    plural(crear.length, "nueva", "nuevas"),
    plural(desactivar.length, "desactivada", "desactivadas"),
    `${marcarFuera.length} fuera del grupo con reuniones`
  ].join(", ");

  return { crear, actualizar, desactivar, marcarFuera, resumen };
}
