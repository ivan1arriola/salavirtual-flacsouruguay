export const CUENTA_ZOOM_ASIGNABLE = { activa: true, tieneLicencia: true, fueraDelGrupoAt: null } as const;

type CuentaLeida = Readonly<{
  activa: boolean;
  tieneLicencia: boolean;
  fueraDelGrupoAt?: Date | string | null;
}>;

/** `CUENTA_ZOOM_ASIGNABLE` aplicado a una cuenta ya leída. Las cuentas Meet nunca están fuera del grupo. */
export function esCuentaAsignable(cuenta: CuentaLeida): boolean {
  return (
    cuenta.activa === CUENTA_ZOOM_ASIGNABLE.activa &&
    cuenta.tieneLicencia === CUENTA_ZOOM_ASIGNABLE.tieneLicencia &&
    (cuenta.fueraDelGrupoAt ?? null) === CUENTA_ZOOM_ASIGNABLE.fueraDelGrupoAt
  );
}
