/**
 * Iniciar un nuevo OAuth Google en el navegador requiere dos solicitudes:
 * primero invalidar la cookie JWT vieja, después abrir el flujo OAuth.
 * Ejecutar ambas operaciones en una sola Server Action puede dejar cookies
 * de sesión antiguas cuando el cliente sigue redirecciones.
 */
export async function iniciarGoogleConSesionLimpia(
  cerrarSesion: (options: { redirect: false }) => Promise<unknown>,
  iniciarSesion: (
    provider: "google",
    options: { redirectTo: "/" },
    authorizationParams?: { login_hint: string }
  ) => Promise<unknown>,
  loginHint?: string
): Promise<void> {
  await cerrarSesion({ redirect: false });
  const hint = loginHint?.trim();
  await iniciarSesion("google", { redirectTo: "/" }, hint ? { login_hint: hint } : undefined);
}
