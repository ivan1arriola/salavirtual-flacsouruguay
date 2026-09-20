import { LockKeyhole } from "lucide-react";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { authConfig } from "@/src/lib/auth/config";
import { RememberedAccounts } from "@/src/components/remembered-accounts";
import { PasswordInput } from "./password-input";

import {
  iniciarSesionGoogle,
  iniciarSesionLocal
} from "./actions";

import "./acceso.css";

const MENSAJES_ERROR: Readonly<Record<string, string>> = Object.freeze({
  CredentialsSignin: "El usuario o la contraseña no son correctos.",
  AccessDenied: "Esta cuenta no tiene acceso autorizado.",
  Configuration:
    "Tu solicitud de acceso fue registrada y deberá ser autorizada.",
  OAuthCallbackError:
    "Tu solicitud de acceso fue registrada y deberá ser autorizada."
});

type AccesoPageProps = Readonly<{
  searchParams: Promise<{
    error?: string;
    usuario?: string;
    cambiar?: string;
    restablecida?: string;
  }>;
}>;

export default async function AccesoPage({
  searchParams
}: AccesoPageProps) {
  const session = await auth();

  if (session?.user) {
    redirect("/");
  }

  const {
    error,
    usuario,
    cambiar,
    restablecida
  } = await searchParams;

  const mensaje = error
    ? MENSAJES_ERROR[error] ?? "No se pudo iniciar sesión."
    : null;

  return (
    <main className="login-shell">
      <section
        className="login-card"
        aria-labelledby="login-title"
      >
        <header className="login-header">
          <a
            className="login-logo-link"
            href="https://flacso.edu.uy/"
            target="_blank"
            rel="noreferrer"
            aria-label="FLACSO Uruguay"
          >
            <img
              className="login-logo"
              src="https://flacso.edu.uy/wp-content/uploads/2026/04/cropped-flacso_20_anos_horizontal_azul.png"
              alt="FLACSO Uruguay"
              width="842"
              height="336"
            />
          </a>

          <div className="login-product">
            <span className="login-product-icon">
              <LockKeyhole size={18} />
            </span>

            <div>
              <p>Sala Virtual FLACSO</p>
              <h1 id="login-title">Iniciar sesión</h1>
            </div>
          </div>
        </header>

        {cambiar === "1" ? (
          <RememberedAccounts />
        ) : null}

        {mensaje ? (
          <p className="login-error" role="alert">
            {mensaje}
          </p>
        ) : null}

        {restablecida === "1" ? (
          <p className="login-success" role="status">
            Tu contraseña fue actualizada.
          </p>
        ) : null}

        {authConfig.google ? (
          <>
            <form action={iniciarSesionGoogle}>
              <button
                className="login-google-button"
                type="submit"
              >
                <GoogleMark />
                Continuar con Google
              </button>
            </form>

            <div className="login-separator">
              <span>o</span>
            </div>
          </>
        ) : null}

        <form
          className="login-form"
          action={iniciarSesionLocal}
        >
          <div className="login-field">
            <label htmlFor="usuario">
              Usuario o correo
            </label>

            <input
              id="usuario"
              name="usuario"
              type="text"
              autoComplete="username"
              placeholder="usuario@flacso.edu.uy"
              defaultValue={usuario ?? ""}
              required
            />
          </div>

          <div className="login-field">
            <div className="login-password-heading">
              <label htmlFor="password">
                Contraseña
              </label>

              <a
                className="login-inline-link"
                href="/recuperar-contrasena"
              >
                ¿Olvidaste tu contraseña?
              </a>
            </div>

            <PasswordInput />
          </div>

          <button
            className="login-submit-button"
            type="submit"
          >
            Ingresar
          </button>
        </form>
      </section>
    </main>
  );
}

function GoogleMark() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="19"
      height="19"
    >
      <path
        fill="#4285F4"
        d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.4a4.6 4.6 0 0 1-2 3v2.6h3.3c1.9-1.8 2.9-4.4 2.9-7.5Z"
      />

      <path
        fill="#34A853"
        d="M12 22c2.7 0 5-.9 6.7-2.3l-3.3-2.6c-.9.6-2.1 1-3.4 1-2.6 0-4.8-1.8-5.6-4.2H3v2.7A10 10 0 0 0 12 22Z"
      />

      <path
        fill="#FBBC05"
        d="M6.4 13.9a6 6 0 0 1 0-3.8V7.4H3a10 10 0 0 0 0 9.2l3.4-2.7Z"
      />

      <path
        fill="#EA4335"
        d="M12 5.9c1.5 0 2.9.5 3.9 1.5l2.9-2.9A9.8 9.8 0 0 0 3 7.4l3.4 2.7C7.2 7.7 9.4 5.9 12 5.9Z"
      />
    </svg>
  );
}
