import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { authConfig } from "@/src/lib/auth/config";
import { RememberedAccounts } from "@/src/components/remembered-accounts";
import { iniciarSesionGoogle, iniciarSesionLocal } from "./actions";

const MENSAJES_ERROR: Readonly<Record<string, string>> = Object.freeze({
  CredentialsSignin: "El usuario o la contrasena no son correctos.",
  AccessDenied: "La cuenta no tiene acceso autorizado.",
  OAuthCallbackError: "No se pudo completar el acceso con Google."
});

export default async function AccesoPage({
  searchParams
}: Readonly<{ searchParams: Promise<{ error?: string; usuario?: string; cambiar?: string }> }>) {
  const session = await auth();
  if (session?.user) redirect("/");

  const { error, usuario, cambiar } = await searchParams;
  const mensaje = error
    ? MENSAJES_ERROR[error] ?? "No se pudo iniciar sesion."
    : null;

  return (
    <main className="login-shell">
      <section className="login-panel" aria-labelledby="login-title">
        <header className="login-header">
          <p className="eyebrow">FLACSO Uruguay</p>
          <h1 id="login-title">FLACSO Meet</h1>
          <p>Ingresá con tu usuario o con cualquier cuenta institucional @flacso.edu.uy.</p>
        </header>

        {cambiar === "1" ? <RememberedAccounts /> : null}

        {mensaje ? (
          <p className="login-error" role="alert">
            {mensaje}
          </p>
        ) : null}

        <form className="login-form" action={iniciarSesionLocal}>
          <label htmlFor="usuario">Usuario o correo</label>
          <input
            id="usuario"
            name="usuario"
            type="text"
            autoComplete="username"
            placeholder="usuario@flacso.edu.uy"
            defaultValue={usuario ?? ""}
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
