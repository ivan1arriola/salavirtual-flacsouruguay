import { KeyRound, ShieldCheck } from "lucide-react";
import { guardarNuevaPassword } from "./actions";
import "../acceso/acceso.css";

const MENSAJES_ERROR: Readonly<Record<string, string>> = Object.freeze({
  datos: "Revisá la contraseña: debe tener entre 8 y 72 caracteres y ambas entradas deben coincidir.",
  token: "El enlace de recuperación no es válido, ya fue utilizado o venció. Solicitá uno nuevo."
});

export default async function RestablecerContrasenaPage({
  searchParams
}: Readonly<{ searchParams: Promise<{ token?: string; error?: string }> }>) {
  const { token = "", error } = await searchParams;
  const mensaje = error ? MENSAJES_ERROR[error] : null;

  return (
    <main className="login-shell">
      <section className="login-experience" aria-labelledby="reset-title">
        <aside className="login-brand-panel">
          <a className="login-logo-wrap" href="https://flacso.edu.uy/" target="_blank" rel="noreferrer">
            <img
              className="login-logo"
              src="https://flacso.edu.uy/wp-content/uploads/2026/04/cropped-flacso_20_anos_horizontal_azul.png"
              alt="FLACSO Uruguay"
              width="842"
              height="336"
            />
          </a>
          <div className="login-brand-copy">
            <p className="login-product-label">Seguridad de la cuenta</p>
            <h2>Elegí una nueva contraseña.</h2>
            <p>El enlace recibido por correo es temporal y se invalida automáticamente después de usarlo.</p>
          </div>
          <ul className="login-feature-list" aria-label="Características de seguridad">
            <li>
              <ShieldCheck size={19} />
              <span>
                <strong>Protegida</strong>
                <small>Hash seguro con bcrypt</small>
              </span>
            </li>
            <li>
              <KeyRound size={19} />
              <span>
                <strong>8 caracteres</strong>
                <small>Mínimo requerido</small>
              </span>
            </li>
            <li>
              <KeyRound size={19} />
              <span>
                <strong>Un solo uso</strong>
                <small>El enlace queda invalidado</small>
              </span>
            </li>
          </ul>
          <p className="login-brand-footer">FLACSO Uruguay · Facultad Latinoamericana de Ciencias Sociales</p>
        </aside>

        <div className="login-panel">
          <div className="login-panel-inner">
            <header className="login-header">
              <span className="login-lock">
                <KeyRound size={20} />
              </span>
              <p className="eyebrow">Sala Virtual FLACSO</p>
              <h1 id="reset-title">Nueva contraseña</h1>
              <p>Ingresala dos veces para confirmar el cambio.</p>
            </header>

            {mensaje ? (
              <p className="login-error" role="alert">
                {mensaje}
              </p>
            ) : null}

            {token ? (
              <form className="login-form" action={guardarNuevaPassword}>
                <input type="hidden" name="token" value={token} />
                <label htmlFor="passwordNueva">Nueva contraseña</label>
                <input
                  id="passwordNueva"
                  name="passwordNueva"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={72}
                  required
                />
                <label htmlFor="confirmarPassword">Confirmar contraseña</label>
                <input
                  id="confirmarPassword"
                  name="confirmarPassword"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={72}
                  required
                />
                <button className="login-submit-button" type="submit">
                  Guardar nueva contraseña
                </button>
              </form>
            ) : (
              <p className="login-error" role="alert">
                Falta el token de recuperación. Solicitá un nuevo enlace.
              </p>
            )}

            <p className="login-help">
              <a className="login-inline-link" href="/recuperar-contrasena">
                Solicitar un nuevo enlace
              </a>
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
