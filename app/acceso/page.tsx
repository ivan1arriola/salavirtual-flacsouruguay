import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { authConfig } from "@/src/lib/auth/config";
import { iniciarSesionGoogle, iniciarSesionLocal } from "./actions";

const MENSAJES_ERROR: Readonly<Record<string, string>> = Object.freeze({
  CredentialsSignin: "El usuario o la contrasena no son correctos.",
  AccessDenied: "La cuenta no tiene acceso autorizado.",
  OAuthCallbackError: "No se pudo completar el acceso con Google."
});

export default async function AccesoPage({
  searchParams
}: Readonly<{ searchParams: Promise<{ error?: string }> }>) {
  const session = await auth();
  if (session?.user) redirect("/");

  const { error } = await searchParams;
  const mensaje = error
    ? MENSAJES_ERROR[error] ?? "No se pudo iniciar sesion."
    : null;

  return (
    <main className="login-shell">
      <section className="login-panel" aria-labelledby="login-title">
        <header className="login-header">
          <p className="eyebrow">FLACSO Uruguay</p>
          <h1 id="login-title">Gestor Google Meet</h1>
          <p>Ingresá con tu usuario o una cuenta institucional autorizada.</p>
        </header>

        {mensaje ? (
          <p className="login-error" role="alert">
            {mensaje}
          </p>
        ) : null}

        <form className="login-form" action={iniciarSesionLocal}>
          <label htmlFor="usuario">Usuario</label>
          <input
            id="usuario"
            name="usuario"
            type="text"
            autoComplete="username"
            required
          />

          <label htmlFor="password">Contraseña</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />

          <button type="submit">Ingresar</button>
        </form>

        {authConfig.google ? (
          <>
            <div className="login-separator">
              <span>o</span>
            </div>
            <form action={iniciarSesionGoogle}>
              <button className="google-button" type="submit">
                Continuar con Google
              </button>
            </form>
          </>
        ) : null}
      </section>
    </main>
  );
}
