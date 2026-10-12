import { LockKeyhole } from "lucide-react";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { authConfig } from "@/src/lib/auth/config";
import { puedeRedirigirAlPanel } from "@/src/lib/auth/login-redirect";
import { db } from "@/src/lib/db";
import { RememberedAccounts } from "@/src/components/remembered-accounts";
import { PasswordInput } from "./password-input";
import { GoogleLoginButton } from "./google-login-button";

import {
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

  // Una cookie JWT puede seguir siendo válida aunque la cuenta ya no exista
  // o haya sido desactivada: nunca redirigir al panel en ese caso.
  if (await puedeRedirigirAlPanel(db, session?.user)) {
    redirect("/");
  }
  if (session?.user) {
    // Solo datos de estado, sin IDs, correos ni cookies en los logs.
    console.warn("[Auth] La pantalla de acceso recibió un JWT sin usuario activo.");
  }

  const {
    error,
    usuario,
    cambiar,
    restablecida
  } = await searchParams;

  const mensaje = error
    ? MENSAJES_ERROR[error] ?? "No se pudo iniciar sesión."
    : session?.user
      ? "Tu sesión anterior ya no está vigente. Iniciá sesión nuevamente."
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
            <GoogleLoginButton />

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

