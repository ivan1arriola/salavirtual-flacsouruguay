"use client";

import { useState } from "react";
import { signIn, signOut } from "next-auth/react";
import { iniciarGoogleConSesionLimpia } from "@/src/lib/auth/google-login-browser-flow";

export function GoogleLoginButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  async function iniciar() {
    if (pending) return;
    setPending(true);
    setError(false);
    try {
      // signOut y signIn deben ser HTTP independientes, no una Server Action.
      await iniciarGoogleConSesionLimpia(signOut, signIn);
    } catch {
      setError(true);
      setPending(false);
    }
  }

  return (
    <>
      {error ? (
        <p className="login-error" role="alert">
          No se pudo iniciar el acceso con Google. Volvé a intentarlo.
        </p>
      ) : null}
      <button
        className="login-google-button"
        type="button"
        disabled={pending}
        onClick={iniciar}
      >
        <GoogleMark />
        {pending ? "Conectando con Google…" : "Continuar con Google"}
      </button>
    </>
  );
}

function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="19" height="19">
      <path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.4a4.6 4.6 0 0 1-2 3v2.6h3.3c1.9-1.8 2.9-4.4 2.9-7.5Z" />
      <path fill="#34A853" d="M12 22c2.7 0 5-.9 6.7-2.3l-3.3-2.6c-.9.6-2.1 1-3.4 1-2.6 0-4.8-1.8-5.6-4.2H3v2.7A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.4 13.9a6 6 0 0 1 0-3.8V7.4H3a10 10 0 0 0 0 9.2l3.4-2.7Z" />
      <path fill="#EA4335" d="M12 5.9c1.5 0 2.9.5 3.9 1.5l2.9-2.9A9.8 9.8 0 0 0 3 7.4l3.4 2.7C7.2 7.7 9.4 5.9 12 5.9Z" />
    </svg>
  );
}
