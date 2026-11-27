import { KeyRound, Mail } from "lucide-react";
import { solicitarRecuperacion } from "./actions";
import "../acceso/acceso.css";

export default async function RecuperarContrasenaPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ enviado?: string }> }>) {
  const { enviado } = await searchParams;

  return (
    <main className="login-shell">
      <section className="login-experience" aria-labelledby="recovery-title">
        <aside className="login-brand-panel">
          <a
            className="login-logo-wrap"
            href="https://flacso.edu.uy/"
            target="_blank"
            rel="noreferrer"
          >
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
            <h2>Recuperá el acceso de forma segura.</h2>
            <p>
              Te enviaremos un enlace temporal al correo asociado a tu cuenta para que puedas elegir
              una nueva contraseña.
            </p>
          </div>
          <ul className="login-feature-list" aria-label="Características de recuperación">
            <li>
              <Mail size={19} />
              <span>
                <strong>Por correo</strong>
                <small>Al email de tu cuenta</small>
              </span>
            </li>
            <li>
              <KeyRound size={19} />
              <span>
                <strong>Enlace temporal</strong>
                <small>Válido por 30 minutos</small>
              </span>
            </li>
            <li>
              <KeyRound size={19} />
              <span>
                <strong>Un solo uso</strong>
                <small>Se invalida al utilizarlo</small>
              </span>
            </li>
          </ul>
          <p className="login-brand-footer">
            FLACSO Uruguay · Facultad Latinoamericana de Ciencias Sociales
          </p>
        </aside>

        <div className="login-panel">
          <div className="login-panel-inner">
            <header className="login-header">
              <span className="login-lock">
                <KeyRound size={20} />
              </span>
              <p className="eyebrow">Sala Virtual FLACSO</p>
              <h1 id="recovery-title">Recuperar contraseña</h1>
              <p>Ingresá el correo asociado a tu cuenta.</p>
            </header>

            {enviado === "1" ? (
              <p className="login-success" role="status">
                Si existe una cuenta asociada a ese correo, recibirás un enlace para restablecer tu
                contraseña. Revisá también la carpeta de spam.
              </p>
            ) : (
              <form className="login-form" action={solicitarRecuperacion}>
                <label htmlFor="email">Correo electrónico</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="usuario@flacso.edu.uy"
                  required
                />
                <button className="login-submit-button" type="submit">
                  Enviar enlace
                </button>
              </form>
            )}

            <p className="login-help">
              <a className="login-inline-link" href="/acceso">
                Volver al inicio de sesión
              </a>
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
