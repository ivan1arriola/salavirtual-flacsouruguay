import type { WorkspaceScopeAccountValidation } from "./workspace-config.client";

/** Titular y detalle del resultado; sin cuentas validadas nunca afirma que todo está autorizado. */
export function resumirValidacionScopes(accounts: readonly WorkspaceScopeAccountValidation[]) {
  if (accounts.length === 0) {
    return {
      ok: false,
      titulo: "No se pudo validar ninguna cuenta",
      detalle: "Revisá que el usuario delegado y la credencial principal estén guardados."
    } as const;
  }
  const correctas = accounts.filter(({ ok }) => ok).length;
  const faltantes = accounts.flatMap(({ scopes }) => scopes.filter(({ autorizado }) => !autorizado)).length;
  return {
    ok: faltantes === 0 && correctas === accounts.length,
    titulo: `${correctas}/${accounts.length} cuentas correctas`,
    detalle:
      faltantes === 0
        ? "Todos los permisos requeridos están autorizados."
        : `${faltantes} autorizaciones requieren atención.`
  } as const;
}
