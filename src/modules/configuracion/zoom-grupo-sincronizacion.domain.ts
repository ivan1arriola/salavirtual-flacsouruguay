export type MiembroGrupoZoom = Readonly<{ id: string; email: string; nombre: string; licenciado: boolean }>;

export type CuentaZoomActual = Readonly<{
  id: string;
  emailOrganizador: string | null;
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

export class GrupoZoomVacioError extends Error {
  constructor(message = "El grupo de Zoom no tiene miembros.") {
    super(message);
    this.name = "GrupoZoomVacioError";
  }
}

const PRIORIDAD_INICIAL = 100;

function normalizar(email: string): string {
  return email.trim().toLowerCase();
}

function plural(n: number, singular: string, pluralForma: string): string {
  return `${n} ${n === 1 ? singular : pluralForma}`;
}

export function planificarSincronizacionGrupoZoom(
  miembros: readonly MiembroGrupoZoom[],
  cuentas: readonly CuentaZoomActual[],
  reunionesFuturasPorCuenta: Readonly<Record<string, number>>
): PlanSincronizacionZoom {
  if (miembros.length === 0) throw new GrupoZoomVacioError();

  const miembrosPorEmail = new Map<string, MiembroGrupoZoom>();
  for (const m of miembros) {
    const clave = normalizar(m.email);
    if (!miembrosPorEmail.has(clave)) miembrosPorEmail.set(clave, m);
  }

  const cuentasPorEmail = new Map<string, CuentaZoomActual>();
  for (const c of cuentas) {
    if (c.emailOrganizador === null) continue;
    const clave = normalizar(c.emailOrganizador);
    if (!cuentasPorEmail.has(clave)) cuentasPorEmail.set(clave, c);
  }

  let proxima = cuentas.reduce((max, c) => Math.max(max, c.prioridad), PRIORIDAD_INICIAL - 1) + 1;
  const crear: { miembro: MiembroGrupoZoom; prioridad: number }[] = [];
  const actualizar: { cuentaId: string; miembro: MiembroGrupoZoom; reactivar: boolean }[] = [];

  for (const [clave, miembro] of miembrosPorEmail) {
    const existente = cuentasPorEmail.get(clave);
    if (existente) {
      actualizar.push({
        cuentaId: existente.id,
        miembro,
        reactivar: !existente.activa || existente.fueraDelGrupoAt !== null
      });
    } else {
      crear.push({ miembro, prioridad: proxima++ });
    }
  }

  const desactivar: string[] = [];
  const marcarFuera: { cuentaId: string; reunionesFuturas: number }[] = [];

  for (const c of cuentas) {
    const dentro = c.emailOrganizador !== null && miembrosPorEmail.has(normalizar(c.emailOrganizador));
    if (dentro) continue;
    if (!c.activa && c.fueraDelGrupoAt !== null) continue;
    const futuras = reunionesFuturasPorCuenta[c.id] ?? 0;
    if (futuras > 0) marcarFuera.push({ cuentaId: c.id, reunionesFuturas: futuras });
    else desactivar.push(c.id);
  }

  const resumen = [
    plural(crear.length, "nueva", "nuevas"),
    plural(desactivar.length, "desactivada", "desactivadas"),
    `${marcarFuera.length} fuera del grupo con reuniones`
  ].join(", ");

  return { crear, actualizar, desactivar, marcarFuera, resumen };
}
